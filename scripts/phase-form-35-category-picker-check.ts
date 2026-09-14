import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productsCopyKeyParity, getProductsCopy, fillProductsCopy } from "../lib/i18n/products-copy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];
function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const root = process.cwd();
const form = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const repo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");
const newPage = readFileSync(join(root, "app/(dashboard)/products/new/page.tsx"), "utf8");
const editPage = readFileSync(join(root, "app/(dashboard)/products/[productId]/edit/page.tsx"), "utf8");
const catPage = readFileSync(join(root, "app/(dashboard)/products/categories/page.tsx"), "utf8");

check("No EN/LO slash labels in CategoryField", () => {
  assert(!form.includes("{category.nameEn} / {category.nameLo}"), "slash label still present");
  assert(form.includes("categoryDisplayName(category, locale)"), "display helper unused");
});

check("Create Product does not auto-select first category", () => {
  assert(!form.includes("categories[0]?.id ?? \"\""), "still seeds first category in useState");
  assert(form.includes('useState(product?.categoryId ?? "")'), "selectedCategoryId should start empty on create");
  assert(!form.includes("else if (!selectedCategoryId && categories[0]?.id)"), "auto-select first removed");
  assert(form.includes('t("selectCategory")'), "select placeholder missing");
});

check("Category query is company-level single-level", () => {
  assert(repo.includes("parentId: null"), "missing parentId null filter");
  assert(repo.includes("Categories are company-level master data"), "missing company-level comment/intent");
  const getBlock = repo.slice(repo.indexOf("export async function getPrismaCategories"), repo.indexOf("export async function getPrismaBrands"));
  assert(!getBlock.includes("branchOwnedWhere(scope)"), "getPrismaCategories still branch-filters");
  assert(getBlock.includes("companyId: scope.companyId"), "missing company filter");
});

check("Pages force-dynamic", () => {
  assert(newPage.includes('dynamic = "force-dynamic"'), "new page missing force-dynamic");
  assert(editPage.includes('dynamic = "force-dynamic"'), "edit page missing force-dynamic");
  assert(catPage.includes('dynamic = "force-dynamic"'), "categories page missing force-dynamic");
});

check("Inline create still auto-selects + merges list", () => {
  assert(form.includes("setSelectedCategoryId(mapped.id)"), "inline auto-select missing");
  assert(form.includes("setLocalCategories((current) =>"), "local merge missing");
});

check("Brand + multi-supplier selectors remain", () => {
  assert(form.includes("selectedBrandId"), "brand regression");
  assert(form.includes("assignedSupplierIds"), "supplier regression");
  assert(form.includes("preferredSupplierId"), "preferred regression");
});

check("i18n parity", () => {
  assert(productsCopyKeyParity(), "en/lo key parity failed");
  const en = getProductsCopy("en");
  assert(en.selectCategory === "Select category", "selectCategory copy missing");
  assert(fillProductsCopy(en.categoryCountAvailable, { count: 4 }) === "4 categories available", "count template broken");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
