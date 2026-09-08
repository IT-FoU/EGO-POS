import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const activity = read("features/store-activity/components/store-activity-logs-client.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const staff = read("features/settings/components/staff-control-section.tsx");
const largeDrawer = read("features/settings/components/settings-large-drawer.tsx");
const settingsPage = read("app/(dashboard)/settings/page.tsx");
const settingsActions = read("features/settings/actions.ts");
const settingsRepo = read("features/settings/prisma-repository.ts");
const settingsCopy = read("lib/i18n/settings-copy.ts");
const displaySettings = read("features/pos/customer-display-settings.ts");
const displayClient = read("features/pos/components/customer-display-client.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");
const suppliersList = read("features/suppliers/components/suppliers-list-client.tsx");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");
const reportsClient = read("features/reports/components/reports-analytics-client.tsx");

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/60 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';
const smallOverlay =
  '"fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"';

const drawerStart = activity.indexOf("function ActivityDetailDrawer(");
const gridStart = activity.indexOf("function DetailGrid(");
check("0. ActivityDetailDrawer exists", drawerStart >= 0 && gridStart > drawerStart);
const drawerFn = activity.slice(drawerStart, gridStart);

check(
  "1. Add Bank uses lg:left-72",
  settingsForm.includes("<SettingsLargeDrawer") &&
    settingsForm.includes('title={editingBankId ? tSettings("editBank", locale) : tSettings("addBank", locale)}') &&
    largeDrawer.includes(overlay) &&
    largeDrawer.includes("lg:left-72") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. Edit Bank uses the same large drawer",
  settingsForm.includes('tSettings("editBank"') &&
    settingsForm.includes("editingBankId") &&
    count(settingsForm, "<SettingsLargeDrawer") >= 2 &&
    !settingsForm.includes("function SettingsLargeDrawer("),
);

check(
  "3. Add QR Account uses lg:left-72",
  settingsForm.includes('title={editingAccountId ? tSettings("editQrAccount", locale) : tSettings("addQrAccount", locale)}') &&
    largeDrawer.includes("lg:left-72"),
);

check(
  "4. Edit QR Account uses the same large drawer",
  settingsForm.includes('tSettings("editQrAccount"') &&
    settingsForm.includes("editingAccountId") &&
    settingsForm.includes("saveQrAccount"),
);

check(
  "5. Add Staff uses lg:left-72",
  staff.includes("<SettingsLargeDrawer") &&
    staff.includes('title={editingStaffId ? tSettings("editStaff", locale) : tSettings("addStaff", locale)}') &&
    largeDrawer.includes("lg:left-72"),
);

check(
  "6. Edit Staff uses the same large drawer",
  staff.includes('tSettings("editStaff"') &&
    staff.includes("editingStaffId") &&
    staff.includes("saveStaff") &&
    !staff.includes("function SettingsDialog("),
);

check(
  "7. all visible shells use h-full w-full max-w-none",
  largeDrawer.includes(panel) &&
    largeDrawer.includes("h-full") &&
    largeDrawer.includes("w-full") &&
    largeDrawer.includes("max-w-none") &&
    largeDrawer.includes("px-6 py-5 lg:px-8") &&
    drawerFn.includes(overlay) &&
    drawerFn.includes(panel) &&
    count(largeDrawer, "max-w-none") === 1,
);

check(
  "8. no centered max-w-2xl remains for these three form families",
  !settingsForm.slice(settingsForm.indexOf("{bankModalOpen"), settingsForm.indexOf("{bankToDelete")).includes("max-w-2xl") &&
    !settingsForm.slice(settingsForm.indexOf("{accountModalOpen"), settingsForm.indexOf("{bankToDelete")).includes("SettingsDialog") &&
    !staff.includes("max-w-2xl") &&
    !staff.includes("place-items-center") &&
    settingsForm.includes("<SettingsLargeDrawer") &&
    staff.includes("<SettingsLargeDrawer"),
);

check(
  "9. Delete Bank remains small centered modal",
  settingsForm.includes('title={tSettings("deleteBankTitle"') &&
    settingsForm.includes("function SettingsDialog(") &&
    settingsForm.includes(smallOverlay) &&
    settingsForm.includes("max-w-2xl"),
);

check(
  "10. Delete QR remains small centered modal",
  settingsForm.includes('title={tSettings("deleteQrAccountTitle"') &&
    settingsForm.includes("function SettingsDialog(") &&
    settingsForm.includes(smallOverlay),
);

check(
  "11. QR Preview remains small centered modal",
  settingsForm.includes('title={tSettings("qrPreview"') &&
    settingsForm.includes("{previewAccount ? (<SettingsDialog") &&
    settingsForm.includes("max-w-2xl"),
);

check(
  "12. Customer Display confirms remain unchanged",
  settingsForm.includes('tSettings("removeLogoConfirm"') &&
    settingsForm.includes('tSettings("resetThisPageConfirm"') &&
    settingsForm.includes('tSettings("resetAllCustomerDisplayConfirm"') &&
    settingsForm.includes("window.confirm") &&
    settingsForm.includes("persistCustomerDisplaySettings") &&
    displaySettings.includes("export function resetAllCustomerDisplaySettings") &&
    displayClient.includes("fixed inset-0 h-[100dvh] w-screen overflow-hidden"),
);

check(
  "13. Settings business logic unchanged",
  settingsActions.includes("export") &&
    settingsRepo.includes("getPrismaSettings") &&
    staff.includes("saveStaffMemberAction") &&
    staff.includes("saveRolePermissionsAction") &&
    staff.includes("saveApprovalRuleAction") &&
    settingsForm.includes("saveQrPaymentBankAction") &&
    settingsForm.includes("saveQrPaymentAccountAction") &&
    activity.includes("/api/store/activity-logs") &&
    settingsPage.includes("<SettingsForm"),
);

check(
  "14. localization unchanged",
  settingsCopy.includes("SETTINGS_COPY") &&
    settingsForm.includes("tSettings") &&
    staff.includes("tSettings") &&
    activity.includes("localizeActivityStatus") &&
    !activity.includes("กำไร") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    membershipClient.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72") &&
    suppliersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    promotionsList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    reportsClient.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-10-settings-drawer-geometry-check: PASS");
