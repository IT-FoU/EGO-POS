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

const list = read("features/customers/components/customers-list-client.tsx");
const form = read("features/customers/components/customer-form.tsx");
const detail = read("features/customers/components/customer-detail-client.tsx");
const newPage = read("app/(dashboard)/customers/new/page.tsx");
const detailPage = read("app/(dashboard)/customers/[id]/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");

const popupStart = list.indexOf("function CustomerPopup(");
check("0. CustomerPopup exists", popupStart >= 0);
const popupSource = list.slice(popupStart);
const popupEnd = popupSource.indexOf("\nfunction getInsightCustomers");
const popupFn = popupEnd >= 0 ? popupSource.slice(0, popupEnd) : popupSource;

const insightOverlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"';
const smallOverlay =
  '"fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"';

check(
  "1. Customers large frame uses lg:left-72",
  popupFn.includes("const isLargeDrawer = modal.type === \"customers\" || modal.type === \"import\" || modal.type === \"export\"") &&
    popupFn.includes(insightOverlay) &&
    !popupFn.includes("md:left-72") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. no desktop full-viewport scrim remains for repaired large Customers surfaces",
  popupFn.includes(insightOverlay) &&
    popupFn.includes('"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"') &&
    popupFn.includes("isLargeDrawer") &&
    !popupFn.includes("lg:left-[var(") &&
    !popupFn.includes("5rem"),
);

check(
  "3. Sidebar is not covered/dimmed",
  popupFn.includes("lg:left-72") &&
    popupFn.includes("inset-y-0") &&
    popupFn.includes("right-0") &&
    popupFn.includes("isLargeDrawer") &&
    !insightOverlay.includes("inset-0 z-50 grid"),
);

const insightKeys = ["active", "points", "outstanding", "new", "vip", "debt", "birthday", "top", "lost"] as const;
check(
  "4. all insight surfaces using the shared frame inherit the repair",
  insightKeys.every((key) => list.includes(`key: "${key}"`)) &&
    list.includes('type: "customers"') &&
    list.includes("<CustomerPopup") &&
    list.includes('type CustomerInsightKey = "active" | "birthday" | "debt" | "lost" | "new" | "outstanding" | "points" | "top" | "vip"') &&
    list.includes("function getInsightCustomers("),
);

check(
  "5. Create/Edit/Detail page navigation remains unchanged",
  newPage.includes('import { CustomerForm } from "@/features/customers/components/customer-form"') &&
    newPage.includes("<CustomerForm") &&
    detailPage.includes('import { CustomerDetailClient } from "@/features/customers/components/customer-detail-client"') &&
    form.includes("createCustomerAction") &&
    detail.includes("updateCustomerAction") &&
    !newPage.includes("CustomerPopup") &&
    !detailPage.includes("CustomerPopup") &&
    !form.includes("lg:left-72") &&
    !detail.includes("lg:left-72"),
);

check(
  "6. Import/Export use the same Customers Large Drawer geometry",
  popupFn.includes("isLargeDrawer") &&
    popupFn.includes(insightOverlay) &&
    popupFn.includes('"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"') &&
    list.includes('onClick={() => setModal({ type: "import" })}') &&
    list.includes('onClick={() => setModal({ type: "export" })}') &&
    popupFn.includes('modal.type === "import"') &&
    popupFn.includes('modal.type === "export"') &&
    !popupFn.includes("max-w-3xl"),
);

check(
  "7. customer business logic remains unchanged",
  list.includes("function calculateAvailablePoints") === false &&
    list.includes("const availablePoints = calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints)") &&
    list.includes("return customers.filter((customer) => customer.status === \"active\")") &&
    list.includes("return customers.filter((customer) => customer.outstandingBalanceLak > 0)") &&
    list.includes("return [...customers].sort((left, right) => right.lifetimeSpendingLak - left.lifetimeSpendingLak).slice(0, 10)") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"'),
);

console.log("\nphase-ui-06-customers-drawer-geometry-check: PASS");
