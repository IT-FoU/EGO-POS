import { getPosPolicyApprovalRules, getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import {
  APPROVAL_RULE_KEYS,
  type ApprovalRuleKey,
} from "@/features/access-control/permission-catalog";
import type { PosPermissionAction, PosPermissionPolicy, PosRole } from "@/features/pos/permissions";
import { normalizePosRole } from "@/features/pos/permissions";
import type { TenantContext } from "@/lib/db/write-context";

const allPosActions: PosPermissionAction[] = [
  "create_sale",
  "hold_bill",
  "resume_bill",
  "void_bill",
  "refund_bill",
  "apply_discount",
  "manual_price_override",
  "delete_item_from_bill",
  "reprint_receipt",
  "cash_in",
  "cash_out",
  "split_payment",
  "multi_currency_payment",
];

function posActionFromPermissionKeys(keys: Set<string>, action: PosPermissionAction) {
  if (keys.has("*")) return true;
  const map: Partial<Record<PosPermissionAction, string[]>> = {
    apply_discount: ["pos.edit", "pos.create"],
    cash_in: ["pos.edit", "pos.create"],
    cash_out: ["pos.edit", "pos.create"],
    create_sale: ["pos.create", "pos.sell"],
    delete_item_from_bill: ["pos.delete", "pos.edit"],
    hold_bill: ["pos.create", "pos.edit"],
    manual_price_override: ["pos.edit", "pos.approve"],
    multi_currency_payment: ["pos.edit", "pos.create"],
    refund_bill: ["pos.approve", "pos.delete"],
    reprint_receipt: ["pos.print"],
    resume_bill: ["pos.edit", "pos.create"],
    split_payment: ["pos.edit", "pos.create"],
    void_bill: ["pos.delete", "pos.approve"],
  };
  return (map[action] ?? ["pos.create"]).some((key) => keys.has(key));
}

export async function createPosPermissionPolicyFromDatabase(input: {
  assignedTerminal?: string | null;
  branchName?: string | null;
  client?: any;
  displayName?: string | null;
  roles: unknown;
  tenant: TenantContext;
  userId?: string | null;
  username?: string | null;
}): Promise<PosPermissionPolicy> {
  const role = normalizePosRole(input.roles) as PosRole;

  // B8-3: derive permission keys from the logged-in user's ACTUAL assigned roles
  // (getUserPermissionKeys resolves the user's real roleId(s); owner => "*"),
  // not from a role matched only by template label. This keeps the client preview
  // in sync with the server-enforced policy.
  // POS first paint only needs keys + approval thresholds — not the full staff matrix.
  const [permissionKeyList, approvalRuleRows] = await Promise.all([
    getUserPermissionKeys(input.tenant, input.client),
    getPosPolicyApprovalRules(input.tenant, input.client),
  ]);
  const permissionKeys = new Set<string>(permissionKeyList.map(String));

  const rules = Object.fromEntries(
    APPROVAL_RULE_KEYS.map((ruleKey) => [ruleKey, approvalRuleRows.find((rule) => rule.ruleKey === ruleKey)]),
  ) as Record<ApprovalRuleKey, (typeof approvalRuleRows)[number] | undefined>;

  const discountRule = rules.discount;
  const refundRule = rules.refund;

  const approvalRules: PosPermissionPolicy["approvalRules"] =
    role === "Owner"
      ? {}
      : {
          apply_discount: discountRule?.isEnabled ? "owner_above_threshold" : undefined,
          manual_price_override: "owner",
          refund_bill:
            refundRule?.isEnabled && role === "Manager" ? "owner_above_threshold" : refundRule?.isEnabled ? "manager" : undefined,
          void_bill: "manager",
        };

  return {
    approvalRules,
    assignedTerminal: input.assignedTerminal ?? "POS-01",
    branchName: input.branchName ?? "Main Branch",
    displayName: input.displayName ?? input.username ?? role,
    // Role hierarchy is preserved: Owner is unlimited, Manager is capped at the
    // company discount threshold (default 10%), Cashier cannot apply manual
    // discounts (0%). The threshold only raises the Manager ceiling, never the
    // Cashier's.
    maxDiscountPercent:
      role === "Owner"
        ? 100
        : role === "Manager"
          ? discountRule?.thresholdPercent != null
            ? Number(discountRule.thresholdPercent)
            : 10
          : 0,
    permissions: Object.fromEntries(
      allPosActions.map((action) => [action, posActionFromPermissionKeys(permissionKeys, action)]),
    ) as Record<PosPermissionAction, boolean>,
    refundOwnerThresholdLak: refundRule?.thresholdLak != null ? Number(refundRule.thresholdLak) : 100000,
    role,
    userId: input.userId ?? "unknown-user",
    username: input.username ?? role.toLowerCase(),
  };
}
