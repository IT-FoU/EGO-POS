export type PosRole = "Owner" | "Manager" | "Cashier";

export type PosPermissionAction =
  | "create_sale"
  | "hold_bill"
  | "resume_bill"
  | "void_bill"
  | "refund_bill"
  | "apply_discount"
  | "manual_price_override"
  | "delete_item_from_bill"
  | "delete_sale"
  | "duplicate_sale"
  | "edit_sale_customer"
  | "edit_sale_note"
  | "edit_sale_payment"
  | "reprint_receipt"
  | "view_receipt"
  | "view_recent_sales"
  | "cash_in"
  | "cash_out"
  | "split_payment"
  | "multi_currency_payment";

export type PosApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export type PosPermissionDecision = {
  allowed: boolean;
  approvalRequired: boolean;
  reason?: string;
};

export type PosPermissionPolicy = {
  role: PosRole;
  userId: string;
  username: string;
  displayName: string;
  branchName: string;
  assignedTerminal: string;
  maxDiscountPercent: number;
  permissions: Record<PosPermissionAction, boolean>;
  approvalRules: Partial<Record<PosPermissionAction, "manager" | "owner" | "owner_above_threshold">>;
  refundOwnerThresholdLak: number;
};

export type PosPendingApprovalRequest = {
  id: string;
  action: PosPermissionAction;
  requestedBy: string;
  requestedByRole: PosRole;
  createdAt: string;
  oldValue?: string;
  newValue?: string;
  reason: string;
  status: Exclude<PosApprovalStatus, "not_required">;
};

export type PosAuditEntry = {
  id: string;
  action: PosPermissionAction;
  user: string;
  role: PosRole;
  result: "allowed" | "blocked" | "approval_requested" | "approved" | "rejected";
  approvalStatus: PosApprovalStatus;
  details: string;
  createdAt: string;
};

const allPosActions: PosPermissionAction[] = [
  "create_sale",
  "hold_bill",
  "resume_bill",
  "void_bill",
  "refund_bill",
  "apply_discount",
  "manual_price_override",
  "delete_item_from_bill",
  "delete_sale",
  "duplicate_sale",
  "edit_sale_customer",
  "edit_sale_note",
  "edit_sale_payment",
  "reprint_receipt",
  "view_receipt",
  "view_recent_sales",
  "cash_in",
  "cash_out",
  "split_payment",
  "multi_currency_payment",
];

const managerAllowed = new Set<PosPermissionAction>([
  "create_sale",
  "hold_bill",
  "resume_bill",
  "void_bill",
  "refund_bill",
  "apply_discount",
  "manual_price_override",
  "delete_item_from_bill",
  "duplicate_sale",
  "edit_sale_customer",
  "edit_sale_note",
  "edit_sale_payment",
  "reprint_receipt",
  "view_receipt",
  "view_recent_sales",
  "cash_in",
  "cash_out",
  "split_payment",
  "multi_currency_payment",
]);

const cashierAllowed = new Set<PosPermissionAction>([
  "create_sale",
  "hold_bill",
  "resume_bill",
  "delete_item_from_bill",
  "reprint_receipt",
  "view_receipt",
  "view_recent_sales",
  "duplicate_sale",
]);

export const POS_PERMISSION_DENIED_MESSAGE = "You do not have permission to perform this action.";

export function normalizePosRole(roles: unknown): PosRole {
  const roleList = Array.isArray(roles) ? roles.map((role) => String(role).toLowerCase()) : [];
  if (roleList.includes("owner")) return "Owner";
  if (roleList.includes("manager")) return "Manager";
  return "Cashier";
}

export function createPosPermissionPolicy(input: {
  roles: unknown;
  userId?: string | null;
  username?: string | null;
  displayName?: string | null;
  branchName?: string | null;
  assignedTerminal?: string | null;
}): PosPermissionPolicy {
  const role = normalizePosRole(input.roles);
  const permissionSet =
    role === "Owner"
      ? new Set(allPosActions)
      : role === "Manager"
        ? managerAllowed
        : cashierAllowed;

  return {
    approvalRules:
      role === "Owner"
        ? {}
        : {
            apply_discount: "owner_above_threshold",
            manual_price_override: "owner",
            delete_sale: "owner",
            refund_bill: role === "Manager" ? "owner_above_threshold" : "manager",
            void_bill: "manager",
          },
    assignedTerminal: input.assignedTerminal ?? "POS-01",
    branchName: input.branchName ?? "Main Branch",
    displayName: input.displayName ?? input.username ?? role,
    maxDiscountPercent: role === "Owner" ? 100 : role === "Manager" ? 10 : 0,
    permissions: Object.fromEntries(allPosActions.map((action) => [action, permissionSet.has(action)])) as Record<
      PosPermissionAction,
      boolean
    >,
    refundOwnerThresholdLak: 100000,
    role,
    userId: input.userId ?? "demo-user",
    username: input.username ?? role.toLowerCase(),
  };
}

export function evaluatePosPermission(
  policy: PosPermissionPolicy,
  action: PosPermissionAction,
  context: { amountLak?: number; discountPercent?: number } = {},
): PosPermissionDecision {
  if (policy.role === "Owner") {
    return { allowed: true, approvalRequired: false };
  }

  if (!policy.permissions[action]) {
    return { allowed: false, approvalRequired: false, reason: POS_PERMISSION_DENIED_MESSAGE };
  }

  if (action === "apply_discount" && (context.discountPercent ?? 0) > policy.maxDiscountPercent) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `Discount ${context.discountPercent}% exceeds ${policy.role} limit ${policy.maxDiscountPercent}%.`,
    };
  }

  if (
    action === "refund_bill" &&
    policy.approvalRules.refund_bill === "owner_above_threshold" &&
    (context.amountLak ?? 0) > policy.refundOwnerThresholdLak
  ) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `Refund above ${policy.refundOwnerThresholdLak.toLocaleString()} LAK requires Owner approval.`,
    };
  }

  if (policy.approvalRules[action] && action !== "apply_discount" && action !== "refund_bill") {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `${formatPosPermissionAction(action)} requires approval.`,
    };
  }

  return { allowed: true, approvalRequired: false };
}

export function formatPosPermissionAction(action: PosPermissionAction) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
