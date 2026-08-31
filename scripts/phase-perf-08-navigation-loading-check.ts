import { existsSync, readFileSync } from "node:fs";
import { navVisualState, shouldMarkPendingNavigation } from "../components/layout/nav-pending";

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const files = {
  dashboardLoading: "app/(dashboard)/dashboard/loading.tsx",
  productsLoading: "app/(dashboard)/products/loading.tsx",
  inventoryLoading: "app/(dashboard)/inventory/loading.tsx",
  reportsLoading: "app/(dashboard)/reports/loading.tsx",
  posLoading: "app/(dashboard)/pos/loading.tsx",
  shell: "components/layout/dashboard-shell.tsx",
  skeleton: "components/layout/route-loading-shell.tsx",
  navPending: "components/layout/nav-pending.ts",
  dashboardPage: "app/(dashboard)/dashboard/page.tsx",
  dashboardService: "features/dashboard/dashboard-service.ts",
  productService: "features/products/product-service.ts",
  inventoryService: "features/inventory/inventory-service.ts",
  reportService: "features/reports/report-service.ts",
  posService: "features/pos/pos-service.ts",
  prisma: "lib/db/prisma.ts",
  packageJson: "package.json",
};

for (const [name, path] of Object.entries(files)) {
  check(`${name} exists`, existsSync(path), path);
}

const dashboardLoading = readFileSync(files.dashboardLoading, "utf8");
const productsLoading = readFileSync(files.productsLoading, "utf8");
const inventoryLoading = readFileSync(files.inventoryLoading, "utf8");
const reportsLoading = readFileSync(files.reportsLoading, "utf8");
const posLoading = readFileSync(files.posLoading, "utf8");
const shell = readFileSync(files.shell, "utf8");
const skeleton = readFileSync(files.skeleton, "utf8");
const dashboardPage = readFileSync(files.dashboardPage, "utf8");
const dashboardService = readFileSync(files.dashboardService, "utf8");
const prisma = readFileSync(files.prisma, "utf8");
const packageJson = readFileSync(files.packageJson, "utf8");
const allLoading = [dashboardLoading, productsLoading, inventoryLoading, reportsLoading, posLoading, skeleton].join("\n");

check("Dashboard page still streams secondary alerts", dashboardPage.includes("Suspense") && dashboardPage.includes("DashboardAlertsLoader") && dashboardPage.includes("getMiniMartDashboardCriticalSnapshot"));
check("Dashboard page does not await full snapshot", !dashboardPage.includes("getMiniMartDashboardSnapshot"));
check("Dashboard queries unchanged in PERF-08", dashboardService.includes("loadDashboardCriticalSalesKpis") && dashboardService.includes("computeCashSessionTotalsForShifts"));
check("Native loading.tsx files are present", dashboardLoading.includes("RouteLoadingShell") && productsLoading.includes("RouteLoadingShell") && inventoryLoading.includes("RouteLoadingShell") && reportsLoading.includes("RouteLoadingShell") && posLoading.includes("RouteLoadingShell"));
check("Loading UI has no fake LAK values", !/0 LAK|28,260|94,260|Today Sales/.test(allLoading));
check("Loading UI has no fake stock or cart copy", !/PEPSI|fake cart|0\.000/.test(allLoading));
check("Loading UI uses aria-busy", skeleton.includes("aria-busy") && dashboardLoading.includes("RouteLoadingShell"));
check("Sidebar pending state is set on click", shell.includes("pendingHref") && shell.includes("shouldMarkPendingNavigation") && shell.includes("data-nav-pending"));
check("Pending state clears on pathname change", shell.includes("setPendingHref(null)") && shell.includes("[pathname]"));
check("Pending state clears on back/forward", shell.includes("popstate"));
check("Next Link prefetch is not disabled", !shell.includes("prefetch={false}"));
check("No WebSocket or cache added", !shell.includes("WebSocket") && !allLoading.includes("redis"));
check("PrismaPg max/maxUses unchanged", prisma.includes("max: 1") && prisma.includes("maxUses: 1"));
check("No new npm dependency", !packageJson.includes("framer-motion") && !packageJson.includes("nprogress") && !packageJson.includes("react-loading-skeleton"));

const pendingProducts = navVisualState("/products", "/dashboard", "/products");
check("Click Products pending highlights Products", pendingProducts.isPending && pendingProducts.isActive);
check("Click Products does not keep Dashboard active", !navVisualState("/dashboard", "/dashboard", "/products").isActive);
const loaded = navVisualState("/products", "/products", null);
check("Loaded Products is active without pending", loaded.isActive && loaded.isCurrent && !loaded.isPending);
const backState = navVisualState("/dashboard", "/dashboard", null);
check("Back to Dashboard restores pathname active state", backState.isActive && backState.isCurrent && !backState.isPending);
const rapid = navVisualState("/inventory", "/dashboard", "/inventory");
check("Rapid last-click Inventory wins pending highlight", rapid.isPending && rapid.isActive && !navVisualState("/products", "/dashboard", "/inventory").isActive);
const clickEvent = { altKey: false, button: 0, ctrlKey: false, metaKey: false, shiftKey: false };
check("Plain click marks pending immediately", shouldMarkPendingNavigation(clickEvent, "/inventory"));
check("Modified click does not steal pending state", !shouldMarkPendingNavigation({ ...clickEvent, ctrlKey: true }, "/inventory"));

const failed = results.filter((row) => !row.ok);
console.log(`\nPERF-08 navigation loading: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) process.exit(1);
