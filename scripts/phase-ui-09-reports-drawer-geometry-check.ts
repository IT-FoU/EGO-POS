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

const client = read("features/reports/components/reports-analytics-client.tsx");
const copySource = read("lib/i18n/reports-copy.ts");
const hub = read("features/reports/build-analytics-hub.ts");
const service = read("features/reports/report-service.ts");
const reportsPage = read("app/(dashboard)/reports/analytics/page.tsx");
const salesPage = read("app/(dashboard)/reports/sales/page.tsx");
const productsPage = read("app/(dashboard)/reports/products/page.tsx");
const customersPage = read("app/(dashboard)/reports/customers/page.tsx");
const inventoryPage = read("app/(dashboard)/reports/inventory/page.tsx");
const purchasingPage = read("app/(dashboard)/reports/purchasing/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");
const suppliersList = read("features/suppliers/components/suppliers-list-client.tsx");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';

const frameStart = client.indexOf("function ModalFrame(");
const rowsStart = client.indexOf("function ReportRowsTable(");
check("0. Reports ModalFrame exists", frameStart >= 0 && rowsStart > frameStart);
const frameFn = client.slice(frameStart, rowsStart);

check(
  "1. Export uses the LARGE drawer frame",
  client.includes("function ExportModal(") &&
    client.includes("<ModalFrame onClose={onClose} title={t(\"export\")}>") &&
    client.includes('modal === "export"') &&
    !client.includes("ReportsCompactModal") &&
    !client.includes("function ReportsCompactModal("),
);

check(
  "2. Schedule uses the LARGE drawer frame",
  client.includes("function ScheduleModal(") &&
    client.includes("<ModalFrame onClose={onClose} title={t(\"schedule\")}>") &&
    client.includes('modal === "schedule"'),
);

check(
  "3. Print uses LARGE drawer geometry where a substantial custom Print surface exists",
  client.includes('label={t("print")} onClick={() => setModal("export")}') &&
    client.includes("<ModalFrame onClose={onClose} title={t(\"export\")}>") &&
    !client.includes("window.print(") &&
    !client.includes("function PrintModal(") &&
    !client.includes('modal === "print"'),
);

check(
  "4. Favorites uses LARGE drawer",
  client.includes("function FavoritesModal(") &&
    client.includes("<ModalFrame onClose={onClose} title={t(\"favorites\")}>") &&
    client.includes('modal === "favorites"'),
);

check(
  "5. KPI/details use LARGE drawer",
  client.includes("function KpiDetailModal(") &&
    client.includes("<KpiDetailModal") &&
    client.includes('modal === "kpi"') &&
    client.includes("<ModalFrame onClose={onClose} title={title}>") &&
    client.includes("function HealthModal(") &&
    client.includes("function DataSourceModal(") &&
    client.includes("function DayDetailModal(") &&
    client.includes("function HourDetailModal(") &&
    client.includes("function CategoryModal(") &&
    client.includes("function InventoryAlertModal(") &&
    client.includes("function ProductAnalyticsModal(") &&
    client.includes("function DeadStockModal(") &&
    client.includes("function ReportDetailModal(") &&
    client.includes("<ModalFrame onClose={onClose} title={localizeLabel(reportName)}>"),
);

check(
  "6. all share lg:left-72",
  frameFn.includes(overlay) &&
    frameFn.includes("lg:left-72") &&
    !frameFn.includes("md:left-72") &&
    !frameFn.includes("lg:left-[var(") &&
    count(client, "lg:left-72") === 1 &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "7. all visible large shells use h-full w-full max-w-none",
  frameFn.includes(panel) &&
    frameFn.includes("h-full") &&
    frameFn.includes("w-full") &&
    frameFn.includes("max-w-none") &&
    frameFn.includes("px-6 py-5 lg:px-8") &&
    count(client, "max-w-none") === 1,
);

check(
  "8. Sidebar is not covered/dimmed",
  frameFn.includes("lg:left-72") &&
    frameFn.includes("inset-y-0") &&
    frameFn.includes("right-0") &&
    !frameFn.includes("inset-0") &&
    !frameFn.includes("place-items-center"),
);

check(
  "9. no centered max-w-6xl/max-w-* large Reports shell remains",
  !frameFn.includes("max-w-6xl") &&
    !frameFn.includes("max-w-5xl") &&
    !frameFn.includes("max-w-4xl") &&
    !frameFn.includes("max-w-3xl") &&
    !frameFn.includes("max-w-xl") &&
    count(client, "max-w-6xl") === 0 &&
    count(frameFn, "max-w-") === 1 &&
    !client.includes("fixed inset-0 z-50 grid place-items-center") &&
    client.includes("function ExportMenu(") &&
    client.includes("w-40 rounded-md border border-border bg-card"),
);

check(
  "10. Reports business logic unchanged",
  client.includes("function kpiSummaryLines(") &&
    client.includes("function kpiReportHref(") &&
    reportsPage.includes("getReportsPageData") &&
    hub.includes("export") &&
    service.includes("getReportsPageData") &&
    salesPage.includes("getReportsSnapshot") &&
    productsPage.includes("getReportsSnapshot") &&
    customersPage.includes("getReportsSnapshot") &&
    inventoryPage.includes("getReportsSnapshot") &&
    purchasingPage.includes("getReportsSnapshot"),
);

check(
  "11. Reports localization unchanged",
  copySource.includes("REPORTS_COPY") &&
    client.includes("tReports") &&
    !client.includes("กำไร") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    membershipClient.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72") &&
    suppliersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    promotionsList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-09-reports-drawer-geometry-check: PASS");
