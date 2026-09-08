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
  "1. LARGE Settings frame uses lg:left-72",
  drawerFn.includes(overlay) &&
    drawerFn.includes("lg:left-72") &&
    !drawerFn.includes("md:left-72") &&
    !drawerFn.includes("xl:left-") &&
    !drawerFn.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. visible shell uses w-full max-w-none",
  drawerFn.includes(panel) &&
    drawerFn.includes("h-full") &&
    drawerFn.includes("w-full") &&
    drawerFn.includes("max-w-none") &&
    drawerFn.includes("px-6 py-5 lg:px-8"),
);

check(
  "3. old calc width geometry removed from LARGE shell",
  !drawerFn.includes("max-w-[calc(100vw-4rem)]") &&
    !drawerFn.includes("xl:max-w-[calc(100vw-17rem)]") &&
    !activity.includes("max-w-[calc(") &&
    count(drawerFn, "max-w-") === 1,
);

check(
  "4. Activity Detail Sidebar overlap removed",
  drawerFn.includes("lg:left-72") &&
    drawerFn.includes("inset-y-0") &&
    drawerFn.includes("right-0") &&
    !drawerFn.includes("justify-end") &&
    !drawerFn.includes("pointer-events-none") &&
    !drawerFn.includes("inset-0"),
);

check(
  "5. Activity Detail uses full available width",
  drawerFn.includes("max-w-none") &&
    !drawerFn.includes("max-w-[") &&
    activity.includes('setSelected(log)') &&
    activity.includes("<ActivityDetailDrawer"),
);

check(
  "6. other identified LARGE Settings surfaces follow same standard",
  count(activity, "lg:left-72") === 1 &&
    count(settingsForm, "lg:left-72") === 0 &&
    count(staff, "lg:left-72") === 0 &&
    count(activity, "function ActivityDetailDrawer(") === 1,
);

check(
  "7. normal Settings tabs remain unchanged",
  settingsPage.includes("<SettingsForm") &&
    settingsForm.includes('tSettings("companyProfile"') &&
    settingsForm.includes('tSettings("receiptSettings"') &&
    settingsForm.includes('tSettings("customerDisplay"') &&
    settingsForm.includes("QrPaymentBankManagementSection") &&
    settingsForm.includes("<StaffControlSection") &&
    settingsForm.includes("<StoreActivityLogsClient") &&
    settingsForm.includes('tSettings("storeActivityLogs"'),
);

check(
  "8. small Settings modals remain unchanged",
  settingsForm.includes(smallOverlay) &&
    settingsForm.includes("max-w-2xl") &&
    settingsForm.includes('tSettings("addBank"') &&
    settingsForm.includes('tSettings("addQrAccount"') &&
    settingsForm.includes('tSettings("qrPreview"') &&
    settingsForm.includes('tSettings("deleteBankTitle"') &&
    settingsForm.includes('tSettings("deleteQrAccountTitle"') &&
    staff.includes(smallOverlay) &&
    staff.includes("max-w-2xl") &&
    staff.includes("function SettingsDialog(") &&
    !staff.includes("lg:left-72"),
);

check(
  "9. Customer Display behavior unchanged",
  settingsForm.includes("persistCustomerDisplaySettings") &&
    settingsForm.includes("resetCustomerDisplayAppearanceSettings") &&
    settingsForm.includes("resetAllCustomerDisplaySettings") &&
    settingsForm.includes("writeCustomerDisplaySettingsToStorage") &&
    displaySettings.includes("export function resetAllCustomerDisplaySettings") &&
    displayClient.includes("fixed inset-0 h-[100dvh] w-screen overflow-hidden"),
);

check(
  "10. Settings business logic unchanged",
  settingsActions.includes("export") &&
    settingsRepo.includes("getPrismaSettings") &&
    staff.includes("saveStaffMemberAction") &&
    staff.includes("saveRolePermissionsAction") &&
    staff.includes("saveApprovalRuleAction") &&
    activity.includes("/api/store/activity-logs") &&
    activity.includes("log.actorName") &&
    activity.includes("log.beforeValue"),
);

check(
  "11. Settings localization unchanged",
  settingsCopy.includes("SETTINGS_COPY") &&
    activity.includes("tSettings") &&
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
