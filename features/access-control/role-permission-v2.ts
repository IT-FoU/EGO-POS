import { FINE, FINE_MARKER, moduleAccessKey } from "@/features/access-control/fine-permissions";
import { DASHBOARD_WIDGET, PHASE3_MARKER } from "@/features/access-control/phase3-permissions";
import {
  buildDefaultMatrix,
  matrixToPermissionKeys,
  type RoleTemplateLabel,
} from "@/features/access-control/permission-catalog";

export type RolePermissionDef = {
  deferred?: boolean;
  groupKey?: string;
  id: string;
  labelKey: string;
  readKeys: readonly string[];
  report?: boolean;
  sensitive?: boolean;
  writeKeys: readonly string[];
};

export type RoleModuleDef = {
  id: string;
  labelKey: string;
  permissions: readonly RolePermissionDef[];
};

export type RoleModuleDraft = {
  advanced: Record<string, boolean>;
  enabled: boolean;
};

export type RolePermissionDraft = Record<string, RoleModuleDraft>;

export const ROLE_PERMISSION_MODULES: readonly RoleModuleDef[] = [
  module("dashboard", "moduleDashboard", [
    perm("dashboard.view", "permissionView", ["dashboard.view"]),
    perm("dashboard.sales", "permTodaySales", [DASHBOARD_WIDGET.sales]),
    perm("dashboard.profit", "permDashboardProfit", [DASHBOARD_WIDGET.profit], [DASHBOARD_WIDGET.profit], { sensitive: true }),
    perm("dashboard.cost", "permDashboardCost", [DASHBOARD_WIDGET.cost], [DASHBOARD_WIDGET.cost], { sensitive: true }),
    perm("dashboard.bills", "permDashboardBills", [DASHBOARD_WIDGET.bills]),
    perm("dashboard.avgBill", "permAverageBill", [DASHBOARD_WIDGET.avgBill]),
    perm("dashboard.trend", "permSalesTrend", [DASHBOARD_WIDGET.trend]),
    perm("dashboard.bestSellers", "permBestSellers", [DASHBOARD_WIDGET.bestSellers]),
    perm("dashboard.recentBills", "permRecentBills", [DASHBOARD_WIDGET.recentBills]),
    perm("dashboard.cashSession", "permCashSession", [DASHBOARD_WIDGET.cashSession]),
  ]),
  module("pos", "modulePos", [
    perm("pos.view", "permissionView", ["pos.view"]),
    perm("pos.sell", "permSell", ["pos.create"], ["pos.create", "pos.sell"]),
    perm("pos.print", "permissionPrint", ["pos.print"]),
    perm("pos.hold", "permHoldResume", [FINE.posHold]),
    perm("pos.discount", "permDiscount", [FINE.posDiscount], [FINE.posDiscount], { sensitive: true }),
    perm("pos.priceOverride", "permPriceOverride", [FINE.posPriceOverride], [FINE.posPriceOverride], { sensitive: true }),
    perm("pos.refund", "permRefund", [FINE.posRefund], [FINE.posRefund], { sensitive: true }),
    perm("pos.void", "permVoid", [FINE.posVoid]),
    perm("pos.reprint", "permReprint", [FINE.posReprint]),
    perm("pos.cashIn", "permCashIn", [FINE.posCashIn], [FINE.posCashIn], { sensitive: true }),
    perm("pos.cashOut", "permCashOut", [FINE.posCashOut], [FINE.posCashOut], { sensitive: true }),
    perm("pos.openShift", "permOpenShift", [FINE.posShiftOpen], [FINE.posShiftOpen, "pos.cash_session.manage"]),
    perm("pos.closeShift", "permCloseShift", [FINE.posShiftClose], [FINE.posShiftClose, "pos.cash_session.manage"]),
  ]),
  module("products", "moduleProducts", [
    perm("products.view", "permissionView", ["products.view"]),
    perm("products.create", "permissionCreate", ["products.create"]),
    perm("products.edit", "permissionEdit", ["products.edit"], ["products.edit", "products.update"]),
    perm("products.archive", "permArchive", ["products.delete"]),
    perm("products.viewCost", "permViewCost", [FINE.productsViewCost], [FINE.productsViewCost], { sensitive: true }),
    perm("products.changeCost", "permChangeCost", [FINE.productsChangeCost], [FINE.productsChangeCost], { sensitive: true }),
    perm("products.changePrice", "permChangePrice", [FINE.productsChangePrice], [FINE.productsChangePrice], { sensitive: true }),
    perm("products.printBarcode", "permPrintBarcode", ["products.print"]),
  ]),
  module("inventory", "moduleInventory", [
    perm("inventory.view", "permissionView", ["inventory.view"]),
    perm("inventory.stockIn", "permStockIn", ["inventory.stock_in"]),
    perm("inventory.adjustment", "permAdjustment", ["inventory.adjust"]),
    perm("inventory.count", "permCount", ["inventory.count"]),
    perm("inventory.movement", "permMovement", [FINE.inventoryMovement]),
    perm("inventory.viewCost", "permViewCost", [FINE.inventoryViewCost], [FINE.inventoryViewCost], { sensitive: true }),
  ]),
  module("purchasing", "modulePurchasing", [
    perm("purchasing.view", "permissionView", ["purchasing.view"]),
    perm("purchasing.create", "permCreatePo", ["purchasing.create"]),
    perm("purchasing.edit", "permEditPo", ["purchasing.edit"]),
    perm("purchasing.receive", "permReceive", ["purchasing.receive"]),
    perm("purchasing.pay", "permPay", ["purchasing.payment"]),
    perm("purchasing.cancel", "permCancel", ["purchasing.delete"]),
  ]),
  module("suppliers", "moduleSuppliers", [
    deferred("suppliers.view", "permissionView"),
    perm("suppliers.create", "permissionCreate", ["suppliers.create"]),
    perm("suppliers.edit", "permissionEdit", ["suppliers.update"]),
    perm("suppliers.archive", "permArchive", ["suppliers.delete"]),
  ]),
  module("customers", "moduleCustomers", [
    perm("customers.view", "permissionView", ["customers.view"]),
    perm("customers.create", "permissionCreate", ["customers.create"]),
    perm("customers.edit", "permissionEdit", ["customers.edit"], ["customers.edit", "customers.update"]),
    perm("customers.archive", "permArchive", ["customers.delete"]),
    perm("customers.payment", "permPay", ["customers.payment"]),
  ]),
  module("membership", "moduleMembership", [
    perm("membership.view", "permissionView", ["membership.view"]),
    perm("membership.create", "permAddLevel", ["membership.create"]),
    perm("membership.edit", "permissionEdit", ["membership.edit"], ["membership.edit", "membership_levels.manage"]),
    perm("membership.delete", "permArchiveLevel", ["membership.delete"]),
    perm("membership.level.change", "permChangeMemberLevel", ["membership.level.change"]),
  ]),
  module("promotions", "modulePromotions", [
    perm("promotions.view", "permissionView", ["promotions.view"]),
    perm("promotions.create", "permissionCreate", ["promotions.create"]),
    perm("promotions.edit", "permissionEdit", ["promotions.edit"]),
    perm("promotions.archive", "permArchive", ["promotions.delete"]),
    perm("promotions.approve", "permissionApprove", ["promotions.approve"]),
  ]),
  module("reports", "moduleReports", [
    perm("reports.today", "reportsToday", ["reports.view"], ["reports.view"], { report: true }),
    perm("reports.historical", "reportsHistorical", [FINE.reportsHistorical], [FINE.reportsHistorical], { report: true }),
    perm("reports.cost", "reportsCost", [FINE.reportsCost], [FINE.reportsCost], { report: true, sensitive: true }),
    perm("reports.profit", "reportsProfit", [FINE.reportsProfit], [FINE.reportsProfit], { report: true, sensitive: true }),
    perm("reports.margin", "reportsMargin", [FINE.reportsMargin], [FINE.reportsMargin], { report: true, sensitive: true }),
    perm("reports.export", "permissionExport", ["reports.export"], ["reports.export"], { report: true }),
  ]),
  module("settings", "moduleSettings", [
    perm("settings.companyProfile.view", "permCompanyProfileView", ["settings.company_profile.view"], ["settings.company_profile.view"], { groupKey: "groupBusiness" }),
    perm("settings.companyProfile.edit", "permCompanyProfileEdit", ["settings.company_profile.edit"], ["settings.company_profile.edit"], { groupKey: "groupBusiness" }),
    perm("settings.logo.view", "permLogoView", ["settings.logo.view"], ["settings.logo.view"], { groupKey: "groupBusiness" }),
    perm("settings.logo.edit", "permLogoEdit", ["settings.logo.edit"], ["settings.logo.edit"], { groupKey: "groupBusiness" }),
    perm("settings.branch.view", "permBranchView", ["settings.branch.view"], ["settings.branch.view"], { groupKey: "groupBusiness" }),
    perm("settings.branch.edit", "permBranchEdit", ["settings.branch.edit"], ["settings.branch.edit"], { groupKey: "groupBusiness" }),
    perm("settings.tax.view", "permTaxView", ["settings.tax.view"], ["settings.tax.view"], { groupKey: "groupBusiness" }),
    perm("settings.tax.edit", "permTaxEdit", ["settings.tax.edit"], ["settings.tax.edit"], { groupKey: "groupBusiness" }),
    perm("settings.cashShift.view", "permCashShiftView", ["settings.cash_shift.view"], ["settings.cash_shift.view"], { groupKey: "groupPosPayments" }),
    perm("settings.cashShift.edit", "permCashShiftEdit", ["settings.cash_shift.edit"], ["settings.cash_shift.edit"], { groupKey: "groupPosPayments" }),
    perm("settings.receipt.view", "permReceiptView", ["settings.receipt.view"], ["settings.receipt.view"], { groupKey: "groupPosPayments" }),
    perm("settings.receipt.edit", "permReceiptEdit", ["settings.receipt.edit"], ["settings.receipt.edit"], { groupKey: "groupPosPayments" }),
    perm("settings.qr.view", "permQrView", ["settings.qr.view"], ["settings.qr.view"], { groupKey: "groupPosPayments" }),
    perm("settings.qr.edit", "permQrEdit", ["settings.qr.edit"], ["settings.qr.edit"], { groupKey: "groupPosPayments" }),
    perm("settings.customerDisplay.view", "permCustomerDisplayView", ["settings.customer_display.view"], ["settings.customer_display.view"], { groupKey: "groupPosPayments" }),
    perm("settings.customerDisplay.edit", "permCustomerDisplayEdit", ["settings.customer_display.edit"], ["settings.customer_display.edit"], { groupKey: "groupPosPayments" }),
    perm("settings.staff.view", "permSettingsStaffView", ["staff.view"], ["staff.view"], { groupKey: "groupStaffSecurity" }),
    perm("settings.staff.edit", "permSettingsStaffEdit", ["staff.edit"], ["staff.edit", "users.manage"], { groupKey: "groupStaffSecurity" }),
    perm("settings.roles.view", "permRolesView", ["settings.roles.view"], ["settings.roles.view", "roles.manage"], { groupKey: "groupStaffSecurity" }),
    perm("settings.roles.edit", "permRolesEdit", ["roles.manage"], ["roles.manage"], { groupKey: "groupStaffSecurity" }),
    perm("settings.approval.view", "permApprovalRulesView", ["settings.approval_rules.view"], ["settings.approval_rules.view"], { groupKey: "groupStaffSecurity" }),
    perm("settings.approval.edit", "permApprovalRulesEdit", ["settings.approval_rules.edit"], ["settings.approval_rules.edit"], { groupKey: "groupStaffSecurity" }),
    perm("settings.dayOff.view", "permDayOffView", ["settings.day_off.view"], ["settings.day_off.view"], { groupKey: "groupStaffSecurity" }),
    perm("settings.dayOff.edit", "permDayOffEdit", ["settings.day_off.edit"], ["settings.day_off.edit"], { groupKey: "groupStaffSecurity" }),
    perm("settings.ot.view", "permOtView", ["settings.ot.view"], ["settings.ot.view"], { groupKey: "groupStaffSecurity" }),
    perm("settings.ot.edit", "permOtEdit", ["settings.ot.edit"], ["settings.ot.edit"], { groupKey: "groupStaffSecurity" }),
    perm("settings.loyalty.view", "permLoyaltyView", ["settings.loyalty.view"], ["settings.loyalty.view"], { groupKey: "groupCustomersSettings" }),
    perm("settings.loyalty.edit", "permLoyaltyEdit", ["settings.loyalty.edit"], ["settings.loyalty.edit"], { groupKey: "groupCustomersSettings" }),
    perm("settings.help.view", "permHelpView", ["settings.help.view"], ["settings.help.view"], { groupKey: "groupHelp" }),
  ]),
  module("staff", "moduleStaff", [
    perm("staff.view", "permissionView", ["staff.view"]),
    perm("staff.add", "permissionCreate", ["staff.create"]),
    perm("staff.edit", "permissionEdit", ["staff.edit"]),
    perm("staff.deactivate", "permDeactivate", ["staff.delete"]),
    perm("staff.changeRole", "permChangeRole", [FINE.staffChangeRole]),
    perm("staff.changeBranch", "permChangeBranch", [FINE.staffChangeBranch]),
    perm("staff.resetPassword", "permResetPassword", [FINE.staffResetPassword]),
    perm("staff.posAccess", "permPosAccess", [FINE.staffPosAccess]),
    perm("staff.backOfficeAccess", "permBackOfficeAccess", [FINE.staffBackOfficeAccess]),
    perm("staff.manageRoles", "permManageRoles", ["roles.manage"]),
  ]),
  module("approvals", "moduleApprovals", [
    perm("approvals.view", "permissionView", ["approvals.view"]),
    perm("approvals.approve", "permissionApprove", ["approvals.approve"]),
  ]),
];

