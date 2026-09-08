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

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) fail(`missing start marker: ${startNeedle}`);
  const from = start + startNeedle.length;
  const end = source.indexOf(endNeedle, from);
  if (end < 0) fail(`missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const shell = read("features/products/components/product-small-modal.tsx");
const productForm = read("features/products/components/product-form.tsx");
const categoriesClient = read("features/products/components/categories-client.tsx");
const listClient = read("features/products/components/product-list-client.tsx");
const createPage = read("app/(dashboard)/products/new/page.tsx");
const editPage = read("app/(dashboard)/products/[productId]/edit/page.tsx");
const productActions = read("features/products/actions.ts");

const overlayClass = 'className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60"';
const cardClass =
  '"flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"';
const closeClass =
  'className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground"';
const largeListOverlay =
  'className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"';
const formDrawerOverlay = 'className="fixed inset-0 z-50 bg-black/50 md:left-72"';

const categoryCrud = sliceBetween(productForm, "function CategoryCrudDialog(", "function ImagePreviewDialog(");
const formImagePreview = sliceBetween(productForm, "function ImagePreviewDialog(", "function CategoryField(");
const categoryPage = sliceBetween(categoriesClient, "function CategoryModal(", "function Field(");
const listImagePreview = sliceBetween(listClient, "function ImagePreviewModal(", "function getProductStock(");
const drawerFrame = sliceBetween(listClient, "function ProductDrawerFrame(", "function ProductShellDrawerSummary");

check(
  "1. Product form Category CRUD is centered",
  productForm.includes('import { ProductSmallModal } from "@/features/products/components/product-small-modal"') &&
    categoryCrud.includes("<ProductSmallModal") &&
    shell.includes(overlayClass) &&
    shell.includes("place-items-center") &&
    !categoryCrud.includes("lg:left-72") &&
    !categoryCrud.includes("md:left-72"),
);

check(
  "2. Category CRUD uses max-w-md",
  categoryCrud.includes('size="sm"') &&
    shell.includes('size === "sm" ? "max-w-md" : size === "xl" ? "max-w-xl" : "max-w-lg"') &&
    !categoryCrud.includes("max-w-lg") &&
    !categoryCrud.includes("max-w-2xl"),
);

check(
  "3. Category CRUD uses bg-black/60",
  shell.includes("bg-black/60") &&
    !shell.includes("bg-black/70") &&
    !categoryCrud.includes("bg-black/70"),
);

check(
  "4. Categories-page Add/Edit is centered",
  categoriesClient.includes('import { ProductSmallModal } from "@/features/products/components/product-small-modal"') &&
    categoryPage.includes("<ProductSmallModal") &&
    categoryPage.includes('size="md"') &&
    !categoryPage.includes("flex items-center justify-center") &&
    !categoryPage.includes("lg:left-72"),
);

check(
  "5. Categories-page modal uses max-w-lg or approved max-w-xl",
  (categoryPage.includes('size="md"') || categoryPage.includes('size="xl"')) &&
    !categoryPage.includes("max-w-2xl") &&
    !categoryPage.includes("max-w-3xl") &&
    categoryPage.includes("onSubmit={onSubmit}") &&
    categoryPage.includes('t("saveCategory")'),
);

check(
  "6. Product-list image preview is centered",
  listImagePreview.includes("<ProductSmallModal") &&
    listImagePreview.includes('size="xl"') &&
    !listImagePreview.includes("lg:left-72") &&
    !listImagePreview.includes("function Modal("),
);

check(
  "7. Product-list image preview is no wider than max-w-xl",
  listImagePreview.includes('size="xl"') &&
    !listImagePreview.includes("max-w-3xl") &&
    !listImagePreview.includes("max-w-4xl") &&
    !listImagePreview.includes("max-w-2xl") &&
    listImagePreview.includes("object-contain"),
);

check(
  "8. Product-form image preview is centered",
  formImagePreview.includes("<ProductSmallModal") &&
    formImagePreview.includes('size="xl"') &&
    !formImagePreview.includes("lg:left-72") &&
    !formImagePreview.includes("md:left-72"),
);

check(
  "9. Product-form image preview is no wider than max-w-xl",
  formImagePreview.includes('size="xl"') &&
    !formImagePreview.includes("max-w-4xl") &&
    !formImagePreview.includes("max-w-3xl") &&
    !formImagePreview.includes("max-w-2xl") &&
    formImagePreview.includes("object-contain"),
);

check(
  "10. all migrated overlays use z-50",
  shell.includes("fixed inset-0 z-50") &&
    !shell.includes("z-40") &&
    !categoryCrud.includes("z-40") &&
    !categoryPage.includes("z-40") &&
    !listImagePreview.includes("z-40") &&
    !formImagePreview.includes("z-40"),
);

check(
  "11. all migrated overlays use dialog semantics",
  shell.includes('role="dialog"') &&
    shell.includes('aria-modal="true"') &&
    categoryCrud.includes("<ProductSmallModal") &&
    categoryPage.includes("<ProductSmallModal") &&
    listImagePreview.includes("<ProductSmallModal") &&
    formImagePreview.includes("<ProductSmallModal"),
);

check(
  "12. close controls use same visual family",
  shell.includes(closeClass) &&
    shell.includes("text-lg font-semibold") &&
    shell.includes("<X className=\"size-4\" aria-hidden=\"true\" />") &&
    shell.includes(cardClass) &&
    categoryCrud.includes("closeAriaLabel={t(\"close\")}") &&
    categoryPage.includes("closeAriaLabel={t(\"closeCategoryForm\")}") &&
    listImagePreview.includes("closeAriaLabel={t(\"closeModal\")}") &&
    formImagePreview.includes("closeAriaLabel={t(\"closeImagePreview\")}") &&
    categoryCrud.includes("closeOnBackdrop={false}") &&
    categoryCrud.includes("closeOnEscape={!isDelete}") &&
    categoryPage.includes("closeOnBackdrop={false}") &&
    categoryPage.includes("closeOnEscape={true}") &&
    listImagePreview.includes("closeOnBackdrop={true}") &&
    listImagePreview.includes("closeOnEscape={true}") &&
    formImagePreview.includes("closeOnBackdrop={true}") &&
    formImagePreview.includes("closeOnEscape={true}"),
);

check(
  "13. no Product Large Drawer geometry changed",
  drawerFrame.includes(largeListOverlay) &&
    drawerFrame.includes("lg:left-72") &&
    !drawerFrame.includes("fixed inset-0") &&
    productForm.includes("function ProductPreviewDrawer(") &&
    productForm.includes(formDrawerOverlay) &&
    (productForm.match(/fixed inset-0 z-50 bg-black\/50 md:left-72/g) ?? []).length === 2 &&
    productForm.includes("function BarcodeAliasDrawer(") &&
    createPage.includes('mode="create"') &&
    editPage.includes("getProductById") &&
    !createPage.includes("ProductSmallModal") &&
    !editPage.includes("ProductSmallModal"),
);

check(
  "14. product/category business logic unchanged",
  productForm.includes("function saveCategory(input: {") &&
    productForm.includes("function deleteCategory(categoryId: string)") &&
    categoryCrud.includes("onSave({ id: state.mode === \"edit\" ? state.categoryId : undefined, nameLo: name })") &&
    categoryCrud.includes("bg-danger") &&
    categoriesClient.includes("function saveCategory(event: React.FormEvent<HTMLFormElement>)") &&
    listClient.includes("await deleteProductAction(productId)") &&
    productActions.includes("export async function upsertCategoryAction") &&
    productActions.includes("export async function deleteCategoryAction") &&
    productActions.includes("export async function createProductAction"),
);

console.log("\nphase-ui-12-products-small-modal-geometry-check: PASS");
