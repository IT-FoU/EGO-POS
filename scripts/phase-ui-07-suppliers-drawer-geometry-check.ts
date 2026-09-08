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

const list = read("features/suppliers/components/suppliers-list-client.tsx");
const form = read("features/suppliers/components/supplier-form.tsx");
const detail = read("features/suppliers/components/supplier-detail-client.tsx");
const listPage = read("app/(dashboard)/suppliers/page.tsx");
const newPage = read("app/(dashboard)/suppliers/new/page.tsx");
const detailPage = read("app/(dashboard)/suppliers/[id]/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';
const smallOverlay =
  '"fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"';
const smallPanel =
  '"max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl"';

const detailModalStart = list.indexOf("function SupplierDetailModal(");
const invoicesStart = list.indexOf("function OutstandingInvoicesModal(");
const summaryStart = list.indexOf("function SummaryListModal(");

check("0. Supplier list large overlays exist", detailModalStart >= 0 && invoicesStart >= 0 && summaryStart >= 0);

const detailModal = list.slice(detailModalStart, invoicesStart);
const invoicesModal = list.slice(invoicesStart, summaryStart);
const summaryModal = list.slice(summaryStart);

check(
  "1. Supplier large frames use lg:left-72",
  detailModal.includes(overlay) &&
    invoicesModal.includes(overlay) &&
    summaryModal.includes(overlay) &&
    count(list, overlay) === 3 &&
    !list.includes("md:left-72") &&
    !list.includes("lg:left-[var(") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. full-viewport scrim no longer covers Sidebar on desktop",
  detailModal.includes(panel) &&
    invoicesModal.includes(panel) &&
    summaryModal.includes(panel) &&
    !detailModal.includes("fixed inset-0") &&
    !invoicesModal.includes("fixed inset-0") &&
    !summaryModal.includes("fixed inset-0") &&
    !detailModal.includes("place-items-center") &&
    !invoicesModal.includes("max-w-5xl") &&
    !summaryModal.includes("max-w-5xl"),
);

check(
  "3. Quick View, Outstanding Invoices, and metric insights inherit the repair",
  list.includes("<SupplierDetailModal") &&
    list.includes("<OutstandingInvoicesModal") &&
    list.includes("<SummaryListModal") &&
    list.includes("setSelectedSupplier(supplier)") &&
    list.includes("setInvoiceSupplier(supplier)") &&
    list.includes('setSummaryModal("active")') &&
    list.includes('setSummaryModal("credit_limit")') &&
    list.includes('setSummaryModal("outstanding")') &&
    list.includes('setSummaryModal("purchases")') &&
    list.includes('setSummaryModal("paid")') &&
    list.includes('setSummaryModal("average_monthly")') &&
    list.includes('setSummaryModal("last_purchase")') &&
    list.includes('setSummaryModal("debt")') &&
    list.includes('setSummaryModal("credit_exceeded")') &&
    list.includes('setSummaryModal("documents")'),
);

check(
  "4. Create/Edit/Detail page navigation remains unchanged",
  newPage.includes('import { SupplierForm } from "@/features/suppliers/components/supplier-form"') &&
    newPage.includes("<SupplierForm") &&
    detailPage.includes('import { SupplierDetailClient } from "@/features/suppliers/components/supplier-detail-client"') &&
    listPage.includes("<SuppliersListClient") &&
    list.includes('href="/suppliers/new"') &&
    list.includes("href={`/suppliers/${supplier.id}`}") &&
    form.includes("createSupplierAction") &&
    !form.includes("lg:left-72") &&
    !newPage.includes("SupplierDetailModal") &&
    !detailPage.includes("SupplierDetailModal"),
);

check(
  "5. compact Supplier Detail dialogs remain unchanged",
  detail.includes("function DetailModalView(") &&
    detail.includes(smallOverlay) &&
    detail.includes(smallPanel) &&
    detail.includes('modal.kind === "po"') &&
    detail.includes('modal.kind === "receiving"') &&
    detail.includes('modal.kind === "payment"') &&
    detail.includes('modal.kind === "ledger"') &&
    detail.includes('modal.kind === "payment_placeholder"') &&
    !detail.includes("lg:left-72"),
);

check(
  "6. Supplier list/filter business logic remains unchanged",
  list.includes("supplier.outstandingBalanceLak > 0") &&
    list.includes("supplier.outstandingBalanceLak > supplier.creditLimitLak") &&
    list.includes("function buildOutstandingInvoices(") &&
    list.includes("function getSupplierRating(") &&
    form.includes("createSupplierAction") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    membershipClient.includes("fixed inset-y-0 left-0 right-0 z-50 flex justify-end overflow-x-hidden bg-black/45 lg:left-72"),
);

console.log("\nphase-ui-07-suppliers-drawer-geometry-check: PASS");
