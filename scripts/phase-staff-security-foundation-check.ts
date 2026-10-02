/**
 * Phase 1.5 staff security foundation. Static + pure. No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { permissionKeysForCheck } from "../features/access-control/permission-catalog";
import {
  accountGateForApiPath,
  accountGateForPermission,
  isProtectedOwnerRole,
  staffStatusForDisplay,
  staffStatusForStorage,
} from "../lib/auth/account-access";

const root = process.cwd();
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const staffRepo = read("features/access-control/prisma-repository.ts");
const catalog = read("features/access-control/permission-catalog.ts");
const shell = read("components/layout/dashboard-shell.tsx");
const posPage = read("app/(dashboard)/pos/page.tsx");
const productsLayout = read("app/(dashboard)/products/layout.tsx");
const settingsLayout = read("app/(dashboard)/settings/layout.tsx");
const customersLayout = read("app/(dashboard)/customers/layout.tsx");
const writeResponse = read("lib/api/write-response.ts");
const permissions = read("lib/auth/permissions.ts");

check("1. owner template is protected", isProtectedOwnerRole({ templateKey: "owner", name: "Store Owner" }));
check("2. owner name is protected", isProtectedOwnerRole({ templateKey: "custom", name: "Owner" }));
check("3. manager role is not protected", !isProtectedOwnerRole({ templateKey: "manager", name: "Manager" }));
check("4. staff save rejects protected roles", staffRepo.includes("isProtectedOwnerRole(role)"));
check("5. self role change is rejected", staffRepo.includes("change your own role"));
check("6. self access change is rejected", staffRepo.includes("change your own access"));
check("7. deactivate stores disabled", staffRepo.includes('status: "disabled"') && !staffRepo.includes('status: "inactive"'));
check("8. disabled display maps from disabled", staffStatusForDisplay("disabled") === "disabled" && staffStatusForDisplay("active") === "active");
check("9. inactive form value stores disabled", staffStatusForStorage("inactive") === "disabled" && staffStatusForStorage("active") === "active");
check("10. deleted is not used for deactivation", staffStatusForStorage("deleted") === "disabled");
check("11. roles.manage no longer accepts staff.edit", !permissionKeysForCheck("roles.manage").includes("staff.edit") && catalog.includes('"roles.manage": ["roles.manage"]'));
check("12. pos sale permission uses the pos gate", accountGateForPermission("pos.sell") === "pos");
check("13. settings permission uses the back office gate", accountGateForPermission("settings.manage") === "back-office");
check("14. pos API path is a pos gate", accountGateForApiPath("/api/pos/sales") === "pos");
check("15. product API path is a back office gate", accountGateForApiPath("/api/products") === "back-office");
check("16. notifications stay outside both module gates", accountGateForApiPath("/api/notifications") === null);
check("17. sidebar hides back office when the flag is off", shell.includes("!allowBackOfficeAccess && item.key !== \"pos\""));
check("18. pos page checks requirePosAccess", posPage.includes("requirePosAccess"));
check("19. products route checks back office access", productsLayout.includes("requireBackOfficeAccess"));
check("20. settings route checks back office access", settingsLayout.includes("BackOfficeAccessGate"));
check("21. customers route checks back office access", customersLayout.includes("BackOfficeAccessGate"));
check("22. API helper enforces the account gate", writeResponse.includes("enforceApiAccountGate") && permissions.includes("requireAccountGate"));

console.log(`\nStaff security foundation: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