const ownedKeys = new Set(
  ROLE_PERMISSION_MODULES.flatMap((entry) => entry.permissions.flatMap((item) => [...item.readKeys, ...item.writeKeys])),
);

export function recommendedPermissionKeys(template: RoleTemplateLabel) {
  return matrixToPermissionKeys(buildDefaultMatrix(), template);
}

export function emptyRoleDraft(): RolePermissionDraft {
  return Object.fromEntries(
    ROLE_PERMISSION_MODULES.map((entry) => [
      entry.id,
      {
        advanced: Object.fromEntries(entry.permissions.map((item) => [item.id, false])),
        enabled: false,
      },
    ]),
  );
}

export function draftFromPermissionKeys(keys: readonly string[], retained?: RolePermissionDraft | null): RolePermissionDraft {
  const granted = new Set(keys);
  const draft = emptyRoleDraft();
  for (const entry of ROLE_PERMISSION_MODULES) {
    for (const item of entry.permissions) {
      if (item.deferred) {
        draft[entry.id].advanced[item.id] = retained?.[entry.id]?.advanced[item.id] ?? false;
        continue;
      }
      draft[entry.id].advanced[item.id] = item.readKeys.some((key) => granted.has(key));
    }
    const savedEnabled = granted.has(moduleAccessKey(entry.id)) || entry.permissions.some((item) => {
      if (item.deferred || !draft[entry.id].advanced[item.id]) return false;
      if (entry.id === "settings" && item.writeKeys.every((key) => !key.startsWith("settings."))) return false;
      return true;
    });
    draft[entry.id].enabled = savedEnabled;
    if (!savedEnabled && retained?.[entry.id]) {
      draft[entry.id].advanced = { ...retained[entry.id].advanced };
      draft[entry.id].enabled = false;
    }
  }
  return draft;
}

