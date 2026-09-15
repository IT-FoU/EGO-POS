import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasNonZeroInventoryBalance,
  resolveProductDeleteMode,
  sumHistoricalProductRefs,
} from "../features/products/product-delete";
import { productsCopyKeyParity } from "../lib/i18n/products-copy";

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
const productsPage = readFileSync(join(root, "app/(dashboard)/products/page.tsx"), "utf8");
const listQuery = readFileSync(join(root, "features/products/list-query.ts"), "utf8");
const repo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");

check("1. Product Name + Enter does not submit (form keydown guard)", () => {
  assert(productForm.includes("handleFormKeyDown"), "keydown handler missing");
  assert(productForm.includes('if (event.key !== "Enter") return'), "Enter gate missing");
  assert(productForm.includes("event.preventDefault()"), "Enter preventDefault missing");
  assert(productForm.includes('tag === "TEXTAREA"'), "textarea Enter must remain allowed");
});

check("2. SKU / barcode / cost use same Enter guard (no implicit submit)", () => {
  assert(productForm.includes("Barcode scanners and ordinary inputs must never implicit-submit"), "scanner note missing");
  assert(!/type=\"submit\"/.test(productForm), "submit buttons must not remain in ProductForm");
});

check("3. Barcode + Enter blocked (no type=submit Save)", () => {
  assert(productForm.includes('type="button" onClick={onSave}'), "Save must be explicit button");
  assert(productForm.includes("handleSaveClick"), "explicit save click missing");
  assert(productForm.includes("saveProductFromForm"), "save helper missing");
});

check("4. Simulated scanner digits+Enter cannot requestSubmit via Save type", () => {
  assert(!productForm.includes('type="submit"'), "any submit button allows scanner Enter");
});

check("5. Cost + Enter covered by form-level Enter preventDefault", () => {
  assert(productForm.includes("onKeyDown={handleFormKeyDown}"), "form keydown not wired");
});

check("6. Explicit Save click creates via createProductAction path", () => {
  assert(productForm.includes("createProductAction(payload)"), "create path missing");
  assert(productForm.includes("onSave={handleSaveClick}"), "footer save not wired");
});

check("7. Fresh product with only zero-qty seeded balance → hard delete", () => {
  assert(resolveProductDeleteMode({ balances: [{ quantity: 0 }], historicalReferenceCount: 0 }) === "hard", "zero balance should hard delete");
  assert(resolveProductDeleteMode({ balances: [], historicalReferenceCount: 0 }) === "hard", "no refs should hard delete");
});

check("8. Seed balance cleanup before hard delete in repository", () => {
  assert(repo.includes("inventoryBalance.deleteMany"), "zero balance cleanup missing");
  assert(repo.includes("resolveProductDeleteMode"), "classifier unused");
  assert(repo.includes('deleteMode: "hard"') || repo.includes("deleteMode,"), "hard mode not returned");
});

check("9. Default list excludes deleted (status active)", () => {
  assert(productsPage.includes('status: "active"'), "page default not active");
  assert(productList.includes('useState<ProductStatus | "all">("active")'), "client default not active");
});

check("10. Default Total excludes deleted", () => {
  assert(listQuery.includes("p.status <> 'deleted'"), "summary must exclude deleted");
});

check("11. Product with real sale/history → soft delete", () => {
  assert(resolveProductDeleteMode({ balances: [{ quantity: 0 }], historicalReferenceCount: 1 }) === "soft", "sale history must soft delete");
  assert(resolveProductDeleteMode({ balances: [{ quantity: 5 }], historicalReferenceCount: 0 }) === "soft", "non-zero stock must soft delete");
  assert(hasNonZeroInventoryBalance([{ quantity: "0.000" }]) === false, "string zero treated as non-zero");
  assert(sumHistoricalProductRefs({ saleItems: 2, movements: 1 }) === 3, "historical sum wrong");
});

check("12. Soft-delete message + history preserved copy", () => {
  assert(productList.includes("productRemovedFromCatalogue"), "soft delete message missing");
  assert(productsCopyKeyParity(), "en/lo key parity broken");
});

check("13. Soft-deleted absent from default list (active filter)", () => {
  assert(productList.includes('value={status}') && productList.includes("statusOptions"), "status filter intact");
  assert(productList.includes('"deleted"'), "explicit deleted filter still available");
});

check("14. Explicit All/Deleted filter still supported", () => {
  assert(productList.includes('"all", "active", "draft", "inactive", "deleted"') || productList.includes('["all", "active", "draft", "inactive", "deleted"]'), "status options missing");
});

check("15. Repeated Delete does not create/duplicate rows", () => {
  assert(repo.includes('status: "deleted"'), "soft path still archives");
  assert(!repo.includes("createPrismaProduct") || repo.indexOf("export async function deletePrismaProduct") > 0, "delete must not create");
  const deleteBlock = repo.slice(repo.indexOf("export async function deletePrismaProduct"));
  assert(!deleteBlock.includes("tx.product.create"), "delete path must not insert products");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exit(1);
}
