/**
 * Phase 5 canonical fine-grained keys.
 * Stored in the existing permissions / role_permissions tables. No schema change.
 * Supplier view stays deferred. Cash-shift totals and refund totals are not in the
 * Phase 3 model, so they stay deferred rather than becoming a new permission family.
 * Purchasing approval and membership renewal are not real actions in the current app.
 */
export const FINE_MARKER = "access.fine_v5";

export const FINE = {
  inventoryMovement: "inventory.movement",
  inventoryViewCost: "inventory.view_cost",
  posCashIn: "pos.cash_in",
  posCashOut: "pos.cash_out",
  posDiscount: "pos.discount",
  posHold: "pos.hold",
  posPriceOverride: "pos.price_override",
  posRefund: "pos.refund",
  posReprint: "pos.reprint",
  posShiftClose: "pos.shift_close",
  posShiftOpen: "pos.shift_open",
  posVoid: "pos.void",
  productsChangeCost: "products.change_cost",
  productsChangePrice: "products.change_price",
  productsViewCost: "products.view_cost",
  reportsCost: "reports.cost",
  reportsExport: "reports.export",
  reportsHistorical: "reports.historical",
  reportsMargin: "reports.margin",
  reportsProfit: "reports.profit",
  reportsToday: "reports.view",
  staffBackOfficeAccess: "staff.back_office_access",
  staffChangeBranch: "staff.change_branch",
  staffChangeRole: "staff.change_role",
  staffPosAccess: "staff.pos_access",
  staffResetPassword: "staff.reset_password",
} as const;

export const FINE_PERMISSION_ENTRIES = [
  [FINE.reportsHistorical, "Reports historical sales", "reports"],
  [FINE.reportsCost, "Reports cost", "reports"],
  [FINE.reportsProfit, "Reports profit", "reports"],
  [FINE.reportsMargin, "Reports margin", "reports"],
  [FINE.productsViewCost, "View product cost", "products"],
  [FINE.productsChangeCost, "Change product cost", "products"],
  [FINE.productsChangePrice, "Change selling price", "products"],
  [FINE.inventoryMovement, "Inventory movement history", "inventory"],
  [FINE.inventoryViewCost, "View inventory cost", "inventory"],
  [FINE.posHold, "Hold and resume POS bills", "pos"],
  [FINE.posDiscount, "POS discount", "pos"],
  [FINE.posPriceOverride, "POS price override", "pos"],
  [FINE.posRefund, "POS refund", "pos"],
  [FINE.posVoid, "POS void", "pos"],
  [FINE.posReprint, "Reprint receipt", "pos"],
  [FINE.posCashIn, "POS cash in", "pos"],
  [FINE.posCashOut, "POS cash out", "pos"],
  [FINE.posShiftOpen, "Open cash shift", "pos"],
  [FINE.posShiftClose, "Close cash shift", "pos"],
  [FINE.staffChangeRole, "Change staff role", "staff"],
  [FINE.staffChangeBranch, "Change staff branch", "staff"],
  [FINE.staffResetPassword, "Reset staff password", "staff"],
  [FINE.staffPosAccess, "Change POS access", "staff"],
  [FINE.staffBackOfficeAccess, "Change Back Office access", "staff"],
  [FINE_MARKER, "Fine-grained permission baseline", "access"],
] as const;

const POS_ACTION_KEYS: Record<string, string> = {
  apply_discount: FINE.posDiscount,
  cash_in: FINE.posCashIn,
  cash_out: FINE.posCashOut,
  create_sale: "pos.create",
  hold_bill: FINE.posHold,
  manual_price_override: FINE.posPriceOverride,
  refund_bill: FINE.posRefund,
  reprint_receipt: FINE.posReprint,
  resume_bill: FINE.posHold,
  void_bill: FINE.posVoid,
};

export function fineKeyForPosAction(action: string) {
  return POS_ACTION_KEYS[action] ?? null;
}

export function allowsFine(keys: readonly string[], key: string) {
  return keys.includes("*") || keys.includes(key);
}

export function moduleAccessKey(moduleId: string) {
  return `${moduleId}.access`;
}

const COST_KEY = /cogs|costprice|cost_price|unitcost|unit_cost|totalcost|inventoryvalue|stockvalue|costlak|costamount|valuation/i;
const PROFIT_KEY = /profit/i;
const MARGIN_KEY = /margin|markup/i;

export type SensitiveVisibility = {
  cost: boolean;
  historical: boolean;
  margin: boolean;
  profit: boolean;
  today: boolean;
};

export function sensitiveVisibility(keys: readonly string[]): SensitiveVisibility {
  return {
    cost: allowsFine(keys, FINE.reportsCost) || allowsFine(keys, FINE.productsViewCost) || allowsFine(keys, FINE.inventoryViewCost),
    historical: allowsFine(keys, FINE.reportsHistorical),
    margin: allowsFine(keys, FINE.reportsMargin),
    profit: allowsFine(keys, FINE.reportsProfit),
    today: allowsFine(keys, FINE.reportsToday),
  };
}