export function recommendedRoleDraft(template: RoleTemplateLabel): RolePermissionDraft {
  const draft = draftFromPermissionKeys(recommendedPermissionKeys(template));
  if (template === "Staff/Cashier" && draft.pos?.enabled) {
    draft.pos.advanced["pos.hold"] = true;
    draft.pos.advanced["pos.reprint"] = true;
    draft.pos.advanced["pos.cashIn"] = true;
    draft.pos.advanced["pos.cashOut"] = true;
  }
  if (template === "Owner") {
    for (const entry of ROLE_PERMISSION_MODULES) {
      draft[entry.id].enabled = true;
      for (const item of entry.permissions) {
        if (!item.deferred) draft[entry.id].advanced[item.id] = true;
      }
    }
  }
  if (template === "Manager") {
    enableRecommended(draft, "reports", ["reports.historical", "reports.cost", "reports.profit", "reports.margin", "reports.export"]);
    enableRecommended(draft, "products", ["products.viewCost", "products.changeCost", "products.changePrice"]);
    enableRecommended(draft, "inventory", ["inventory.movement", "inventory.viewCost"]);
    enableRecommended(draft, "pos", ["pos.hold", "pos.discount", "pos.priceOverride", "pos.refund", "pos.void", "pos.reprint", "pos.cashIn", "pos.cashOut", "pos.openShift", "pos.closeShift"]);
    enableRecommended(draft, "staff", ["staff.changeRole", "staff.changeBranch", "staff.resetPassword", "staff.posAccess", "staff.backOfficeAccess"]);
    enableRecommended(draft, "dashboard", ["dashboard.sales", "dashboard.profit", "dashboard.cost", "dashboard.bills", "dashboard.avgBill", "dashboard.trend", "dashboard.bestSellers", "dashboard.recentBills", "dashboard.cashSession"]);
    enableRecommended(draft, "membership", ["membership.create", "membership.level.change"]);
  }
  if (template === "Staff/Cashier" && draft.dashboard) {
    for (const id of ["dashboard.sales", "dashboard.bills", "dashboard.avgBill", "dashboard.trend", "dashboard.bestSellers", "dashboard.recentBills", "dashboard.cashSession"]) {
      draft.dashboard.advanced[id] = true;
    }
    draft.dashboard.advanced["dashboard.profit"] = false;
    draft.dashboard.advanced["dashboard.cost"] = false;
  }
  return draft;
}

