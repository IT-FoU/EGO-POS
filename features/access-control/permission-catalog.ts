export const PERMISSION_MODULE_LABELS = [
  "Dashboard",
  "POS",
  "Products",
  "Inventory",
  "Purchasing",
  "Customers",
  "Membership",
  "Promotions",
  "Reports",
  "Settings",
  "Staff",
  "Approvals",
] as const;

export const PERMISSION_ACTION_LABELS = [
  "View",
  "Create",
  "Edit",
  "Delete",
  "Approve",
  "Export",
  "Print",
] as const;

export type PermissionModuleLabel = (typeof PERMISSION_MODULE_LABELS)[number];
export type PermissionActionLabel = (typeof PERMISSION_ACTION_LABELS)[number];

const MODULE_KEY_BY_LABEL: Record<PermissionModuleLabel, string> = {
  Approvals: "approvals",
  Customers: "customers",
  Dashboard: "dashboard",
  Inventory: "inventory",
  Membership: "membership",
  POS: "pos",
  Products: "products",
  Promotions: "promotions",
  Purchasing: "purchasing",
  Reports: "reports",
  Settings: "settings",
  Staff: "staff",
};

const ACTION_KEY_BY_LABEL: Record<PermissionActionLabel, string> = {
  Approve: "approve",
  Create: "create",
  Delete: "delete",
  Edit: "edit",
  Export: "export",
  Print: "print",
  View: "view",
};

export const ROLE_TEMPLATE_LABELS = ["Owner", "Manager", "Staff/Cashier", "Custom"] as const;
export type RoleTemplateLabel = (typeof ROLE_TEMPLATE_LABELS)[number];

export const ROLE_TEMPLATE_KEY_BY_LABEL: Record<RoleTemplateLabel, string> = {
  Custom: "custom",
  Manager: "manager",
  Owner: "owner",
  "Staff/Cashier": "cashier",
};

export const ROLE_LABEL_BY_TEMPLATE_KEY: Record<string, RoleTemplateLabel> = {
  cashier: "Staff/Cashier",
  custom: "Custom",
  manager: "Manager",
  owner: "Owner",
};

export const APPROVAL_RULE_KEYS = [
  "discount",
  "refund",
  "stock_adjustment",
  "purchasing",
] as const;

export type ApprovalRuleKey = (typeof APPROVAL_RULE_KEYS)[number];

export const APPROVAL_RULE_LABELS: Record<ApprovalRuleKey, string> = {
  discount: "Discount above allowed limit",
  purchasing: "Purchase order above amount",
  refund: "Refund",
  stock_adjustment: "Stock adjustment",
};

export function matrixPermissionKey(moduleLabel: PermissionModuleLabel, actionLabel: PermissionActionLabel) {
  return `${MODULE_KEY_BY_LABEL[moduleLabel]}.${ACTION_KEY_BY_LABEL[actionLabel]}`;
}

export function matrixPermissionLabel(moduleLabel: PermissionModuleLabel, actionLabel: PermissionActionLabel) {
  return `${moduleLabel} ${actionLabel}`;
}

export const MATRIX_PERMISSION_ENTRIES = PERMISSION_MODULE_LABELS.flatMap((moduleLabel) =>
  PERMISSION_ACTION_LABELS.map((actionLabel) => ({
    actionLabel,
    key: matrixPermissionKey(moduleLabel, actionLabel),
    module: MODULE_KEY_BY_LABEL[moduleLabel],
    moduleLabel,
    name: matrixPermissionLabel(moduleLabel, actionLabel),
  })),
);

export const LEGACY_PERMISSION_ENTRIES = [
  ["audit.view", "View audit logs", "audit"],
  ["branch.manage", "Manage branches", "company"],
  ["categories.manage", "Manage categories", "products"],
  ["company.manage", "Manage companies", "company"],
  ["customers.create", "Create customers", "customers"],
  ["customers.payment", "Record customer payments", "customers"],
  ["customers.update", "Update customers", "customers"],
  ["inventory.adjust", "Adjust inventory", "inventory"],
  ["inventory.count", "Count inventory", "inventory"],
  ["inventory.stock_in", "Stock in inventory", "inventory"],
  ["membership_levels.manage", "Manage membership levels", "membership"],
  ["pos.sell", "Sell at POS", "pos"],
  ["products.create", "Create products", "products"],
  ["products.delete", "Delete products", "products"],
  ["products.update", "Update products", "products"],
  ["promotion.activate", "Activate promotions", "promotions"],
  ["promotion.analytics.view", "View promotion analytics", "promotions"],
  ["promotion.approve", "Approve promotions", "promotions"],
  ["promotion.coupon.manage", "Manage promotion coupons", "promotions"],
  ["promotion.create", "Create promotions", "promotions"],
  ["promotion.delete", "Delete promotions", "promotions"],
  ["promotion.edit", "Edit promotions", "promotions"],
  ["promotion.nearExpiry.manage", "Manage near-expiry promotions", "promotions"],
  ["promotion.slowMoving.manage", "Manage slow-moving promotions", "promotions"],
  ["promotion.stackRules.manage", "Manage promotion stack rules", "promotions"],
  ["promotion.view", "View promotions", "promotions"],
  ["promotions.create", "Create promotions module records", "promotions"],
  ["promotions.delete", "Delete promotions module records", "promotions"],
  ["promotions.update", "Update promotions module records", "promotions"],
  ["purchasing.create", "Create purchasing records", "purchasing"],
  ["purchasing.payment", "Record purchasing payments", "purchasing"],
  ["purchasing.receive", "Receive purchased goods", "purchasing"],
  ["roles.manage", "Manage roles and permissions", "staff"],
  ["settings.manage", "Manage settings", "settings"],
  ["suppliers.create", "Create suppliers", "purchasing"],
  ["suppliers.delete", "Delete suppliers", "purchasing"],
  ["suppliers.update", "Update suppliers", "purchasing"],
  ["users.manage", "Manage users", "staff"],
  ["warehouse.manage", "Manage warehouses", "inventory"],
] as const;

