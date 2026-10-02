import { draftFromPermissionKeys } from "@/features/access-control/role-permission-v2";

/**
 * Canonical module access for Phase 4.
 * Account flags and Owner bypass are applied by lib/auth/module-access.ts.
 * Activity Logs map to Settings OR Staff, plus the existing own-store activity action.
 * Roles administration stays on roles.manage and is not granted by staff.edit.
 *
 * Role-name checks that remain until Phase 5:
 * - STORE_PERMISSION_MATRIX action policy (refund, void, PIN, product writes, inventory actions)
 * - Reports full-store vs own-shift split after the Reports module is on
 * - canSessionViewProfit still hides profit for cashier/staff role names inside an allowed Dashboard
 * - POS own-shift API stays on the POS module plus the existing own-shift action
 */

export const CANONICAL_MODULES = [
  "dashboard",
  "pos",
  "products",
  "inventory",
  "purchasing",
  "suppliers",
  "customers",
  "membership",
  "promotions",
  "reports",
  "settings",
  "staff",
  "approvals",
] as const;

export type CanonicalModuleId = (typeof CANONICAL_MODULES)[number];

export const MODULE_PAGE_HREFS: Record<Exclude<CanonicalModuleId, "approvals"> | "activity", string> = {
  activity: "/activity-logs",
  customers: "/customers",
  dashboard: "/dashboard",
  inventory: "/inventory",
  membership: "/membership-levels",
  pos: "/pos",
  products: "/products",
  promotions: "/promotions",
  purchasing: "/purchasing",
  reports: "/reports",
  settings: "/settings",
  staff: "/settings/staff",
  suppliers: "/suppliers",
};

const PERMISSION_PREFIXES: Array<[string, CanonicalModuleId]> = [
  ["approvals.", "approvals"],
  ["audit.", "settings"],
  ["categories.", "products"],
  ["customers.", "customers"],
  ["dashboard.", "dashboard"],
  ["dashboards.", "dashboard"],
  ["inventory.", "inventory"],
  ["membership.", "membership"],
  ["membership_levels.", "membership"],
  ["pos.", "pos"],
  ["products.", "products"],
  ["promotion.", "promotions"],
  ["promotions.", "promotions"],
  ["purchasing.", "purchasing"],
  ["reports.", "reports"],
  ["settings.", "settings"],
  ["staff.", "staff"],
  ["suppliers.", "suppliers"],
  ["users.", "staff"],
  ["warehouse.", "inventory"],
];

const API_PREFIXES: Array<[string, CanonicalModuleId]> = [
  ["/api/pos", "pos"],
  ["/api/products", "products"],
  ["/api/inventory", "inventory"],
  ["/api/purchasing", "purchasing"],
  ["/api/suppliers", "suppliers"],
  ["/api/customers", "customers"],
  ["/api/membership-levels", "membership"],
  ["/api/promotions", "promotions"],
  ["/api/reports", "reports"],
  ["/api/settings", "settings"],
  ["/api/staff", "staff"],
  ["/api/approvals", "approvals"],
];

const LANDING_ORDER = [
  "products",
  "inventory",
  "purchasing",
  "suppliers",
  "customers",
  "membership",
  "promotions",
  "reports",
  "settings",
  "staff",
] as const;

export function isCanonicalModuleEnabled(moduleId: CanonicalModuleId, keys: readonly string[]) {
  if (keys.includes("*")) return true;
  return Boolean(draftFromPermissionKeys(keys)[moduleId]?.enabled);
}

export function moduleForPermissionKey(permission: string | null | undefined): CanonicalModuleId | null {
  const key = String(permission ?? "");
  if (key === "roles.manage") return null;
  const match = PERMISSION_PREFIXES.find(([prefix]) => key.startsWith(prefix));
  return match?.[1] ?? null;
}

export function moduleForApiPath(pathname: string | null | undefined): CanonicalModuleId | "activity" | null {
  const path = String(pathname ?? "");
  if (path === "/api/store/activity-logs" || path.startsWith("/api/store/activity-logs/")) return "activity";
  const match = API_PREFIXES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  return match?.[1] ?? null;
}

