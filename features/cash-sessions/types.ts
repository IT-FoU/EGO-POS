export type CashSessionStatus = "open" | "closed";

export type CashSessionTotals = {
  cashInLak: number;
  cashOutLak: number;
  cashSalesLak: number;
  expectedCashLak: number;
  nonCashSalesLak: number;
  openingCashLak: number;
  refundLak: number;
  voidCashLak: number;
};

export type CashSessionSummary = CashSessionTotals & {
  cashierId: string;
  closedAt: string | null;
  countedCashLak: number | null;
  id: string;
  openedAt: string;
  status: CashSessionStatus;
  varianceLak: number | null;
};

export type OpenCashSessionInput = {
  openingCashLak: number;
  note?: string;
};

export type CashMovementInput = {
  amountLak: number;
  reason?: string;
};

export type CloseCashSessionInput = {
  countedCashLak: number;
  note?: string;
};
