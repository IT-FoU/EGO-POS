import type { Product } from "@/features/products/types";
import type { Category } from "@/features/products/types";
import type { PosAuditEntry, PosPendingApprovalRequest } from "@/features/pos/permissions";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import {
  createDemoId,
  readJsonFromStorage,
  readListFromStorage,
  readStringFromStorage,
  runDemoStorageMigrations,
  writeJsonToStorage,
  writeListToStorage,
  writeStringToStorage,
} from "@/lib/demo/storage";

type GenericRecord = Record<string, any>;

function normalizeProductId(product: GenericRecord, index: number, usedIds: Set<string>) {
  const rawId = String(product.id ?? "").trim();
  if (rawId && !usedIds.has(rawId)) {
    usedIds.add(rawId);
    return rawId;
  }

  const nextId = createDemoId(`product-${index + 1}`, usedIds);
  usedIds.add(nextId);
  return nextId;
}

function normalizeProductUnits(productId: string, units: unknown) {
  if (!Array.isArray(units)) {
    return [];
  }

  const usedUnitIds = new Set<string>();
  return units.map((unit: GenericRecord, index: number) => {
    const rawId = String(unit?.id ?? "").trim();
    const id = rawId && !usedUnitIds.has(rawId) ? rawId : `${productId}-unit-${index + 1}`;
    usedUnitIds.add(id);
    return {
      ...unit,
      barcode: String(unit?.barcode ?? ""),
      conversionQty: Math.max(Number(unit?.conversionQty ?? 1) || 1, 1),
      id,
      sortOrder: Number(unit?.sortOrder ?? index),
      status: unit?.status === "inactive" ? "inactive" : "active",
    };
  });
}

export function normalizeStoredProducts(products: GenericRecord[]) {
  const usedIds = new Set<string>();
  return products
    .filter((product) => product && typeof product === "object")
    .map((product, index) => {
      const id = normalizeProductId(product, index, usedIds);
      return {
        ...product,
        barcode: String(product.barcode ?? ""),
        currentStock: Number(product.currentStock ?? product.stockQty ?? 0) || 0,
        id,
        nameEn: String(product.nameEn ?? product.nameLo ?? "Product"),
        nameLo: String(product.nameLo ?? product.nameEn ?? "Product"),
        sku: String(product.sku ?? ""),
        units: normalizeProductUnits(id, product.units),
        updatedAt: product.updatedAt ?? new Date().toISOString(),
      };
    });
}

export const demoProductsRepository = {
  createProductId(products: Array<{ id?: string }>) {
    return createDemoId("product", products.map((product) => String(product.id ?? "")));
  },

  listProducts<T extends GenericRecord = Product>() {
    runDemoStorageMigrations();
    const rawProducts = readListFromStorage<GenericRecord>(DemoStorageKeys.products);
    const normalizedProducts = normalizeStoredProducts(rawProducts);
    if (JSON.stringify(rawProducts) !== JSON.stringify(normalizedProducts)) {
      writeListToStorage(DemoStorageKeys.products, normalizedProducts);
    }
    return normalizedProducts as unknown as T[];
  },

  saveProducts<T extends GenericRecord>(products: T[]) {
    const normalizedProducts = normalizeStoredProducts(products);
    writeListToStorage(DemoStorageKeys.products, normalizedProducts);
    return normalizedProducts as unknown as T[];
  },

  addProduct<T extends GenericRecord>(product: T) {
    const products = this.listProducts<GenericRecord>();
    const nextProducts = this.saveProducts([product, ...products]);
    return nextProducts[0] as T;
  },

  findProduct<T extends GenericRecord = Product>(productId: string) {
    return this.listProducts<T>().find((product) => String(product.id) === productId) ?? null;
  },

  updateProduct<T extends GenericRecord>(productId: string, product: T) {
    const products = this.listProducts<GenericRecord>();
    const nextProducts = products.map((currentProduct) =>
      String(currentProduct.id) === productId ? { ...currentProduct, ...product, id: productId } : currentProduct,
    );
    return this.saveProducts(nextProducts) as unknown as T[];
  },

  deleteProduct(productId: string) {
    const products = this.listProducts<GenericRecord>().filter((product) => String(product.id) !== productId);
    return this.saveProducts(products);
  },

  deleteProducts(productIds: string[]) {
    const ids = new Set(productIds);
    const products = this.listProducts<GenericRecord>().filter((product) => !ids.has(String(product.id)));
    return this.saveProducts(products);
  },

  clearProducts() {
    writeListToStorage(DemoStorageKeys.products, []);
    return [];
  },

  deductStock(soldByProduct: Record<string, number>) {
    const products = this.listProducts<GenericRecord>();
    const nextProducts = products.map((product) => {
      const soldQty = soldByProduct[String(product.id)] ?? 0;
      const currentStock = Number(product.currentStock ?? product.stockQty ?? 0);
      const nextStock = Math.max(0, currentStock - soldQty);
      return {
        ...product,
        currentStock: nextStock,
        stockQty: "stockQty" in product ? nextStock : product.stockQty,
        updatedAt: new Date().toISOString(),
      };
    });
    return this.saveProducts(nextProducts);
  },

  restoreStock(restoredByProduct: Record<string, number>) {
    const products = this.listProducts<GenericRecord>();
    const nextProducts = products.map((product) => {
      const restoredQty = restoredByProduct[String(product.id)] ?? 0;
      const currentStock = Number(product.currentStock ?? product.stockQty ?? 0);
      const nextStock = currentStock + restoredQty;
      return {
        ...product,
        currentStock: nextStock,
        stockQty: "stockQty" in product ? nextStock : product.stockQty,
        updatedAt: new Date().toISOString(),
      };
    });
    return this.saveProducts(nextProducts);
  },
};