export function moduleForPagePath(pathname: string | null | undefined): CanonicalModuleId | "activity" | "roles" | null {
  const path = String(pathname ?? "");
  if (path === "/activity-logs" || path.startsWith("/activity-logs/")) return "activity";
  if (path === "/settings/roles" || path.startsWith("/settings/roles/")) return "roles";
  if (path === "/settings/staff" || path.startsWith("/settings/staff/")) return "staff";
  if (path === "/settings/day-off" || path.startsWith("/settings/day-off/")) return "staff";
  if (path === "/settings/ot" || path.startsWith("/settings/ot/")) return "staff";
  if (path === "/settings/approval-rules" || path.startsWith("/settings/approval-rules/")) return "staff";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  const entries = Object.entries(MODULE_PAGE_HREFS) as Array<[string, string]>;
  const match = entries.find(([, href]) => href !== "/settings" && href !== "/settings/staff" && (path === href || path.startsWith(`${href}/`)));
  if (!match) return null;
  return match[0] as CanonicalModuleId | "activity";
}

export function landingPathForAccess(input: {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  isOwner: boolean;
  keys: readonly string[];
}) {
  const allowed = (moduleId: CanonicalModuleId) => {
    if (moduleId === "pos" ? !input.allowPosAccess : !input.allowBackOfficeAccess) return false;
    return input.isOwner || isCanonicalModuleEnabled(moduleId, input.keys);
  };
  if (allowed("dashboard")) return MODULE_PAGE_HREFS.dashboard;
  if (allowed("pos")) return MODULE_PAGE_HREFS.pos;
  if (!input.allowBackOfficeAccess) return null;
  for (const moduleId of LANDING_ORDER) {
    if (moduleId === "settings") {
      if (allowed("settings") || allowed("staff")) return MODULE_PAGE_HREFS.settings;
      continue;
    }
    if (allowed(moduleId)) return MODULE_PAGE_HREFS[moduleId];
  }
  return null;
}

const SETTINGS_PAGE_HREFS = [
  "/settings/company-profile",
  "/settings/business-logo",
  "/settings/branch-information",
  "/settings/tax",
  "/settings/cash-shift",
  "/settings/receipt",
  "/settings/qr-payments",
  "/settings/customer-display",
  "/settings/loyalty",
  "/settings/help",
];

const STAFF_PAGE_HREFS = [
  "/settings/staff",
  "/settings/approval-rules",
  "/settings/day-off",
  "/settings/ot",
];

export function settingsLandingHrefs(input: {
  allowBackOfficeAccess: boolean;
  isOwner: boolean;
  keys: readonly string[];
}) {
  if (!input.allowBackOfficeAccess) return [];
  const enabled = (moduleId: CanonicalModuleId) => input.isOwner || isCanonicalModuleEnabled(moduleId, input.keys);
  const hrefs: string[] = [];
  if (enabled("settings")) hrefs.push(...SETTINGS_PAGE_HREFS);
  if (enabled("staff")) hrefs.push(...STAFF_PAGE_HREFS);
  if (input.isOwner || input.keys.includes("*") || input.keys.includes("roles.manage")) hrefs.push("/settings/roles");
  if (enabled("membership")) hrefs.push(MODULE_PAGE_HREFS.membership);
  if (enabled("reports")) hrefs.push("/reports/inventory/reorder");
  if (enabled("settings") || enabled("staff")) hrefs.push(MODULE_PAGE_HREFS.activity);
  return hrefs;
}

export function visibleNavigationKeys(input: {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  isOwner: boolean;
  keys: readonly string[];
}) {
  const keys: string[] = [];
  const enabled = (moduleId: CanonicalModuleId) => input.isOwner || isCanonicalModuleEnabled(moduleId, input.keys);
  if (input.allowBackOfficeAccess && enabled("dashboard")) keys.push("dashboard");
  if (input.allowPosAccess && enabled("pos")) keys.push("pos");
  if (input.allowBackOfficeAccess) {
    for (const moduleId of ["products", "inventory", "purchasing", "customers", "membership", "suppliers", "promotions", "reports"] as const) {
      if (enabled(moduleId)) keys.push(moduleId);
    }
    if (enabled("settings") || enabled("staff")) keys.push("activity");
    if (enabled("settings") || enabled("staff")) keys.push("settings");
  }
  return keys;
}
