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

const listClient = read("features/products/components/product-list-client.tsx");
const productForm = read("features/products/components/product-form.tsx");
const categoriesClient = read("features/products/components/categories-client.tsx");
const createPage = read("app/(dashboard)/products/new/page.tsx");
const editPage = read("app/(dashboard)/products/[productId]/edit/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");

const frameStart = listClient.indexOf("function ProductDrawerFrame(");
check("0. ProductDrawerFrame exists", frameStart >= 0);
const frameSource = listClient.slice(frameStart);
const frameBodyEnd = frameSource.indexOf("\nfunction ProductShellDrawerSummary");
const frameFn = frameBodyEnd >= 0 ? frameSource.slice(0, frameBodyEnd) : frameSource;

const overlayClass =
  'className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"';

check(
  "1. ProductDrawerFrame uses lg:left-72",
  frameFn.includes(overlayClass) &&
    frameFn.includes("lg:left-72") &&
    !frameFn.includes("md:left-72") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "2. Products large drawer no longer contains the 5rem fallback",
  !frameFn.includes("dashboard-sidebar-width") &&
    !frameFn.includes("5rem") &&
    !listClient.includes("dashboard-sidebar-width") &&
    !listClient.includes("lg:left-[var("),
);

check(
  "3. Products large backdrop does not cover Sidebar on desktop",
  frameFn.includes(overlayClass) &&
    frameFn.includes("inset-y-0") &&
    frameFn.includes("right-0") &&
    !frameFn.includes("fixed inset-0") &&
    !frameFn.includes("bg-black/45 p-4"),
);

const drawerKeys = [
  "total",
  "active",
  "missing_images",
  "missing_barcode",
  "product_health",
  "product_list",
  "categories",
  "barcode_sku",
  "images",
  "labels",
  "tool_import",
  "tool_export",
  "tool_audit",
  "tool_print_barcode",
  "tool_print_shelf",
  "tool_bulk_price",
] as const;

check(
  "4. all ProductDrawerFrame surfaces inherit the repaired geometry",
  listClient.includes('type ProductShellDrawerKey = "total" | "active" | "missing_images" | "missing_barcode" | "product_health" | "product_list" | "categories" | "barcode_sku" | "images" | "labels" | "tool_import" | "tool_export" | "tool_audit" | "tool_print_barcode" | "tool_print_shelf" | "tool_bulk_price"') &&
    listClient.includes("<ProductDrawerFrame description={getProductToolDescription(drawerKey)}") &&
    listClient.includes("<ProductDrawerFrame description={content.description}") &&
    drawerKeys.every((key) => listClient.includes(`"${key}"`)) &&
    (listClient.match(/<ProductDrawerFrame /g) ?? []).length === 2 &&
    listClient.includes('onClick={() => onOpenDrawer("total")}') &&
    listClient.includes('onClick={() => onOpenDrawer("product_health")}') &&
    listClient.includes('onClick={() => openOperationDrawer("tool_import")}') &&
    listClient.includes('onClick={() => openOperationDrawer("tool_bulk_price")}'),
);

const approvedFormOverlay = 'className="fixed inset-0 z-50 bg-black/50 md:left-72"';
check(
  "5. Product Preview Drawer remains unchanged",
  productForm.includes("function ProductPreviewDrawer(") &&
    productForm.includes(approvedFormOverlay) &&
    (productForm.match(/fixed inset-0 z-50 bg-black\/50 md:left-72/g) ?? []).length === 2 &&
    productForm.includes('aria-label={t("closePreview")}'),
);

check(
  "6. Barcode Aliases Drawer remains unchanged",
  productForm.includes("function BarcodeAliasDrawer(") &&
    productForm.includes(approvedFormOverlay) &&
    productForm.includes('aria-label={t("closeBarcodeAliases")}'),
);

check(
  "7. /products/new remains unchanged",
  createPage.includes('import { ProductForm } from "@/features/products/components/product-form"') &&
    createPage.includes('mode="create"') &&
    !createPage.includes("ProductDrawerFrame") &&
    !createPage.includes("lg:left-[var("),
);

check(
  "8. /products/[id]/edit remains unchanged",
  editPage.includes('import { ProductForm } from "@/features/products/components/product-form"') &&
    editPage.includes("getProductById") &&
    !editPage.includes("ProductDrawerFrame") &&
    !editPage.includes("lg:left-[var("),
);

check(
  "9. small centered Products dialogs remain unchanged",
  listClient.includes('return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">') &&
    listClient.includes('className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-2xl"') &&
    categoriesClient.includes('className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"') &&
    productForm.includes('return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">') &&
    productForm.includes('return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">'),
);

check(
  "10. Products business logic is unchanged",
  listClient.includes("async function deleteProductAction") === false &&
    listClient.includes("await deleteProductAction(productId)") &&
    listClient.includes("function bulkDeleteSelectedProducts()") &&
    listClient.includes("function getProductShellDrawerContent(") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"'),
);

console.log("\nphase-ui-03-products-drawer-geometry-check: PASS");
