/**
 * Phase 4 module enforcement. Pure checks. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isCanonicalModuleEnabled,
  landingPathForAccess,
  moduleForApiPath,
  moduleForPermissionKey,
  settingsLandingHrefs,
  visibleNavigationKeys,
} from "../features/access-control/module-access";
import {
  emptyRoleDraft,
  permissionKeysForDraft,
  recommendedPermissionKeys,
  recommendedRoleDraft,
  setRoleModuleEnabled,
} from "../features/access-control/role-permission-v2";
import { permissionKeysForCheck } from "../features/access-control/permission-catalog";

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
let customDraft = emptyRoleDraft();
customDraft = setRoleModuleEnabled(customDraft, "products", true, "Custom");
customDraft = setRoleModuleEnabled(customDraft, "inventory", true, "Custom");
const customKeys = permissionKeysForDraft(customDraft, []);
const managerProductsOff = permissionKeysForDraft(setRoleModuleEnabled(recommendedRoleDraft("Manager"), "products", false, "Manager"), managerKeys);

const flags = { allowBackOfficeAccess: true, allowPosAccess: true, isOwner: false };
const customNav = visibleNavigationKeys({ ...flags, allowPosAccess: false, keys: customKeys });
const managerNav = visibleNavigationKeys({ ...flags, keys: managerKeys });
const managerProductsOffNav = visibleNavigationKeys({ ...flags, keys: managerProductsOff });
const cashierNav = visibleNavigationKeys({ ...flags, allowBackOfficeAccess: false, keys: cashierKeys });
const ownerNav = visibleNavigationKeys({ allowBackOfficeAccess: true, allowPosAccess: true, isOwner: true, keys: [] });
const gatedNav = visibleNavigationKeys({ allowBackOfficeAccess: false, allowPosAccess: true, isOwner: false, keys: ["products.view", "pos.view"] });
const posOffNav = visibleNavigationKeys({ allowBackOfficeAccess: true, allowPosAccess: false, isOwner: false, keys: ["pos.view", "products.view"] });

check("cashier module access is POS only", isCanonicalModuleEnabled("pos", cashierKeys) && !isCanonicalModuleEnabled("products", cashierKeys) && !isCanonicalModuleEnabled("customers", cashierKeys) && !isCanonicalModuleEnabled("reports", cashierKeys));
check("custom mixed modules follow saved keys", isCanonicalModuleEnabled("products", customKeys) && isCanonicalModuleEnabled("inventory", customKeys) && !isCanonicalModuleEnabled("dashboard", customKeys) && !isCanonicalModuleEnabled("pos", customKeys) && !isCanonicalModuleEnabled("reports", customKeys));
check("custom navigation hides denied modules", customNav.includes("products") && customNav.includes("inventory") && !customNav.includes("dashboard") && !customNav.includes("pos") && !customNav.includes("reports"));
check("manager products off removes products only", managerNav.includes("products") && !managerProductsOffNav.includes("products") && managerProductsOffNav.includes("inventory"));
check("default manager does not gain suppliers from inventory", !isCanonicalModuleEnabled("suppliers", managerKeys) && !managerNav.includes("suppliers") && isCanonicalModuleEnabled("purchasing", managerKeys) && isCanonicalModuleEnabled("membership", managerKeys) && isCanonicalModuleEnabled("promotions", managerKeys));
check("back office off blocks back office modules", !gatedNav.includes("products") && gatedNav.includes("pos"));
check("pos off blocks pos even when the module key exists", !posOffNav.includes("pos") && posOffNav.includes("products"));
check("owner bypasses module rows when account flags are on", ownerNav.includes("dashboard") && ownerNav.includes("pos") && ownerNav.includes("settings") && ownerNav.includes("reports"));
check("owner still loses back office when the account flag is off", !visibleNavigationKeys({ allowBackOfficeAccess: false, allowPosAccess: true, isOwner: true, keys: [] }).includes("products"));
check("both flags off leave no operational navigation", visibleNavigationKeys({ allowBackOfficeAccess: false, allowPosAccess: false, isOwner: false, keys: managerKeys }).length === 0);
check("leftover inventory.edit does not turn inventory on", !isCanonicalModuleEnabled("inventory", ["inventory.edit"]) && !isCanonicalModuleEnabled("products", ["inventory.edit"]));
check("module off is authoritative over a stored view key", !isCanonicalModuleEnabled("products", managerProductsOff));
check("advanced alias does not satisfy a module that is off", permissionKeysForCheck("inventory.adjust").join() === "inventory.adjust" && !isCanonicalModuleEnabled("inventory", ["inventory.edit"]));
check("roles.manage does not grant itself through staff.edit", permissionKeysForCheck("roles.manage").join() === "roles.manage" && moduleForPermissionKey("roles.manage") === null);
check("staff.view does not open roles administration", !settingsLandingHrefs({ allowBackOfficeAccess: true, isOwner: false, keys: ["staff.view"] }).includes("/settings/roles"));
check("roles.manage opens roles administration", settingsLandingHrefs({ allowBackOfficeAccess: true, isOwner: false, keys: ["roles.manage"] }).includes("/settings/roles"));
check("settings search hides denied modules", !settingsLandingHrefs({ allowBackOfficeAccess: true, isOwner: false, keys: ["staff.view"] }).includes("/settings/company-profile") && !settingsLandingHrefs({ allowBackOfficeAccess: true, isOwner: false, keys: ["settings.view"] }).includes("/membership-levels"));
check("activity logs follow settings or staff", visibleNavigationKeys({ ...flags, keys: ["staff.view"] }).includes("activity") && !visibleNavigationKeys({ ...flags, keys: ["products.view"] }).includes("activity"));
check("pos product lookup stays on the pos module", moduleForApiPath("/api/pos/products/lookup") === "pos" && moduleForApiPath("/api/products") === "products" && moduleForApiPath("/api/customers") === "customers");
check("suppliers and reports use their own modules", moduleForApiPath("/api/suppliers") === "suppliers" && moduleForApiPath("/api/reports/sales") === "reports" && moduleForPermissionKey("purchasing.view") === "purchasing");
check("activity API maps to the activity gate", moduleForApiPath("/api/store/activity-logs") === "activity");
check("dashboard off lands on pos when pos is allowed", landingPathForAccess({ allowBackOfficeAccess: true, allowPosAccess: true, isOwner: false, keys: ["pos.view"] }) === "/pos");
check("dashboard on lands on dashboard", landingPathForAccess({ allowBackOfficeAccess: true, allowPosAccess: true, isOwner: false, keys: ["dashboard.view", "pos.view"] }) === "/dashboard");
check("custom without dashboard or pos lands on products", landingPathForAccess({ allowBackOfficeAccess: true, allowPosAccess: false, isOwner: false, keys: customKeys }) === "/products");
check("no landing when nothing is allowed", landingPathForAccess({ allowBackOfficeAccess: false, allowPosAccess: false, isOwner: false, keys: customKeys }) === null);
check("denied dashboard does not loop to itself", landingPathForAccess({ allowBackOfficeAccess: true, allowPosAccess: false, isOwner: false, keys: ["products.view"] }) !== "/dashboard");
check("pages and API share the module helper", read("lib/auth/permissions.ts").includes("isCanonicalModuleEnabled") && read("lib/api/write-response.ts").includes("moduleForApiPath") && read("components/layout/dashboard-shell.tsx").includes("visibleNavKeys"));
check("customers route is no longer only a back office gate", read("app/(dashboard)/customers/layout.tsx").includes('module="customers"'));
check("preview no longer says custom follows cashier", !read("lib/i18n/settings-copy.ts").includes("Custom currently follows the Cashier"));

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
