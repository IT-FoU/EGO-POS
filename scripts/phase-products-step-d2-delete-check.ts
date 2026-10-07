import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deleteFailureCode, permanentDeleteBlockReason, type PermanentDeleteFacts } from "../features/products/product-delete";
import { cleanupHardDeletedProductImages } from "../features/products/product-image-service";
import { localizeProductError, productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";
import { setProductImageStorageForTests, type ProductImageStorage } from "../lib/storage/product-image-storage";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? " — " + detail : ""}`);
}

const safe: PermanentDeleteFacts = {
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

check("first stage is not a hard delete", permanentDeleteBlockReason({ ...safe, status: "active" }) === "NOT_DELETED");
check("safe deleted product is eligible", permanentDeleteBlockReason(safe) === null);
check("sale history blocks", permanentDeleteBlockReason({ ...safe, hasSaleItems: true }) === "HAS_TRANSACTION_HISTORY");
check("stock movement blocks", permanentDeleteBlockReason({ ...safe, hasMovements: true }) === "HAS_TRANSACTION_HISTORY");
check("purchase receipt blocks", permanentDeleteBlockReason({ ...safe, hasPurchaseItems: true, hasGoodsReceiptItems: true }) === "HAS_TRANSACTION_HISTORY");
check("refund blocks", permanentDeleteBlockReason({ ...safe, hasRefundItems: true }) === "HAS_TRANSACTION_HISTORY");
check("stock blocks", permanentDeleteBlockReason({ ...safe, hasNonZeroStock: true }) === "HAS_STOCK");
check("recount blocks", permanentDeleteBlockReason({ ...safe, needsRecount: true }) === "NEEDS_RECOUNT");
check("lot blocks", permanentDeleteBlockReason({ ...safe, hasLots: true }) === "HAS_LOTS");
check("lot allocation blocks", permanentDeleteBlockReason({ ...safe, hasLotAllocations: true }) === "HAS_LOTS");
check("active reservation blocks", permanentDeleteBlockReason({ ...safe, hasActiveReservations: true }) === "HAS_RESERVATION");
check("history wins over stock", permanentDeleteBlockReason({ ...safe, hasSaleItems: true, hasNonZeroStock: true }) === "HAS_TRANSACTION_HISTORY");

check("P2028 is hidden", deleteFailureCode(new Error("Transaction API error: Unable to start a transaction in the given time.")) === "TEMPORARILY_UNAVAILABLE");
check("foreign key is hidden", deleteFailureCode(new Error("Foreign key constraint failed on the field")) === "REFERENCED_RECORD");
check(
  "P2028 copy",
  localizeProductError("TEMPORARILY_UNAVAILABLE") === "Delete is temporarily unavailable. Try again."
    && localizeProductError("HAS_TRANSACTION_HISTORY") === "This product has transaction history and must be retained."
    && localizeProductError("HAS_STOCK").startsWith("This product still has stock"),
);

const repo = read("features/products/prisma-repository.ts");
const service = read("features/products/product-delete-service.ts");
const list = read("features/products/components/product-list-client.tsx");
const actions = read("features/products/actions.ts");
const firstDelete = repo.slice(repo.indexOf("export async function deletePrismaProduct"), repo.indexOf("export async function permanentDeletePrismaProduct"));
check("first delete calls soft delete only", firstDelete.includes("softDeletePrismaProduct") && !firstDelete.includes("product.delete") && !firstDelete.includes("$transaction"));
check("permanent delete is one statement", service.includes("DELETE FROM products") && service.includes("INSERT INTO audit_logs") && !service.includes("$transaction"));
check("storage cleanup is after the delete", repo.indexOf("commitPermanentDelete") < repo.indexOf("cleanupHardDeletedProductImages(hardDeletedImages)"));
check("cleanup failure does not throw", read("features/products/product-image-service.ts").includes("product-image-cleanup-failed") && repo.includes("imageCleanup"));
check("server rechecks inside the delete statement", service.includes("p.status = 'deleted'") && service.includes("NOT EXISTS (SELECT 1 FROM sale_items"));
check("permission stays products.delete", actions.includes("permanentDeletePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete))"));
check("confirmation copy is wired", list.includes("deletePermanentUndo") && list.includes("products-permanent-confirm") && list.includes('t("cancel")'));
const keys = ["deletePermanently", "deletePermanentUndo", "deleteHistoryReason", "deleteStockReason", "deleteRecountReason", "deleteLotReason", "deleteReservationReason", "deleteReferencedReason", "deleteTemporarilyUnavailable"] as const;
check("EN labels", keys.every((key) => tProducts(key, "en") === {
  deletePermanently: "Delete Permanently",
  deletePermanentUndo: "This cannot be undone.",
  deleteHistoryReason: "This product has transaction history and must be retained.",
  deleteStockReason: "This product still has stock. Resolve stock before deleting permanently.",
  deleteRecountReason: "This product requires a stock count before it can be deleted permanently.",
  deleteLotReason: "This product still has inventory lot history.",
  deleteReservationReason: "This product has an active stock reservation.",
  deleteReferencedReason: "This product is referenced by another record and cannot be permanently deleted.",
  deleteTemporarilyUnavailable: "Delete is temporarily unavailable. Try again.",
}[key]));
check("LO labels", keys.every((key) => {
  const value = tProducts(key, "lo");
  return value.length > 0 && value !== tProducts(key, "en");
}) && productsCopyKeyParity());

const failingStorage: ProductImageStorage = {
  createSignedUrls: async () => new Map(),
  remove: async () => {
    throw new Error("forced storage failure");
  },
  upload: async () => undefined,
};
setProductImageStorageForTests(failingStorage);
let cleanupThrew = false;
let cleaned = true;
try {
  cleaned = await cleanupHardDeletedProductImages({ imageUrl: "products/qa/d2/main.webp" });
} catch {
  cleanupThrew = true;
}
setProductImageStorageForTests(null);
check("storage cleanup failure does not throw", !cleanupThrew && cleaned === false);

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