function enableRecommended(draft: RolePermissionDraft, moduleId: string, ids: string[]) {
  if (!draft[moduleId]?.enabled) return;
  for (const id of ids) draft[moduleId].advanced[id] = true;
}

const moduleKeyPrefixes: Record<string, readonly string[]> = {
  approvals: ["approvals."],
  customers: ["customers."],
  dashboard: ["dashboard."],
  inventory: ["inventory."],
  membership: ["membership.", "membership_levels."],
  pos: ["pos."],
  products: ["products.", "categories."],
  promotions: ["promotions.", "promotion."],
  purchasing: ["purchasing."],
  reports: ["reports."],
  settings: ["settings."],
  staff: ["staff.", "roles.", "users."],
  suppliers: ["suppliers."],
};

export function permissionKeysForDraft(draft: RolePermissionDraft, currentKeys: readonly string[]) {
  const disabledPrefixes = ROLE_PERMISSION_MODULES.filter((entry) => !draft[entry.id]?.enabled).flatMap((entry) => moduleKeyPrefixes[entry.id] ?? []);
  const next = new Set(currentKeys.filter((key) => !ownedKeys.has(key) && !disabledPrefixes.some((prefix) => key.startsWith(prefix))));
  for (const entry of ROLE_PERMISSION_MODULES) {
    if (!draft[entry.id]?.enabled) continue;
    next.add(moduleAccessKey(entry.id));
    for (const item of entry.permissions) {
      if (item.deferred || !draft[entry.id].advanced[item.id]) continue;
      for (const key of item.writeKeys) next.add(key);
    }
  }
  if ([...next].some((key) => key.startsWith("settings.") && key.endsWith(".view"))) next.add("settings.view");
  if ([...next].some((key) => key.startsWith("settings.") && key.endsWith(".edit"))) {
    next.add("settings.edit");
    next.add("settings.manage");
  }
  next.add(FINE_MARKER);
  next.add(PHASE3_MARKER);
  return [...next];
}

