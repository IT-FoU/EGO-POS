/**
 * Phase 3 roles and permissions foundation. Static + pure. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSION_ALIAS_GROUPS } from "../features/access-control/permission-catalog";
import {
  permissionKeysForDraft,
  previewRoleAccess,
  recommendedPermissionKeys,
  recommendedRoleDraft,
  setRoleModuleEnabled,
} from "../features/access-control/role-permission-v2";
import { NEW_STAFF_DEFAULTS } from "../features/access-control/staff-account";
import { settingsCopyKeyParity, tSettings } from "../lib/i18n/settings-copy";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

const cashierKeys = recommendedPermissionKeys("Staff/Cashier");
const managerKeys = recommendedPermissionKeys("Manager");
const cashierDraft = recommendedRoleDraft("Staff/Cashier");
const managerDraft = recommendedRoleDraft("Manager");
const cashierSaved = permissionKeysForDraft(cashierDraft, cashierKeys);
const managerSaved = permissionKeysForDraft(managerDraft, managerKeys);
const cashierPreview = previewRoleAccess(cashierDraft);
const managerOff = setRoleModuleEnabled(managerDraft, "products", false, "Manager");
const panel = read("features/settings/components/role-permissions-panel.tsx");
const staff = read("features/settings/components/staff-control-section.tsx");
const repo = read("features/access-control/prisma-repository.ts");
const catalog = read("features/access-control/permission-catalog.ts");

const cashierSaveExtras = new Set([
  "access.fine_v5",
  "access.phase3",
  "pos.access",
  "pos.cash_in",
  "pos.cash_out",
  "pos.hold",
  "pos.reprint",
]);
const cashierSavedExtras = cashierSaved.filter((key) => !cashierKeys.includes(key));
const cashierDashboard = cashierDraft.dashboard?.advanced ?? {};
check("cashier default stays POS view, create, and print", cashierKeys.every((key) => ["pos.view", "pos.create", "pos.print"].includes(key)) && cashierKeys.length === 3);
check(
  "cashier save does not broaden keys",
  cashierKeys.every((key) => cashierSaved.includes(key)) &&
    cashierSavedExtras.length === cashierSaveExtras.size &&
    cashierSavedExtras.every((key) => cashierSaveExtras.has(key)) &&
    !cashierSaved.some((key) => key.startsWith("settings.") || key === "roles.manage" || key === "pos.refund" || key === "pos.void" || key === "pos.price_override" || key === "dashboard.profit.view" || key === "dashboard.cost.view" || key.endsWith(".delete")) &&
    cashierDraft.dashboard?.enabled === false &&
    cashierDashboard["dashboard.sales"] === true &&
    cashierDashboard["dashboard.bills"] === true &&
    cashierDashboard["dashboard.avgBill"] === true &&
    cashierDashboard["dashboard.trend"] === true &&
    cashierDashboard["dashboard.bestSellers"] === true &&
    cashierDashboard["dashboard.recentBills"] === true &&
    cashierDashboard["dashboard.cashSession"] === true &&
    cashierDashboard["dashboard.profit"] === false &&
    cashierDashboard["dashboard.cost"] === false,
);
check("cashier configured sidebar is POS only", cashierPreview.visible.length === 1 && cashierPreview.visible[0] === "pos" && cashierPreview.hidden.includes("products") && cashierPreview.hidden.includes("settings") && cashierPreview.hidden.includes("staff"));
check("manager default excludes settings, delete, and role admin", !managerKeys.some((key) => key.startsWith("settings.") || key.endsWith(".delete") || key === "roles.manage"));
check("manager save keeps current keys and does not add role admin", managerKeys.every((key) => managerSaved.includes(key)) && !managerSaved.includes("roles.manage") && !managerSaved.some((key) => key.startsWith("settings.")));
check("module off keeps the choice but omits its keys", Boolean(managerOff.products?.advanced["products.view"]) && !permissionKeysForDraft(managerOff, managerKeys).some((key) => key.startsWith("products.")));
check("enabled fine-grained refund is saved", permissionKeysForDraft({ ...cashierDraft, pos: { ...cashierDraft.pos, advanced: { ...cashierDraft.pos.advanced, "pos.refund": true, "pos.priceOverride": true } } }, cashierKeys).includes("pos.refund") && permissionKeysForDraft({ ...cashierDraft, pos: { ...cashierDraft.pos, advanced: { ...cashierDraft.pos.advanced, "pos.refund": true, "pos.priceOverride": true } } }, cashierKeys).includes("pos.price_override"));
check("preview separates configured reports from deferred cost", !cashierPreview.reports.find((item) => item.id === "reports.cost")?.enabled && cashierPreview.reports.find((item) => item.id === "reports.cost")?.deferred === false && cashierPreview.sensitive.filter((item) => item.id === "reports.cost" || item.id === "reports.profit").every((item) => !item.enabled));
check("owner role save stays protected", repo.includes("isProtectedOwnerRole") && repo.includes("Owner permissions cannot be changed."));
check("role admin still uses roles.manage only", PERMISSION_ALIAS_GROUPS["roles.manage"].join() === "roles.manage" && catalog.includes('"roles.manage": ["roles.manage"]'));
check("approval rules stay separate from role editor", staff.includes("APPROVAL_RULE_LABELS") && panel.includes("/settings/approval-rules") && !panel.includes("thresholdLak"));
check("new staff defaults stay cashier-safe", NEW_STAFF_DEFAULTS.allowPosAccess === true && NEW_STAFF_DEFAULTS.allowBackOfficeAccess === false);
check("staff preset architecture is present", staff.includes("cashierDefault") && staff.includes("lastUsedPreset") && staff.includes("individualOverridesLater") && staff.includes("effectiveAccessPreview") && !staff.includes("user_permission_overrides"));
check("copy parity and Lao labels", settingsCopyKeyParity() && tSettings("moduleAccess", "lo") !== tSettings("moduleAccess", "en") && tSettings("previewAccess", "lo") !== "previewAccess");
check("no runtime engine rewrite", !panel.includes("STORE_PERMISSION_MATRIX") && !read("features/permissions/store-permissions.ts").includes("ROLE_PERMISSION_MODULES"));

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
