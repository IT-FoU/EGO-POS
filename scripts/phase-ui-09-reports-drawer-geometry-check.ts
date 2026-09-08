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
const reportsPage = read("app/(dashboard)/reports/page.tsx");
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
const smallOverlay =
  '"fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"';

const frameStart = client.indexOf("function ModalFrame(");
const compactStart = client.indexOf("function ReportsCompactModal(");
check("0. Reports ModalFrame exists", frameStart >= 0 && compactStart >= 0);
const frameFn = client.slice(frameStart, compactStart);
const compactFn = client.slice(compactStart);

check(
  "1. large Reports frame uses lg:left-72",
  frameFn.includes(overlay) &&
    frameFn.includes("lg:left-72") &&
    !frameFn.includes("md:left-72") &&
    !frameFn.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. visible large shell uses w-full max-w-none",
  frameFn.includes(panel) &&
    frameFn.includes("h-full") &&
    frameFn.includes("w-full") &&
    frameFn.includes("max-w-none") &&
    frameFn.includes("px-6 py-5 lg:px-8"),
);

check(
  "3. no max-w-6xl/max-w-* remains on LARGE Reports outer shell",
  !frameFn.includes("max-w-6xl") &&
    !frameFn.includes("max-w-5xl") &&
    !frameFn.includes("max-w-4xl") &&
    !frameFn.includes("max-w-3xl") &&
    count(client, "max-w-6xl") === 0 &&
    count(frameFn, "max-w-") === 1,
);

check(
  "4. Sidebar is not covered/dimmed",
  frameFn.includes("lg:left-72") &&
    frameFn.includes("inset-y-0") &&
    frameFn.includes("right-0") &&
    !frameFn.includes("inset-0") &&
    !frameFn.includes("place-items-center"),
);

check(
  "5. KPI/detail surfaces inherit repaired frame",
  client.includes("function KpiDetailModal(") &&
    client.includes("<KpiDetailModal") &&
    client.includes('modal === "kpi"') &&
    client.includes("<ModalFrame onClose={onClose} title={title}>") &&
    client.includes("function GenericDetailModal("),
);

check(
  "6. Business Health uses repaired frame",
  client.includes("function HealthModal(") &&
    client.includes('modal === "health"') &&
    client.includes("<HealthModal") &&
    client.includes('title={t("businessHealth")}'),
);

check(
  "7. Data Source Status uses repaired frame",
  client.includes("function DataSourceModal(") &&
    client.includes('modal === "dataSource"') &&
    client.includes("<DataSourceModal") &&
    client.includes("<ModalFrame onClose={onClose} title={localizeLabel(source)}>"),
);

check(
  "8. chart/report drilldowns use repaired frame",
  client.includes("function DayDetailModal(") &&
    client.includes("function HourDetailModal(") &&
    client.includes("function CategoryModal(") &&
    client.includes("function InventoryAlertModal(") &&
    client.includes("function ProductAnalyticsModal(") &&
    client.includes("function DeadStockModal(") &&
    client.includes('modal === "daily"') &&
    client.includes('modal === "hour"') &&
    client.includes('modal === "category"') &&
    client.includes('modal === "inventory"') &&
    client.includes('modal === "product"') &&
    client.includes('modal === "deadstock"'),
);

check(
  "9. Report preview/detail uses repaired frame",
  client.includes("function ReportDetailModal(") &&
    client.includes('modal === "report"') &&
    client.includes("<ReportDetailModal") &&
    client.includes("<ModalFrame onClose={onClose} title={localizeLabel(reportName)}>"),
);

check(
  "10. Export/Schedule/Favorites classification is correct",
  client.includes("function ExportModal(") &&
    client.includes("function ScheduleModal(") &&
    client.includes("function FavoritesModal(") &&
    client.includes("<ReportsCompactModal onClose={onClose} title={t(\"export\")}>") &&
    client.includes("<ReportsCompactModal onClose={onClose} title={t(\"schedule\")}>") &&
    client.includes("<ModalFrame onClose={onClose} title={t(\"favorites\")}>") &&
    compactFn.includes(smallOverlay) &&
    compactFn.includes("max-w-xl") &&
    !compactFn.includes("lg:left-72"),
);

check(
  "11. small Reports modals remain unchanged",
  compactFn.includes(smallOverlay) &&
    compactFn.includes("max-w-xl") &&
    client.includes("function ExportMenu(") &&
    client.includes('onExport={() => setModal("export")}') &&
    !compactFn.includes("max-w-none"),
);

check(
  "12. Reports calculations unchanged",
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
  "13. Reports Lao localization unchanged",
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