export function setRoleModuleEnabled(draft: RolePermissionDraft, moduleId: string, enabled: boolean, template: RoleTemplateLabel) {
  const next = cloneDraft(draft);
  const current = next[moduleId];
  if (!current) return next;
  current.enabled = enabled;
  if (enabled && !Object.values(current.advanced).some(Boolean)) {
    const recommended = recommendedRoleDraft(template)[moduleId]?.advanced ?? {};
    const gate = ROLE_PERMISSION_MODULES.find((entry) => entry.id === moduleId)?.permissions.find((item) => !item.deferred);
    current.advanced = Object.values(recommended).some(Boolean) || !gate ? { ...recommended } : { ...recommended, [gate.id]: true };
  }
  return next;
}

export function toggleRoleAdvanced(draft: RolePermissionDraft, moduleId: string, permissionId: string) {
  const next = cloneDraft(draft);
  const entry = ROLE_PERMISSION_MODULES.find((item) => item.id === moduleId);
  const permission = entry?.permissions.find((item) => item.id === permissionId);
  if (!entry || !permission || !next[moduleId]) return next;
  const value = !next[moduleId].advanced[permissionId];
  const shared = new Set(permission.writeKeys);
  for (const item of entry.permissions) {
    if (item.id === permissionId || (shared.size > 0 && item.writeKeys.some((key) => shared.has(key)))) {
      next[moduleId].advanced[item.id] = value;
    }
  }
  return next;
}