function normalizeCategories(categories: GenericRecord[]) {
  const usedIds = new Set<string>();
  return categories
    .filter((category) => category && typeof category === "object")
    .map((category, index) => {
      const rawId = String(category.id ?? "").trim();
      const id = rawId && !usedIds.has(rawId) ? rawId : createDemoId(`category-${index + 1}`, usedIds);
      usedIds.add(id);
      const nameEn = String(category.nameEn ?? category.nameLo ?? "Category");
      const nameLo = String(category.nameLo ?? category.nameEn ?? "Category");
      return {
        ...category,
        id,
        nameEn,
        nameLo,
        productCount: Number(category.productCount ?? 0),
        status: category.status === "inactive" ? "inactive" : "active",
      };
    });
}

export const demoCategoryRepository = {
  listCategories<T extends GenericRecord = Category>() {
    runDemoStorageMigrations();
    const rawCategories = readListFromStorage<GenericRecord>(DemoStorageKeys.categories);
    const normalizedCategories = normalizeCategories(rawCategories);
    if (JSON.stringify(rawCategories) !== JSON.stringify(normalizedCategories)) {
      writeListToStorage(DemoStorageKeys.categories, normalizedCategories);
    }
    return normalizedCategories as unknown as T[];
  },

  saveCategories<T extends GenericRecord>(categories: T[]) {
    const normalizedCategories = normalizeCategories(categories);
    writeListToStorage(DemoStorageKeys.categories, normalizedCategories);
    return normalizedCategories as unknown as T[];
  },

  seedCategories<T extends GenericRecord>(categories: T[]) {
    const existing = this.listCategories<T>();
    if (existing.length > 0) {
      return existing;
    }
    return this.saveCategories(categories);
  },

  upsertCategory<T extends GenericRecord = Category>(input: Partial<Category> & { id?: string; nameEn: string; nameLo: string }) {
    const categories = this.listCategories<GenericRecord>();
    const existing = input.id ? categories.find((category) => String(category.id) === input.id) : null;
    const nextCategory = {
      ...(existing ?? {}),
      id: input.id ?? createDemoId("category", categories.map((category) => String(category.id))),
      nameEn: input.nameEn,
      nameLo: input.nameLo,
      productCount: Number(existing?.productCount ?? 0),
      status: input.status ?? existing?.status ?? "active",
    };
    const nextCategories = existing
      ? categories.map((category) => String(category.id) === input.id ? nextCategory : category)
      : [nextCategory, ...categories];
    return {
      category: nextCategory as unknown as T,
      categories: this.saveCategories(nextCategories) as unknown as T[],
    };
  },

  deleteCategory(categoryId: string) {
    const categories = this.listCategories<GenericRecord>().filter((category) => String(category.id) !== categoryId);
    return this.saveCategories(categories);
  },
};

export const demoInventoryMovementRepository = {
  addMovement<T extends GenericRecord>(movement: T) {
    const movements = readListFromStorage<T>(DemoStorageKeys.inventoryMovements);
    writeListToStorage(DemoStorageKeys.inventoryMovements, [movement, ...movements]);
  },
  listMovements<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.inventoryMovements);
  },
};

export const demoSalesRepository = {
  addSale<T extends GenericRecord>(sale: T) {
    const sales = readListFromStorage<T>(DemoStorageKeys.sales);
    writeListToStorage(DemoStorageKeys.sales, [sale, ...sales]);
    return [sale, ...sales];
  },
  listSales<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.sales);
  },
  saveSales<T extends GenericRecord>(sales: T[]) {
    writeListToStorage(DemoStorageKeys.sales, sales);
    return sales;
  },
  updateSale<T extends GenericRecord>(saleNo: string, updater: (sale: T) => T) {
    const sales = readListFromStorage<T>(DemoStorageKeys.sales);
    const nextSales = sales.map((sale) => (String(sale.saleNo ?? sale.id) === saleNo ? updater(sale) : sale));
    writeListToStorage(DemoStorageKeys.sales, nextSales);
    return nextSales;
  },
};

