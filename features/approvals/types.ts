import type { ApprovalRuleKey } from "@/features/access-control/permission-catalog";

export type ApprovalRoleTemplate = "owner" | "manager" | "cashier" | "custom";

// Payload persisted on the approval so an approved request can be executed later
// from the DB record alone (no trust in a re-submitted client payload).
export type StockAdjustmentApprovalPayload = {
  adjustmentType: string;
  productId: string;
  quantity: number; // signed base-unit delta (+ found / - loss)
  reason?: string;
  warehouseId: string;
};

export type CreateApprovalRequestInput = {
  action?: string;
  amountLak?: number;
  branchId?: string;
  discountPercent?: number;
  module: string;
  payload?: Record<string, unknown>;
  reason?: string;
  referenceId: string;
  ruleKey: ApprovalRuleKey;
};

export type ApprovalRecord = {
  action?: string;
  amount?: number;
  approvedBy?: string;
  branchId?: string;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  executed?: boolean;
  executionDetail?: string;
  id: string;
  module: string;
  newValue?: string;
  oldValue?: string;
  reason?: string;
  requestBy: string;
  requestedByRole?: string;
  requestType?: string;
  status: string;
};
