import {
  buildDefaultMatrix,
  matrixToPermissionKeys,
  type RoleTemplateLabel,
} from "@/features/access-control/permission-catalog";

export type RolePermissionDef = {
  deferred?: boolean;
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

const shiftKeys = ["pos.cash_session.manage"] as const;

export const ROLE_PERMISSION_MODULES: readonly RoleModuleDef[] = [
  module("dashboard", "moduleDashboard", [
    perm("dashboard.view", "permissionView", ["dashboard.view"]),
  ]),
  module("pos", "modulePos", [
    perm("pos.view", "permissionView", ["pos.view"]),
    perm("pos.sell", "permSell", ["pos.create"], ["pos.create", "pos.sell"]),
    perm("pos.print", "permissionPrint", ["pos.print"]),
    deferred("pos.hold", "permHoldResume"),
    deferred("pos.discount", "permDiscount"),
    deferred("pos.priceOverride", "permPriceOverride", true),
    deferred("pos.refund", "permRefund", true),
    deferred("pos.void", "permVoid"),
    deferred("pos.reprint", "permReprint"),
    deferred("pos.cashIn", "permCashIn", true),
    deferred("pos.cashOut", "permCashOut", true),
    perm("pos.openShift", "permOpenShift", shiftKeys),
    perm("pos.closeShift", "permCloseShift", shiftKeys),
  ]),
  module("products", "moduleProducts", [
    perm("products.view", "permissionView", ["products.view"]),
    perm("products.create", "permissionCreate", ["products.create"]),
    perm("products.edit", "permissionEdit", ["products.edit"], ["products.edit", "products.update"]),
    perm("products.archive", "permArchive", ["products.delete"]),
    deferred("products.viewCost", "permViewCost", true),
    deferred("products.changeCost", "permChangeCost", true),
    deferred("products.changePrice", "permChangePrice", true),
    perm("products.printBarcode", "permPrintBarcode", ["products.print"]),
  ]),
  module("inventory", "moduleInventory", [
    perm("inventory.view", "permissionView", ["inventory.view"]),
    perm("inventory.stockIn", "permStockIn", ["inventory.stock_in"]),
    perm("inventory.adjustment", "permAdjustment", ["inventory.adjust"]),
    perm("inventory.count", "permCount", ["inventory.count"]),
    deferred("inventory.movement", "permMovement"),
    deferred("inventory.viewCost", "permViewCost", true),
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
    perm("membership.edit", "permissionEdit", ["membership.edit"], ["membership.edit", "membership_levels.manage"]),
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
    deferred("reports.historical", "reportsHistorical", false, true),
    deferred("reports.cost", "reportsCost", true, true),
    deferred("reports.profit", "reportsProfit", true, true),
    deferred("reports.margin", "reportsMargin", true, true),
    perm("reports.export", "permissionExport", ["reports.export"], ["reports.export"], { report: true }),
  ]),
  module("settings", "moduleSettings", [
    perm("settings.view", "permissionView", ["settings.view"]),
    perm("settings.edit", "permissionEdit", ["settings.edit"], ["settings.edit", "settings.manage"]),
  ]),
  module("staff", "moduleStaff", [
    perm("staff.view", "permissionView", ["staff.view"]),
    perm("staff.add", "permissionCreate", ["staff.create"]),
    perm("staff.edit", "permissionEdit", ["staff.edit"]),
    perm("staff.deactivate", "permDeactivate", ["staff.delete"]),
    deferred("staff.changeRole", "permChangeRole"),
    deferred("staff.changeBranch", "permChangeBranch"),
    deferred("staff.resetPassword", "permResetPassword"),
    deferred("staff.posAccess", "permPosAccess"),
    deferred("staff.backOfficeAccess", "permBackOfficeAccess"),
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
    const savedEnabled = entry.permissions.some((item) => !item.deferred && draft[entry.id].advanced[item.id]);
    draft[entry.id].enabled = savedEnabled;
    if (!savedEnabled && retained?.[entry.id]) {
      draft[entry.id].advanced = { ...retained[entry.id].advanced };
      draft[entry.id].enabled = false;
    }
  }
  return draft;
}

export function recommendedRoleDraft(template: RoleTemplateLabel): RolePermissionDraft {
  return draftFromPermissionKeys(recommendedPermissionKeys(template));
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
    const gate = entry.permissions.find((item) => !item.deferred && item.writeKeys.length > 0);
    for (const key of gate?.writeKeys ?? []) next.add(key);
    for (const item of entry.permissions) {
      if (item.deferred || !draft[entry.id].advanced[item.id]) continue;
      for (const key of item.writeKeys) next.add(key);
    }
  }
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
  sensitive: Array<{ enabled: boolean; id: string }>;
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
      return { enabled: Boolean(draft[moduleId]?.enabled && draft[moduleId]?.advanced[item.id]), id: item.id };
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
  flags: { report?: boolean; sensitive?: boolean } = {},
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