export const demoReceiptsRepository = {
  addReceipt<T extends GenericRecord>(receipt: T) {
    const receipts = readListFromStorage<T>(DemoStorageKeys.receipts);
    writeListToStorage(DemoStorageKeys.receipts, [receipt, ...receipts]);
  },
  listReceipts<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.receipts);
  },
  updateReceipt<T extends GenericRecord>(receiptNo: string, updater: (receipt: T) => T) {
    const receipts = readListFromStorage<T>(DemoStorageKeys.receipts);
    const nextReceipts = receipts.map((receipt) => (String(receipt.receiptNo ?? receipt.saleNo ?? receipt.id) === receiptNo ? updater(receipt) : receipt));
    writeListToStorage(DemoStorageKeys.receipts, nextReceipts);
    return nextReceipts;
  },
};

export const demoAuditLogRepository = {
  addAuditEntry<T extends GenericRecord>(entry: T, limit = 200) {
    const entries = readListFromStorage<T>(DemoStorageKeys.auditLogs);
    const nextEntries = [entry, ...entries].slice(0, limit);
    writeListToStorage(DemoStorageKeys.auditLogs, nextEntries);
    return nextEntries;
  },
  listAuditEntries<T extends GenericRecord = PosAuditEntry>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.auditLogs);
  },
};

export const demoPendingApprovalRepository = {
  listPendingApprovals<T extends GenericRecord = PosPendingApprovalRequest>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.pendingApprovals);
  },
  savePendingApprovals<T extends GenericRecord>(approvals: T[]) {
    writeListToStorage(DemoStorageKeys.pendingApprovals, approvals);
  },
};

export const demoStaffRepository = {
  listStaff<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.staffUsers);
  },
  saveStaff<T extends GenericRecord>(staff: T[]) {
    writeListToStorage(DemoStorageKeys.staffUsers, staff);
  },
  listStaffAudit<T extends GenericRecord>() {
    return readListFromStorage<T>(DemoStorageKeys.staffAudit);
  },
  addStaffAudit<T extends GenericRecord>(entry: T) {
    const entries = readListFromStorage<T>(DemoStorageKeys.staffAudit);
    writeListToStorage(DemoStorageKeys.staffAudit, [entry, ...entries]);
  },
};

export const demoSettingsRepository = {
  getCompanyLogoUrl() {
    runDemoStorageMigrations();
    return readStringFromStorage(DemoStorageKeys.companyLogoUrl, "");
  },
  setCompanyLogoUrl(value: string) {
    writeStringToStorage(DemoStorageKeys.companyLogoUrl, value);
  },
  getPlanName() {
    return readStringFromStorage(DemoStorageKeys.planName, "");
  },
  getPlanDaysLeft() {
    return readStringFromStorage(DemoStorageKeys.planDaysLeft, "");
  },
  readSettings<T extends GenericRecord>(fallback: T) {
    runDemoStorageMigrations();
    return readJsonFromStorage<T>(DemoStorageKeys.settings, fallback);
  },
  writeSettings<T extends GenericRecord>(settings: T) {
    writeJsonToStorage(DemoStorageKeys.settings, settings);
  },
};

export const demoQrRepository = {
  listBanks<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.qrBanks);
  },
  saveBanks<T extends GenericRecord>(banks: T[]) {
    writeListToStorage(DemoStorageKeys.qrBanks, banks);
  },
  listAccounts<T extends GenericRecord>() {
    runDemoStorageMigrations();
    return readListFromStorage<T>(DemoStorageKeys.qrAccounts);
  },
  saveAccounts<T extends GenericRecord>(accounts: T[]) {
    writeListToStorage(DemoStorageKeys.qrAccounts, accounts);
  },
};

export function createDemoRepository<T extends GenericRecord>(key: string) {
  return {
    list() {
      runDemoStorageMigrations();
      return readListFromStorage<T>(key);
    },
    save(items: T[]) {
      writeListToStorage(key, items);
    },
  };
}

export const demoCustomerRepository = createDemoRepository<GenericRecord>(DemoStorageKeys.customers);
export const demoMembershipRepository = createDemoRepository<GenericRecord>(DemoStorageKeys.memberships);
export const demoPromotionRepository = createDemoRepository<GenericRecord>(DemoStorageKeys.promotions);
