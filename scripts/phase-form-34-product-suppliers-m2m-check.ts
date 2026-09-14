import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildProductListWhere } from "../features/products/list-query";
import { mapPrismaProduct } from "../features/products/dto-mapper";
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
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260914_product_suppliers_m2m/migration.sql"), "utf8");
const repo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");
const form = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const listQuery = readFileSync(join(root, "features/products/list-query.ts"), "utf8");
const purchasing = readFileSync(join(root, "features/purchasing/prisma-repository.ts"), "utf8");

check("MIGRATION: product_suppliers table + constraints SQL", () => {
  assert(migration.includes('CREATE TABLE IF NOT EXISTS "product_suppliers"'), "missing table");
  assert(migration.includes('UNIQUE ("product_id", "supplier_id")'), "missing unique pair");
  assert(migration.includes("product_suppliers_one_preferred_per_product"), "missing preferred index");
  assert(migration.includes("ON DELETE CASCADE"), "missing product cascade");
  assert(migration.includes("INSERT INTO \"product_suppliers\""), "missing backfill");
  assert(migration.includes("NOT EXISTS"), "missing duplicate-safe backfill");
  assert(schema.includes("model ProductSupplier"), "schema missing ProductSupplier");
  assert(schema.includes("productSuppliers ProductSupplier[]"), "schema relations missing");
});

check("TENANT SAFETY + preferred sync helper", () => {
  assert(repo.includes("async function syncProductSuppliers"), "missing sync helper");
  assert(repo.includes("assertSupplierInBranch"), "missing company/branch assert");
  assert(repo.includes("isPreferred: false"), "missing clear preferred");
  assert(repo.includes("isPreferred: true"), "missing set preferred");
  assert(repo.includes("supplierId: preferredId ?? null"), "missing products.supplier_id sync");
});

check("CREATE/EDIT payload uses supplierIds + preferred", () => {
  assert(form.includes("supplierIds: assignedSupplierIds"), "form missing supplierIds");
  assert(form.includes("preferredSupplierId"), "form missing preferred");
  assert(form.includes("removeAssignedSupplier"), "form missing remove");
  assert(form.includes("addAssignedSupplier"), "form missing add");
  assert(form.includes('t("preferredSupplier")'), "preferred radio label missing");
});

check("REMOVE preferred auto-selects next", () => {
  assert(form.includes("return next[0] ?? \"\""), "preferred remove rule missing");
});

check("FILTER uses productSuppliers.some (no duplicate join)", () => {
  assert(listQuery.includes("productSuppliers:"), "list include missing productSuppliers");
  assert(listQuery.includes("some:"), "filter missing some");
  const scope = { branchId: "b1", companyId: "c1", isOwner: true, warehouseIds: [] as string[] } as BranchScope;
  const where = buildProductListWhere(scope, { supplierId: "sup-a" });
  assert(JSON.stringify(where).includes("productSuppliers"), "where missing M2M");
  assert(!("supplierId" in where), "should not filter only preferred column");
});

check("DTO maps multi-suppliers", () => {
  const mapped = mapPrismaProduct({
    id: "p1",
    nameLo: "Coca",
    supplierId: "b",
    supplier: { companyName: "Supplier B", name: "Supplier B" },
    productSuppliers: [
      { isPreferred: false, supplierId: "a", supplier: { companyName: "Supplier A" } },
      { isPreferred: true, supplierId: "b", supplier: { companyName: "Supplier B" } },
      { isPreferred: false, supplierId: "c", supplier: { companyName: "Supplier C" } },
    ],
    units: [],
  });
  assert(mapped.supplierId === "b", "preferred pointer wrong");
  assert(mapped.supplierIds?.join(",") === "a,b,c", "supplierIds wrong");
  assert(mapped.productSuppliers?.filter((row) => row.isPreferred).length === 1, "one preferred");
});

check("PURCHASING still uses purchase.supplierId path", () => {
  assert(purchasing.includes("supplierId: data.supplierId") || purchasing.includes("data.supplierId"), "purchasing supplier path missing");
  assert(schema.includes("supplierId      String?      @map(\"supplier_id\")"), "products.supplier_id removed");
});

check("CATEGORY/BRAND form selectors remain", () => {
  assert(form.includes("CategoryField"), "category missing");
  assert(form.includes("upsertBrandAction"), "brand missing");
  assert(form.includes("selectedBrandId"), "brand select missing");
});

check("i18n parity", () => {
  assert(productsCopyKeyParity(), "en/lo parity failed");
  const en = getProductsCopy("en");
  assert(en.suppliers && en.preferredSupplier && en.removeSupplier && en.addExistingSupplier, "missing supplier copy keys");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
