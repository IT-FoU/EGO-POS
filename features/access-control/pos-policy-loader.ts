import { FINE } from "@/features/access-control/fine-permissions";
import { getPosPolicyApprovalRules, getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import {
  APPROVAL_RULE_KEYS,
  type ApprovalRuleKey,
} from "@/features/access-control/permission-catalog";
import { canUseQuickStockFix } from "@/features/pos/quick-stock-fix";
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
    apply_discount: [FINE.posDiscount],
    cash_in: [FINE.posCashIn],
    cash_out: [FINE.posCashOut],
    create_sale: ["pos.create", "pos.sell"],
    delete_item_from_bill: ["pos.delete", "pos.edit"],
    hold_bill: [FINE.posHold],
    manual_price_override: [FINE.posPriceOverride],
    multi_currency_payment: ["pos.edit", "pos.create"],
    refund_bill: [FINE.posRefund],
    reprint_receipt: [FINE.posReprint, "pos.print"],
    resume_bill: [FINE.posHold],
    split_payment: ["pos.edit", "pos.create"],
    void_bill: [FINE.posVoid],
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
  const discountEnabled = Boolean(discountRule?.isEnabled);
  const discountApprover = String(discountRule?.approverRole ?? "owner").toLowerCase();
  const managerIsDiscountApprover = role === "Manager" && discountApprover === "manager";
  const discountCeiling = discountRule?.thresholdPercent != null ? Number(discountRule.thresholdPercent) : 10;

  const approvalRules: PosPermissionPolicy["approvalRules"] =
    role === "Owner"
      ? {}
      : {
          // The saved approver may exceed the percent. Everyone else is capped
          // while the rule is on. A disabled rule does not add this ceiling.
          apply_discount: discountEnabled && !managerIsDiscountApprover ? "owner_above_threshold" : undefined,
          manual_price_override: "owner",
          refund_bill:
            refundRule?.isEnabled && role === "Manager" ? "owner_above_threshold" : refundRule?.isEnabled ? "manager" : undefined,
          // Void stays a separate always-on non-owner approval. The Refund toggle does not control it.
          void_bill: "manager",
        };

  return {
    approvalRules,
    assignedTerminal: input.assignedTerminal ?? "POS-01",
    branchName: input.branchName ?? "Main Branch",
    canQuickStockFix: canUseQuickStockFix([...permissionKeys]),
    displayName: input.displayName ?? input.username ?? role,
    // Cashier max is 0 as an independent role limit, whether or not the Discount
    // approval rule is enabled. Owner is unlimited. A Manager is capped at the
    // saved percent only while the rule is on and Manager is not the approver.
    // A disabled rule does not fall back to a hardcoded 10% ceiling.
    maxDiscountPercent:
      role === "Owner"
        ? 100
        : role === "Cashier"
          ? 0
          : !discountEnabled || managerIsDiscountApprover
            ? 100
            : discountCeiling,
    permissions: Object.fromEntries(
      allPosActions.map((action) => [action, posActionFromPermissionKeys(permissionKeys, action)]),
    ) as Record<PosPermissionAction, boolean>,
    refundOwnerThresholdLak: refundRule?.thresholdLak != null ? Number(refundRule.thresholdLak) : 100000,
    role,
    userId: input.userId ?? "unknown-user",
    username: input.username ?? role.toLowerCase(),
  };
}
