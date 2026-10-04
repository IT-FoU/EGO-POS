/**
 * Phase 3 permission keys stored in the existing permissions table.
 * No schema change. A role without access.phase3 keeps its previous coarse
 * access through expandPhase3Keys. Saving from Roles & Permissions writes the
 * marker and the explicit keys.
 *
 * Membership renew and member-benefit application are not separate actions
 * in this app, so they are not permissions.
 * Staff settings use staff.view / staff.edit. Role editing uses roles.manage.
 */

export const PHASE3_MARKER = "access.phase3";

export const DASHBOARD_WIDGET = {
  avgBill: "dashboard.avg_bill.view",
  bestSellers: "dashboard.best_sellers.view",
  bills: "dashboard.bills.view",
  cashSession: "dashboard.cash_session.view",
  cost: "dashboard.cost.view",
  profit: "dashboard.profit.view",
  recentBills: "dashboard.recent_bills.view",
  sales: "dashboard.sales.view",
  trend: "dashboard.sales_trend.view",
} as const;

export const DASHBOARD_WIDGET_KEYS = Object.values(DASHBOARD_WIDGET);

const SENSITIVE_DASHBOARD_KEYS = new Set<string>([DASHBOARD_WIDGET.cost, DASHBOARD_WIDGET.profit]);

export const SETTINGS_SECTION_ACCESS = {
  "approval-rules": { edit: "settings.approval_rules.edit", view: "settings.approval_rules.view" },
  "branch-information": { edit: "settings.branch.edit", view: "settings.branch.view" },
  "business-logo": { edit: "settings.logo.edit", view: "settings.logo.view" },
  "cash-shift": { edit: "settings.cash_shift.edit", view: "settings.cash_shift.view" },
  "company-profile": { edit: "settings.company_profile.edit", view: "settings.company_profile.view" },
  "customer-display": { edit: "settings.customer_display.edit", view: "settings.customer_display.view" },
  "day-off": { edit: "settings.day_off.edit", view: "settings.day_off.view" },
  help: { view: "settings.help.view" },
  loyalty: { edit: "settings.loyalty.edit", view: "settings.loyalty.view" },
  ot: { edit: "settings.ot.edit", view: "settings.ot.view" },
  "qr-payments": { edit: "settings.qr.edit", view: "settings.qr.view" },
  receipt: { edit: "settings.receipt.edit", view: "settings.receipt.view" },
  roles: { edit: "roles.manage", view: "settings.roles.view" },
  staff: { edit: "staff.edit", view: "staff.view" },
  tax: { edit: "settings.tax.edit", view: "settings.tax.view" },
} as const;

export type SettingsSectionId = keyof typeof SETTINGS_SECTION_ACCESS;

const STAFF_SECTION_VIEWS = new Set(["settings.approval_rules.view", "settings.day_off.view", "settings.ot.view", "settings.roles.view", "staff.view"]);
const STAFF_SECTION_EDITS = new Set(["settings.approval_rules.edit", "settings.day_off.edit", "settings.ot.edit", "roles.manage", "staff.edit"]);
const SETTINGS_VIEW_KEYS = Object.values(SETTINGS_SECTION_ACCESS).map((entry) => entry.view);
const SETTINGS_EDIT_KEYS = Object.values(SETTINGS_SECTION_ACCESS).flatMap((entry) =>
  "edit" in entry ? [entry.edit] : [],
);