export function reportVisibility(keys: readonly string[]): SensitiveVisibility {
  return {
    cost: allowsFine(keys, FINE.reportsCost),
    historical: allowsFine(keys, FINE.reportsHistorical),
    margin: allowsFine(keys, FINE.reportsMargin),
    profit: allowsFine(keys, FINE.reportsProfit),
    today: allowsFine(keys, FINE.reportsToday),
  };
}

function sensitiveKind(key: string): "cost" | "margin" | "profit" | null {
  if (PROFIT_KEY.test(key)) return "profit";
  if (MARGIN_KEY.test(key)) return "margin";
  if (COST_KEY.test(key) || /costprice|cost_price|unitcost/i.test(key)) return "cost";
  return null;
}

export function redactSensitiveFields<T>(value: T, visibility: Pick<SensitiveVisibility, "cost" | "margin" | "profit">): T {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveFields(entry, visibility)) as T;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    const kind = sensitiveKind(key);
    if (kind === "profit" && !visibility.profit) continue;
    if (kind === "cost" && !visibility.cost) continue;
    if (kind === "margin" && !visibility.margin) continue;
    next[key] = redactSensitiveFields(entry, visibility);
  }
  return next as T;
}

export function reportRangeNeedsHistorical(input: { dateFrom?: Date | null; datePreset?: string | null }, now = new Date()) {
  const preset = String(input.datePreset ?? "").trim().toLowerCase();
  if (preset && preset !== "today") return true;
  if (input.dateFrom && input.dateFrom.getTime() < startOfToday(now).getTime()) return true;
  return false;
}

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function productCostChanged(existingCost: unknown, nextCost: unknown) {
  if (nextCost === undefined) return false;
  return Math.round(Number(nextCost) || 0) !== Math.round(Number(existingCost) || 0);
}

export function grantExceedsActor(input: {
  actorBackOffice: boolean;
  actorKeys: readonly string[];
  actorPos: boolean;
  isOwner: boolean;
  nextBackOffice: boolean;
  nextPos: boolean;
  roleKeys: readonly string[];
}) {
  if (input.isOwner || input.actorKeys.includes("*")) return false;
  if (input.nextPos && !input.actorPos) return true;
  if (input.nextBackOffice && !input.actorBackOffice) return true;
  const actor = new Set(input.actorKeys);
  return input.roleKeys.some((key) => key !== FINE_MARKER && !key.endsWith(".access") && !actor.has(key));
}

export function legacyFineKeys(existing: readonly string[], templateKey: string) {
  const has = (key: string) => existing.includes(key);
  const next = new Set<string>();
  const cashier = templateKey === "cashier";
  if (!cashier && has("reports.view")) {
    next.add(FINE.reportsHistorical);
    next.add(FINE.reportsCost);
    next.add(FINE.reportsProfit);
    next.add(FINE.reportsMargin);
  }
  if (!cashier && (has("products.view") || has("products.edit") || has("products.update"))) next.add(FINE.productsViewCost);
  if (!cashier && (has("products.edit") || has("products.update"))) {
    next.add(FINE.productsChangeCost);
    next.add(FINE.productsChangePrice);
  }
  if (!cashier && has("inventory.view")) {
    next.add(FINE.inventoryViewCost);
    next.add(FINE.inventoryMovement);
  }
  if (has("inventory.adjust") || (!cashier && has("inventory.edit"))) next.add("inventory.adjust");
  if (has("inventory.stock_in") || (!cashier && has("inventory.create"))) next.add("inventory.stock_in");
  if (has("inventory.count") || (!cashier && has("inventory.edit"))) next.add("inventory.count");
  if (has("pos.create") || has("pos.sell")) {
    next.add(FINE.posHold);
    next.add(FINE.posReprint);
    next.add(FINE.posCashIn);
    next.add(FINE.posCashOut);
    if (!cashier) {
      next.add(FINE.posDiscount);
      next.add(FINE.posPriceOverride);
      next.add(FINE.posRefund);
      next.add(FINE.posVoid);
      next.add(FINE.posShiftOpen);
      next.add(FINE.posShiftClose);
    }
  }
  if (has("pos.cash_session.manage")) {
    next.add(FINE.posShiftOpen);
    next.add(FINE.posShiftClose);
  }
  if (!cashier && has("staff.edit")) {
    next.add(FINE.staffChangeRole);
    next.add(FINE.staffChangeBranch);
    next.add(FINE.staffResetPassword);
    next.add(FINE.staffPosAccess);
    next.add(FINE.staffBackOfficeAccess);
  }
  if (!cashier && (has("purchasing.receive") || has("purchasing.edit"))) next.add("purchasing.receive");
  if (!cashier && (has("purchasing.payment") || has("purchasing.edit"))) next.add("purchasing.payment");
  next.add(FINE_MARKER);
  return [...next];
}
