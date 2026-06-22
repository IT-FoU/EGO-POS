import type { PurchaseStatus } from "@/features/purchasing/types";

export const PURCHASE_STATUS_VALUES: PurchaseStatus[] = [
  "draft",
  "ordered",
  "partial",
  "received",
  "closed",
  "cancelled",
];

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  cancelled: "Cancelled",
  closed: "Closed",
  draft: "Draft",
  ordered: "Ordered",
  partial: "Partial Received",
  received: "Received",
};

const RECEIVABLE_STATUSES: PurchaseStatus[] = ["ordered", "partial"];

const ALLOWED_TRANSITIONS: Record<PurchaseStatus, PurchaseStatus[]> = {
  cancelled: [],
  closed: [],
  draft: ["ordered", "cancelled"],
  ordered: ["partial", "received", "cancelled"],
  partial: ["partial", "received", "cancelled"],
  received: ["closed"],
};

export function isPurchaseStatus(value: unknown): value is PurchaseStatus {
  return typeof value === "string" && (PURCHASE_STATUS_VALUES as string[]).includes(value);
}

export function isReceivableStatus(status: PurchaseStatus): boolean {
  return RECEIVABLE_STATUSES.includes(status);
}

export function canTransition(from: PurchaseStatus, to: PurchaseStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: PurchaseStatus, to: PurchaseStatus): void {
  if (from === to) {
    throw new Error(`Purchase order is already ${PURCHASE_STATUS_LABELS[to]}.`);
  }
  if (!canTransition(from, to)) {
    throw new Error(
      `Cannot change purchase order from ${PURCHASE_STATUS_LABELS[from]} to ${PURCHASE_STATUS_LABELS[to]}.`,
    );
  }
}

/**
 * Manual lifecycle transitions a user can trigger from the UI.
 * Receiving-driven transitions (ordered/partial -> partial/received) are owned by receiveGoods.
 */
export type ManualPurchaseAction = "send" | "close" | "cancel";

export const MANUAL_ACTION_TARGET: Record<ManualPurchaseAction, PurchaseStatus> = {
  cancel: "cancelled",
  close: "closed",
  send: "ordered",
};

export function manualActionsForStatus(status: PurchaseStatus): ManualPurchaseAction[] {
  const actions: ManualPurchaseAction[] = [];
  if (status === "draft") {
    actions.push("send");
  }
  if (status === "received") {
    actions.push("close");
  }
  if (status === "draft" || status === "ordered" || status === "partial") {
    actions.push("cancel");
  }
  return actions;
}