export const PHASE3_PERMISSION_ENTRIES = [
  [DASHBOARD_WIDGET.sales, "Dashboard today sales", "dashboard"],
  [DASHBOARD_WIDGET.profit, "Dashboard profit", "dashboard"],
  [DASHBOARD_WIDGET.cost, "Dashboard cost", "dashboard"],
  [DASHBOARD_WIDGET.bills, "Dashboard bills", "dashboard"],
  [DASHBOARD_WIDGET.avgBill, "Dashboard average bill", "dashboard"],
  [DASHBOARD_WIDGET.trend, "Dashboard sales trend", "dashboard"],
  [DASHBOARD_WIDGET.bestSellers, "Dashboard best sellers", "dashboard"],
  [DASHBOARD_WIDGET.recentBills, "Dashboard recent bills", "dashboard"],
  [DASHBOARD_WIDGET.cashSession, "Dashboard cash session", "dashboard"],
  ["membership.level.change", "Change a customer's membership level", "membership"],
  ["settings.company_profile.view", "View company profile", "settings"],
  ["settings.company_profile.edit", "Edit company profile", "settings"],
  ["settings.logo.view", "View business logo", "settings"],
  ["settings.logo.edit", "Edit business logo", "settings"],
  ["settings.branch.view", "View branch information", "settings"],
  ["settings.branch.edit", "Edit branch information", "settings"],
  ["settings.tax.view", "View tax settings", "settings"],
  ["settings.tax.edit", "Edit tax settings", "settings"],
  ["settings.cash_shift.view", "View cash shift settings", "settings"],
  ["settings.cash_shift.edit", "Edit cash shift settings", "settings"],
  ["settings.receipt.view", "View receipt settings", "settings"],
  ["settings.receipt.edit", "Edit receipt settings", "settings"],
  ["settings.qr.view", "View QR payments", "settings"],
  ["settings.qr.edit", "Edit QR payments", "settings"],
  ["settings.customer_display.view", "View customer display settings", "settings"],
  ["settings.customer_display.edit", "Edit customer display settings", "settings"],
  ["settings.roles.view", "View roles and permissions", "settings"],
  ["settings.approval_rules.view", "View approval rules", "settings"],
  ["settings.approval_rules.edit", "Edit approval rules", "settings"],
  ["settings.day_off.view", "View day off settings", "settings"],
  ["settings.day_off.edit", "Edit day off settings", "settings"],
  ["settings.ot.view", "View OT settings", "settings"],
  ["settings.ot.edit", "Edit OT settings", "settings"],
  ["settings.loyalty.view", "View loyalty settings", "settings"],
  ["settings.loyalty.edit", "Edit loyalty settings", "settings"],
  ["settings.help.view", "View help and support", "settings"],
  [PHASE3_MARKER, "Phase 3 permission baseline", "access"],
] as const;

export type DashboardWidgets = {
  avgBill: boolean;
  bestSellers: boolean;
  bills: boolean;
  cashSession: boolean;
  cost: boolean;
  profit: boolean;
  recentBills: boolean;
  sales: boolean;
  trend: boolean;
};

export function allowsPermission(keys: readonly string[], key: string) {
  return keys.includes("*") || keys.includes(key);
}

export function expandPhase3Keys(keys: readonly string[], templateKey = "") {
  if (keys.includes("*") || keys.includes(PHASE3_MARKER)) return [...new Set(keys)];
  const next = new Set(keys);
  const cashier = templateKey === "cashier";
  if (next.has("dashboard.view")) {
    for (const key of DASHBOARD_WIDGET_KEYS) {
      if (cashier && SENSITIVE_DASHBOARD_KEYS.has(key)) continue;
      next.add(key);
    }
  }
  if (next.has("settings.view")) {
    for (const key of SETTINGS_VIEW_KEYS) {
      if (STAFF_SECTION_VIEWS.has(key)) continue;
      next.add(key);
    }
  }
  if (next.has("settings.edit") || next.has("settings.manage")) {
    for (const key of SETTINGS_EDIT_KEYS) {
      if (STAFF_SECTION_EDITS.has(key)) continue;
      next.add(key);
    }
  }
  if (next.has("roles.manage")) next.add("settings.roles.view");
  if (next.has("membership.edit") || next.has("membership_levels.manage")) {
    next.add("membership.create");
    next.add("membership.edit");
    next.add("membership.delete");
    next.add("membership.level.change");
  }
  if (next.has("staff.view")) {
    next.add("settings.approval_rules.view");
    next.add("settings.day_off.view");
    next.add("settings.ot.view");
  }
  if (next.has("staff.edit") || next.has("users.manage")) {
    next.add("settings.approval_rules.edit");
    next.add("settings.day_off.edit");
    next.add("settings.ot.edit");
  }
  return [...next];
}