export function roleDraftsEqual(left: RolePermissionDraft, right: RolePermissionDraft) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export type RoleAccessPreview = {
  hidden: string[];
  reports: Array<{ deferred: boolean; enabled: boolean; id: string }>;
  sensitive: Array<{ deferred: boolean; enabled: boolean; id: string }>;
  visible: string[];
};

export function previewRoleAccess(draft: RolePermissionDraft): RoleAccessPreview {
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const entry of ROLE_PERMISSION_MODULES) {
    (draft[entry.id]?.enabled ? visible : hidden).push(entry.id);
  }
  const reports = ROLE_PERMISSION_MODULES.find((entry) => entry.id === "reports")?.permissions ?? [];
  const sensitive = ROLE_PERMISSION_MODULES.flatMap((entry) => entry.permissions.filter((item) => item.sensitive));
  return {
    hidden,
    reports: reports.map((item) => ({
      deferred: Boolean(item.deferred),
      enabled: Boolean(draft.reports?.enabled && draft.reports.advanced[item.id]),
      id: item.id,
    })),
    sensitive: sensitive.map((item) => {
      const moduleId = item.id.split(".")[0];
      return {
        deferred: Boolean(item.deferred),
        enabled: Boolean(draft[moduleId]?.enabled && draft[moduleId]?.advanced[item.id]),
        id: item.id,
      };
    }),
    visible,
  };
}

export function enabledModuleCount(draft: RolePermissionDraft) {
  return ROLE_PERMISSION_MODULES.filter((entry) => draft[entry.id]?.enabled).length;
}

export const ROLE_TEMPLATE_ORDER: RoleTemplateLabel[] = ["Owner", "Manager", "Staff/Cashier", "Custom"];

function module(id: string, labelKey: string, permissions: RolePermissionDef[]): RoleModuleDef {
  return { id, labelKey, permissions };
}

function perm(
  id: string,
  labelKey: string,
  writeKeys: readonly string[],
  readKeys: readonly string[] = writeKeys,
  flags: { groupKey?: string; report?: boolean; sensitive?: boolean } = {},
): RolePermissionDef {
  return { id, labelKey, readKeys, writeKeys, ...flags };
}

function deferred(id: string, labelKey: string, sensitive = false, report = false): RolePermissionDef {
  return { deferred: true, id, labelKey, readKeys: [], report, sensitive, writeKeys: [] };
}

function cloneDraft(draft: RolePermissionDraft): RolePermissionDraft {
  return Object.fromEntries(
    Object.entries(draft).map(([id, entry]) => [id, { advanced: { ...entry.advanced }, enabled: entry.enabled }]),
  );
}