export const PERMISSION_ALIAS_GROUPS: Record<string, string[]> = {
  "categories.manage": ["products.edit", "categories.manage"],
  "customers.create": ["customers.create"],
  "customers.payment": ["customers.edit", "customers.payment"],
  "customers.update": ["customers.edit", "customers.update"],
  "inventory.adjust": ["inventory.edit", "inventory.adjust"],
  "inventory.count": ["inventory.edit", "inventory.count"],
  "inventory.stock_in": ["inventory.create", "inventory.stock_in"],
  "membership_levels.manage": ["membership.edit", "membership_levels.manage"],
  "pos.sell": ["pos.create", "pos.sell"],
  "products.create": ["products.create"],
  "products.delete": ["products.delete"],
  "products.update": ["products.edit", "products.update"],
  "promotion.activate": ["promotions.edit", "promotion.activate"],
  "promotion.analytics.view": ["promotions.view", "promotion.analytics.view"],
  "promotion.approve": ["promotions.approve", "promotion.approve"],
  "promotion.coupon.manage": ["promotions.edit", "promotion.coupon.manage"],
  "promotion.create": ["promotions.create", "promotion.create"],
  "promotion.delete": ["promotions.delete", "promotion.delete"],
  "promotion.edit": ["promotions.edit", "promotion.edit"],
  "promotion.nearExpiry.manage": ["promotions.edit", "promotion.nearExpiry.manage"],
  "promotion.slowMoving.manage": ["promotions.edit", "promotion.slowMoving.manage"],
  "promotion.stackRules.manage": ["promotions.edit", "promotion.stackRules.manage"],
  "promotion.view": ["promotions.view", "promotion.view"],
  "promotions.create": ["promotions.create"],
  "promotions.delete": ["promotions.delete"],
  "promotions.update": ["promotions.edit", "promotions.update"],
  "purchasing.create": ["purchasing.create"],
  "purchasing.payment": ["purchasing.edit", "purchasing.payment"],
  "purchasing.receive": ["purchasing.edit", "purchasing.receive"],
  "roles.manage": ["staff.edit", "roles.manage"],
  "settings.manage": ["settings.edit", "settings.manage"],
  "suppliers.create": ["purchasing.create", "suppliers.create"],
  "suppliers.delete": ["purchasing.delete", "suppliers.delete"],
  "suppliers.update": ["purchasing.edit", "suppliers.update"],
  "users.manage": ["staff.create", "staff.edit", "users.manage"],
  "approvals.approve": ["approvals.approve", "settings.approve"],
  "warehouse.manage": ["inventory.edit", "warehouse.manage"],
};

export function permissionKeysForCheck(permission: string) {
  return PERMISSION_ALIAS_GROUPS[permission] ?? [permission];
}

export function buildDefaultMatrix() {
  return Object.fromEntries(
    ROLE_TEMPLATE_LABELS.map((roleLabel) => [
      roleLabel,
      Object.fromEntries(
        PERMISSION_MODULE_LABELS.map((moduleLabel) => [
          moduleLabel,
          Object.fromEntries(
            PERMISSION_ACTION_LABELS.map((actionLabel) => [
              actionLabel,
              roleLabel === "Owner"
                ? true
                : roleLabel === "Manager"
                  ? moduleLabel !== "Settings" && actionLabel !== "Delete"
                  : moduleLabel === "POS" && ["View", "Create", "Print"].includes(actionLabel),
            ]),
          ),
        ]),
      ),
    ]),
  ) as Record<RoleTemplateLabel, Record<PermissionModuleLabel, Record<PermissionActionLabel, boolean>>>;
}

export function matrixToPermissionKeys(
  matrix: Record<RoleTemplateLabel, Record<PermissionModuleLabel, Record<PermissionActionLabel, boolean>>>,
  roleLabel: RoleTemplateLabel,
) {
  return PERMISSION_MODULE_LABELS.flatMap((moduleLabel) =>
    PERMISSION_ACTION_LABELS.filter((actionLabel) => matrix[roleLabel][moduleLabel][actionLabel]).map((actionLabel) =>
      matrixPermissionKey(moduleLabel, actionLabel),
    ),
  );
}