export function dashboardWidgets(keys: readonly string[]): DashboardWidgets {
  const allow = (key: string) => allowsPermission(keys, key);
  return {
    avgBill: allow(DASHBOARD_WIDGET.avgBill),
    bestSellers: allow(DASHBOARD_WIDGET.bestSellers),
    bills: allow(DASHBOARD_WIDGET.bills),
    cashSession: allow(DASHBOARD_WIDGET.cashSession),
    cost: allow(DASHBOARD_WIDGET.cost),
    profit: allow(DASHBOARD_WIDGET.profit),
    recentBills: allow(DASHBOARD_WIDGET.recentBills),
    sales: allow(DASHBOARD_WIDGET.sales),
    trend: allow(DASHBOARD_WIDGET.trend),
  };
}

type DashboardRedactionShape = {
  cards: {
    averageBillLak?: number;
    cashDrawerExpectedLak: number;
    cogsLak: number;
    discountLak?: number;
    grossSalesLak: number;
    inventoryValueLak: number;
    netSalesLak: number;
    profitTodayLak: number;
    salesTodayLak: number;
    totalBillsToday: number;
  };
  closeDay: {
    cashSalesLak: number;
    differenceLak: number;
    expectedCashLak: number;
    profitLak: number;
    qrTransferSalesLak: number;
    refundLak: number;
    shiftSummaries: unknown[];
    totalBills: number;
    totalSalesLak: number;
  };
  hourlySales: Array<{ salesLak: number }>;
  paymentBreakdown: unknown[];
  recentSales: unknown[];
  salesTrend: Array<{ salesLak: number }>;
  shift: {
    cashInLak: number;
    cashOutLak: number;
    cashSalesLak: number;
    countedCashLak: number | null;
    differenceLak: number | null;
    expectedCashLak: number;
    openingCashLak: number;
    qrTransferSalesLak: number;
  };
  topProducts: unknown[];
};

export function redactDashboardSnapshot<T extends DashboardRedactionShape>(snapshot: T, widgets: DashboardWidgets): T {
  const next = structuredClone(snapshot);
  const billCount = next.cards.totalBillsToday;
  next.cards.averageBillLak = billCount > 0 ? next.cards.salesTodayLak / billCount : 0;
  if (!widgets.sales) {
    next.cards.salesTodayLak = 0;
    next.cards.grossSalesLak = 0;
    next.cards.netSalesLak = 0;
    next.closeDay.totalSalesLak = 0;
    next.closeDay.cashSalesLak = 0;
    next.closeDay.qrTransferSalesLak = 0;
    next.paymentBreakdown = [];
    next.shift.cashSalesLak = 0;
    next.shift.qrTransferSalesLak = 0;
  }
  if (!widgets.profit) {
    next.cards.profitTodayLak = 0;
    next.closeDay.profitLak = 0;
    if ("discountLak" in next.cards) next.cards.discountLak = 0;
  }
  if (!widgets.cost) {
    next.cards.cogsLak = 0;
    next.cards.inventoryValueLak = 0;
  }
  if (!widgets.bills) {
    next.cards.totalBillsToday = 0;
    next.closeDay.totalBills = 0;
  }
  if (!widgets.avgBill) next.cards.averageBillLak = 0;
  if (!widgets.trend) {
    next.salesTrend = next.salesTrend.map((point) => ({ ...point, salesLak: 0 }));
    next.hourlySales = next.hourlySales.map((point) => ({ ...point, salesLak: 0 }));
  }
  if (!widgets.bestSellers) next.topProducts = [];
  if (!widgets.recentBills) next.recentSales = [];
  if (!widgets.cashSession) {
    next.cards.cashDrawerExpectedLak = 0;
    next.closeDay.expectedCashLak = 0;
    next.closeDay.differenceLak = 0;
    next.closeDay.shiftSummaries = [];
    next.shift.cashInLak = 0;
    next.shift.cashOutLak = 0;
    next.shift.countedCashLak = null;
    next.shift.differenceLak = null;
    next.shift.expectedCashLak = 0;
    next.shift.openingCashLak = 0;
  }
  return next;
}

