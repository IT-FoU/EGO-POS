import { prisma } from "@/lib/db/prisma";
import { PermissionDeniedError } from "@/lib/auth/permissions";
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
async function resolveUserRoleNames(tenant: TenantContext): Promise<string[]> {
  const membership = await db.companyUser.findFirst({
    select: { isOwner: true },
    where: { companyId: tenant.companyId, status: "active", userId: tenant.userId },
  });
  if (!membership) {
    throw new PermissionDeniedError("pos.create");
  }
  if (membership.isOwner) {
    return ["owner"];
  }

  const roles = await db.userRole.findMany({
    select: { role: { select: { name: true, templateKey: true } } },
    where: { companyId: tenant.companyId, userId: tenant.userId },
  });
  const names = roles
    .map((entry: Record<string, any>) => String(entry.role?.templateKey ?? entry.role?.name ?? "").toLowerCase())
    .filter(Boolean);
  return names.length > 0 ? names : ["cashier"];
}

// Build the authoritative server-side POS policy for the acting user, sourced
// entirely from live DB role permissions + approval rules.
export async function buildPosPolicyForTenant(tenant: TenantContext): Promise<PosPermissionPolicy> {
  const roles = await resolveUserRoleNames(tenant);
  return createPosPermissionPolicyFromDatabase({ roles, tenant, userId: tenant.userId });
}

// Throws PermissionDeniedError when the action is not allowed for the policy.
// Server enforcement treats "approval required" the same as "denied" because no
// approved-decision token participates in the live checkout payload.
export function assertPosActionAllowed(
  policy: PosPermissionPolicy,
  action: PosPermissionAction,
  context: { amountLak?: number; discountPercent?: number } = {},
) {
  const decision = evaluatePosPermission(policy, action, context);
  if (!decision.allowed) {
    throw new PermissionDeniedError(`pos.${action}${decision.reason ? ` — ${decision.reason}` : ""}`);
  }
  return decision;
}
