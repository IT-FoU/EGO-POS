import { prisma } from "@/lib/db/prisma";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { allowsFine, fineKeyForPosAction } from "@/features/access-control/fine-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { createPosPermissionPolicyFromDatabase } from "@/features/access-control/pos-policy-loader";
import {
  evaluatePosPermission,
  type PosPermissionAction,
  type PosPermissionPolicy,
} from "@/features/pos/permissions";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

// Resolve the user's ACTUAL assigned role(s) from the database (not a template
// label). Owners resolve to "owner"; otherwise the highest-privilege assigned
// role template wins, and unknown/custom roles fall back to cashier (least
// privilege) for limit purposes.
async function resolveUserRoleNames(tenant: TenantContext, client: any = db): Promise<string[]> {
  const membership = await client.companyUser.findFirst({
    select: { isOwner: true },
    where: { companyId: tenant.companyId, status: "active", userId: tenant.userId },
  });
  if (!membership) {
    throw new PermissionDeniedError("pos.create");
  }
  if (membership.isOwner) {
    return ["owner"];
  }

  const roles = await client.userRole.findMany({
    select: { role: { select: { name: true, templateKey: true } } },
    where: { companyId: tenant.companyId, userId: tenant.userId },
  });
  const names = roles
    .map((entry: Record<string, any>) => String(entry.role?.templateKey ?? entry.role?.name ?? "").toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? names : ["cashier"];
}

const fineKeysByPolicy = new WeakMap<PosPermissionPolicy, string[]>();

export async function buildPosPolicyForTenant(tenant: TenantContext, client: any = db): Promise<PosPermissionPolicy> {
  const roles = await resolveUserRoleNames(tenant, client);
  const policy = await createPosPermissionPolicyFromDatabase({ client, roles, tenant, userId: tenant.userId });
  fineKeysByPolicy.set(policy, await getUserPermissionKeys(tenant, client));
  return policy;
}

function posFineAllows(keys: readonly string[], action: PosPermissionAction) {
  if (allowsFine(keys, "*") || keys.includes("*")) return true;
  if (action === "create_sale") return keys.includes("pos.create") || keys.includes("pos.sell");
  const key = fineKeyForPosAction(action);
  return key ? keys.includes(key) : true;
}

// Throws PermissionDeniedError when the action is not allowed for the policy.
// Server enforcement treats "approval required" the same as "denied" because no
// approved-decision token participates in the live checkout payload.
export function assertPosActionAllowed(
  policy: PosPermissionPolicy,
  action: PosPermissionAction,
  context: { amountLak?: number; discountPercent?: number } = {},
) {
  const fineKeys = fineKeysByPolicy.get(policy);
  const fineKey = fineKeyForPosAction(action);
  if (fineKeys && fineKey && !posFineAllows(fineKeys, action)) {
    throw new PermissionDeniedError(fineKey);
  }
  const decision = evaluatePosPermission(
    fineKeys && fineKey ? { ...policy, permissions: { ...policy.permissions, [action]: true } } : policy,
    action,
    context,
  );
  if (!decision.allowed) {
    throw new PermissionDeniedError(`pos.${action}${decision.reason ? ` — ${decision.reason}` : ""}`);
  }
  return decision;
}