export function settingsSectionAllows(keys: readonly string[], section: string, mode: "edit" | "view") {
  if (allowsPermission(keys, "*")) return true;
  const rule = SETTINGS_SECTION_ACCESS[section as SettingsSectionId];
  if (!rule) return false;
  if (mode === "view") return keys.includes(rule.view);
  return "edit" in rule && keys.includes(rule.edit);
}

const COMPANY_PROFILE_FIELDS = new Set([
  "baseCurrency",
  "companyName",
  "currencyDisplay",
  "decimalPlaces",
  "profileAddress",
  "profileEmail",
  "profilePhone",
  "roundingMethod",
  "taxNumber",
]);
const TAX_FIELDS = new Set(["showTaxOnReceipt", "taxInclusive", "vatEnabled", "vatRate"]);
const CASH_SHIFT_FIELDS = new Set(["requireCashShiftBeforeSale"]);
const RECEIPT_FIELDS = new Set([
  "receiptCustomHeightMm",
  "receiptCustomWidthMm",
  "receiptFooter",
  "receiptHeader",
  "receiptPaperSize",
  "receiptPrefix",
  "receiptPrintMode",
  "receiptShowAddress",
  "receiptShowBranchName",
  "receiptShowCashier",
  "receiptShowCompanyName",
  "receiptShowDateTime",
  "receiptShowEmail",
  "receiptShowFooter",
  "receiptShowHeader",
  "receiptShowPhone",
  "receiptShowQr",
  "receiptShowReceiptNumber",
  "receiptShowTaxNumber",
  "showLogoOnReceipt",
]);
const LOYALTY_FIELDS = new Set([
  "loyaltyEnabled",
  "loyaltyMinRedeemPoints",
  "loyaltyPointValueLak",
  "loyaltySpendPerPointLak",
]);

export function settingsFieldSection(field: string): SettingsSectionId | null {
  if (COMPANY_PROFILE_FIELDS.has(field)) return "company-profile";
  if (TAX_FIELDS.has(field)) return "tax";
  if (CASH_SHIFT_FIELDS.has(field)) return "cash-shift";
  if (RECEIPT_FIELDS.has(field)) return "receipt";
  if (LOYALTY_FIELDS.has(field)) return "loyalty";
  return null;
}

export function settingsSectionsInPayload(input: Record<string, unknown>) {
  const sections = new Set<SettingsSectionId>();
  for (const key of Object.keys(input)) {
    const section = settingsFieldSection(key);
    if (section) sections.add(section);
  }
  return [...sections];
}

export function unknownSettingsWriteFields(input: Record<string, unknown>) {
  return Object.keys(input).filter((key) => !settingsFieldSection(key));
}

export function redactSettingsRead<T extends object>(settings: T, keys: readonly string[]): T {
  if (allowsPermission(keys, "*")) return settings;
  const next = { ...settings } as Record<string, unknown>;
  for (const field of Object.keys(next)) {
    const section = settingsFieldSection(field);
    if (!section || settingsSectionAllows(keys, section, "view")) continue;
    const value = next[field];
    if (typeof value === "number") next[field] = 0;
    else if (typeof value === "boolean") next[field] = false;
    else if (typeof value === "string") next[field] = "";
    else if (value !== undefined) next[field] = undefined;
  }
  return next as T;
}
