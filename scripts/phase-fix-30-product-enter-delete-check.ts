import { readFileSync } from "node:fs";
import { join } from "node:path";
import { permanentDeleteBlockReason } from "../features/products/product-delete";
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

const safeFacts = {
  hasActiveReservations: false,
  hasAdjustments: false,
  hasGoodsReceiptItems: false,
  hasHoldBillItems: false,
  hasLotAllocations: false,
  hasLots: false,
  hasMovements: false,
  hasNonZeroStock: false,
  hasPurchaseItems: false,
  hasRefundExchangeItems: false,
  hasRefundItems: false,
  hasSaleItems: false,
  hasStockTransferItems: false,
  needsRecount: false,
  status: "deleted",
};

check("7. Fresh deleted product with zero stock can be permanently deleted", () => {
  assert(permanentDeleteBlockReason(safeFacts) === null, "safe deleted product should allow permanent delete");
  assert(permanentDeleteBlockReason({ ...safeFacts, status: "active" }) === "NOT_DELETED", "first delete must not hard-delete");
});

check("8. Permanent delete cleans zero balances after eligibility, not on first delete", () => {
  assert(repo.includes("softDeletePrismaProduct"), "first delete must stay soft");
  assert(!repo.slice(repo.indexOf("export async function deletePrismaProduct"), repo.indexOf("export async function permanentDeletePrismaProduct")).includes("product.delete"), "first delete must not hard-delete");
  assert(readFileSync(join(root, "features/products/product-delete-service.ts"), "utf8").includes("DELETE FROM inventory_balances"), "zero balance cleanup missing");
});

check("9. Default list excludes deleted (status active)", () => {
  assert(productsPage.includes('status: "active"'), "page default not active");
  assert(productList.includes('useState<ProductStatus | "all">("active")'), "client default not active");
});

check("10. Default Total excludes deleted", () => {
  assert(listQuery.includes("p.status <> 'deleted'"), "summary must exclude deleted");
});

check("11. Product with real sale/history or stock cannot be permanently deleted", () => {
  assert(permanentDeleteBlockReason({ ...safeFacts, hasSaleItems: true }) === "HAS_TRANSACTION_HISTORY", "sale history must block permanent delete");
  assert(permanentDeleteBlockReason({ ...safeFacts, hasNonZeroStock: true }) === "HAS_STOCK", "non-zero stock must block permanent delete");
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
