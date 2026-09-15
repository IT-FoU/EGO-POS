import { readFileSync } from "node:fs";
import { join } from "node:path";
import { masterNamesEqual, normalizeMasterName } from "../features/products/master-name";
import { buildProductListWhere } from "../features/products/list-query";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";
import type { BranchScope } from "../lib/db/tenant-scope";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const productList = readFileSync(join(root, "features/products/components/product-list-client.tsx"), "utf8");
const listQuery = readFileSync(join(root, "features/products/list-query.ts"), "utf8");
const prismaRepo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");
const actions = readFileSync(join(root, "features/products/actions.ts"), "utf8");
const newPage = readFileSync(join(root, "app/(dashboard)/products/new/page.tsx"), "utf8");
const editPage = readFileSync(join(root, "app/(dashboard)/products/[productId]/edit/page.tsx"), "utf8");
const productsPage = readFileSync(join(root, "app/(dashboard)/products/page.tsx"), "utf8");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");

check("1. Existing categories load via props + localCategories", () => {
  assert(productForm.includes("setLocalCategories"), "missing localCategories sync");
  assert(productForm.includes("CategoryField"), "missing CategoryField");
  assert(newPage.includes("getCategories()"), "create page missing getCategories");
});

check("2-4. Create category inline + immediate appear + auto-select", () => {
  assert(productForm.includes("upsertCategoryAction"), "missing upsertCategoryAction");
  assert(productForm.includes("setSelectedCategoryId(mapped.id)"), "missing auto-select after save");
  assert(productForm.includes("value={selectedCategoryId}"), "CategoryField not controlled");
  assert(actions.includes("revalidateProductCataloguePaths"), "missing revalidate after category save");
});

check("5-6. Product stores categoryId + edit reloads", () => {
  assert(productForm.includes("categoryId: categoryId || undefined"), "payload missing categoryId");
  assert(editPage.includes("product={product}"), "edit page missing product");
  assert(productForm.includes("product?.categoryId"), "edit does not seed category");
});

check("Category name normalization avoids casing/spacing duplicates", () => {
  assert(normalizeMasterName("  Drinks  ") === "Drinks", "trim/collapse failed");
  assert(masterNamesEqual("Drinks", "drinks"), "case equality failed");
  assert(masterNamesEqual("Drinks", "Drinks "), "spacing equality failed");
  assert(prismaRepo.includes("normalizeMasterName(input.nameLo)"), "category upsert missing normalize");
  assert(prismaRepo.includes("duplicate"), "category upsert missing duplicate reuse");
});

check("7-11. Brand master select + inline create + shared record", () => {
  assert(schema.includes("model Brand"), "brands table missing");
  assert(schema.includes("brandId"), "products.brand_id missing");
  assert(productForm.includes("upsertBrandAction"), "missing brand action");
  assert(productForm.includes("setSelectedBrandId(mapped.id)"), "brand auto-select missing");
  assert(productForm.includes("brandId: selectedBrandId || undefined"), "payload missing brandId");
  assert(newPage.includes("getBrands()"), "create page missing brands");
  assert(editPage.includes("brands={brands}"), "edit page missing brands");
  assert(prismaRepo.includes("upsertPrismaBrand"), "brand upsert missing");
});

check("12-16. Multi-supplier + preferred via product_suppliers + products.supplier_id", () => {
  assert(schema.includes("supplierId"), "products.supplier_id missing");
  assert(schema.includes("model ProductSupplier") && schema.includes("product_suppliers"), "M2M ProductSupplier missing");
  assert(productForm.includes("createSupplierAction") || productForm.includes("upsertSupplierAction"), "missing supplier create");
  assert(productForm.includes("supplierIds: assignedSupplierIds"), "payload missing supplierIds");
  assert(productForm.includes("preferredSupplierId"), "preferred supplier state missing");
  assert(productForm.includes('t("preferredSupplier")') || productForm.includes("preferredSupplierHint"), "preferred label/hint missing");
  assert(newPage.includes("getSuppliers()"), "create page missing suppliers");
  assert(editPage.includes("suppliers={suppliers}"), "edit page missing suppliers");
});

check("17-20. Filter foundation by category/brand/supplier via M2M some (no list duplication)", () => {
  assert(listQuery.includes("query.brandId"), "list query missing brandId");
  assert(listQuery.includes("query.supplierId"), "list query missing supplierId");
  assert(listQuery.includes("productSuppliers:"), "list query missing productSuppliers filter");
  assert(productList.includes("filterByBrand"), "list UI missing brand filter");
  assert(productList.includes("filterBySupplier"), "list UI missing supplier filter");
  assert(productsPage.includes("getBrands()"), "products page missing brands");
  assert(productsPage.includes("getSuppliers()"), "products page missing suppliers");
  const scope = {
    branchId: "b1",
    companyId: "c1",
    isOwner: true,
    warehouseIds: [] as string[],
  } as BranchScope;
  const where = buildProductListWhere(scope, {
    brandId: "brand-1",
    categoryId: "cat-1",
    supplierId: "sup-1",
  });
  assert(where.categoryId === "cat-1", "category filter not applied");
  assert(where.brandId === "brand-1", "brand filter not applied");
  assert("productSuppliers" in where, "supplier filter must use productSuppliers.some");
  assert(!("supplierId" in where), "must not filter preferred-only supplier_id column");
});

check("i18n key parity for new master-data copy", () => {
  const parity = productsCopyKeyParity();
  assert(parity, "en/lo products-copy key parity failed");
  const en = getProductsCopy("en");
  assert(en.brandSaved, "missing brandSaved");
  assert(en.supplierSaved, "missing supplierSaved");
  assert(en.filterByBrand, "missing filterByBrand");
  assert(en.filterBySupplier, "missing filterBySupplier");
  assert(en.preferredSupplierHint, "missing preferredSupplierHint");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  process.exitCode = 1;
}


