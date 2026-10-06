import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inventoryCopyKeyParity, tInventory } from "../lib/i18n/inventory-copy";
import { posCopyKeyParity, tPos } from "../lib/i18n/pos-copy";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";
import {
  INVENTORY_STOCK_SORT_KEY,
  POS_PRODUCT_SORT_KEY,
  PRODUCT_LIST_PAGE_SIZE_KEY,
  PRODUCT_LIST_SORT_KEY,
} from "../features/products/list-preferences";
import {
  compareProductSort,
  parseProductListPageSize,
  parseProductSortMode,
  productListOrderBy,
  sortProductRecords,
  type ProductSortRecord,
} from "../features/products/product-sort";

function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const records: ProductSortRecord[] = [
  { createdAt: "2026-01-02T00:00:00.000Z", id: "b", nameEn: "Banana", nameLo: "ກ້ວຍ" },
  { createdAt: "2026-03-01T00:00:00.000Z", id: "c", nameEn: "Apple", nameLo: "ໝາກໂປມ" },
  { createdAt: "2026-01-02T00:00:00.000Z", id: "a", nameEn: "Banana", nameLo: "ກ້ວຍ" },
  { createdAt: "2024-05-01T00:00:00.000Z", id: "d", nameEn: "Cherry", nameLo: "ເຊີຣີ" },
];

const az = sortProductRecords(records, "name_asc", "en").map((row) => row.id);
const za = sortProductRecords(records, "name_desc", "en").map((row) => row.id);
const newest = sortProductRecords(records, "newest", "en").map((row) => row.id);
const oldest = sortProductRecords(records, "oldest", "en").map((row) => row.id);

check("1. A–Z names ascending with stable id", az.join(",") === "c,a,b,d");
check("2. Z–A names descending with stable id", za.join(",") === "d,a,b,c");
check("3. Newest created first with stable id", newest.join(",") === "c,a,b,d");
check("4. Oldest created first with stable id", oldest.join(",") === "d,a,b,c");
check("5. Equal names do not swap the pair", compareProductSort(records[0]!, records[2]!, "name_asc", "en") > 0);
check("6. Invalid sort falls back to newest", parseProductSortMode("lao-script") === "newest");
check("7. Page size accepts 25/50/100 and rejects junk", parseProductListPageSize("50") === 50 && parseProductListPageSize("25") === 25 && parseProductListPageSize("100") === 100 && parseProductListPageSize("999") === 100);
check(
  "8. Server orderBy matches the four modes",
  productListOrderBy("name_asc", "en")[0]?.nameEn != null
    && productListOrderBy("name_desc", "lo")[0]?.nameLo != null
    && productListOrderBy("newest", "en")[0]?.createdAt === "desc"
    && productListOrderBy("oldest", "en")[0]?.createdAt === "asc"
    && productListOrderBy("newest", "en")[1]?.id === "asc",
);

const productList = read("features/products/components/product-list-client.tsx");
const inventoryPage = read("features/inventory/components/inventory-page-client.tsx");
const inventoryQuery = read("features/inventory/list-query.ts");
const stockOverview = read("features/inventory/components/stock-overview-table.tsx");
const posPage = read("features/pos/components/pos-page-client.tsx");
const workspaceTopics = productList.slice(productList.indexOf("const topics = ["), productList.indexOf("const topics = [") + 700);

check("9. Workspace keeps Product List, Categories, Labels", workspaceTopics.includes('drawerKey: "product_list"') && workspaceTopics.includes('drawerKey: "categories"') && workspaceTopics.includes('drawerKey: "labels"'));
check("10. Workspace removes duplicate Barcode / Images / Health rows", !workspaceTopics.includes('drawerKey: "barcode_sku"') && !workspaceTopics.includes('drawerKey: "images"') && !workspaceTopics.includes("productHealthHint"));
check("11. KPI cards and view details remain", productList.includes("ProductShellMetric") && productList.includes('t("viewDetails")') && productList.includes('onOpenDrawer("missing_images")') && productList.includes('onOpenDrawer("missing_barcode")') && productList.includes('onOpenDrawer("product_health")'));
check("12. More Actions closes on outside click, Escape, and menu selection", productList.includes('document.addEventListener("pointerdown"') && productList.includes('event.key !== "Escape"') && productList.includes("setActionMenuOpen(false)") && productList.includes('aria-haspopup="menu"') && productList.includes('role="menuitem"'));
check("13. Product sort and page size use separate device keys", productList.includes("readProductListSort") && productList.includes("writeProductListPageSize") && PRODUCT_LIST_SORT_KEY === "ego.products.listSort" && PRODUCT_LIST_PAGE_SIZE_KEY === "ego.products.pageSize");
check("14. Product list fetch stays on the existing action", productList.includes("loadProductListAction") && productList.includes("sort: sortMode") && read("features/products/list-query.ts").includes("productListOrderBy("));
check("15. POS sort lives in More and does not replace scan matching", posPage.includes('data-testid="pos-product-sort"') && posPage.includes("writePosProductSort") && posPage.includes("findPosScanMatch(visibleProducts") && posPage.includes("filterPosCatalogue(") && POS_PRODUCT_SORT_KEY === "ego.pos.productSort");
const favoriteBlock = posPage.slice(posPage.indexOf("const favoriteProducts"), posPage.indexOf("const favoriteCartQtyByProductId"));
check("16. POS favorites stay unsorted by the grid sort", favoriteBlock.length > 0 && !favoriteBlock.includes("sortProductRecords"));
check("17. Inventory stock overview sort is server-side and filter SQL is unchanged", inventoryQuery.includes("product_created_at") && inventoryQuery.includes("sort_name") && inventoryQuery.includes("${input.sortMode} = 'newest'") && inventoryQuery.includes("ORDER BY updated_at DESC, id DESC LIMIT 20") && stockOverview.includes('data-testid="inventory-stock-sort"') && inventoryPage.includes("writeInventoryStockSort") && INVENTORY_STOCK_SORT_KEY === "ego.inventory.stockSort");
check("18. Inventory has no rows-per-page control to persist", !inventoryPage.includes("rowsPerPage") && !stockOverview.includes("rowsPerPage"));

const sortKeys = ["sortBy", "sortNameAsc", "sortNameDesc", "sortNewest", "sortOldest"] as const;
check("19. EN product sort labels", sortKeys.every((key) => tProducts(key, "en") === {
  sortBy: "Sort by",
  sortNameAsc: "A–Z",
  sortNameDesc: "Z–A",
  sortNewest: "Newest first",
  sortOldest: "Oldest first",
}[key]));
check("20. LO product sort labels are not English fallbacks", tProducts("sortBy", "lo") === "ຈັດລຽງ" && tProducts("sortNewest", "lo") === "ໃໝ່ສຸດກ່ອນ" && tProducts("sortOldest", "lo") === "ເກົ່າສຸດກ່ອນ" && tProducts("sortNameAsc", "lo") === "A–Z");
check("21. EN/LO POS sort labels", tPos("ui.sort.by", "en") === "Sort by" && tPos("ui.sort.newest", "lo") === "ໃໝ່ສຸດກ່ອນ" && tPos("ui.sort.oldest", "lo") === "ເກົ່າສຸດກ່ອນ" && tPos("ui.sort.by", "lo") !== tPos("ui.sort.by", "en"));
check("22. EN/LO inventory sort labels", tInventory("sortBy", "en") === "Sort by" && tInventory("sortNewest", "lo") === "ໃໝ່ສຸດກ່ອນ" && tInventory("sortBy", "lo") === "ຈັດລຽງ");
check("23. Copy key parity", productsCopyKeyParity() && posCopyKeyParity() && inventoryCopyKeyParity());

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exit(1);
}
