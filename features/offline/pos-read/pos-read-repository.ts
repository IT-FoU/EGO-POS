/**
 * POS read repository (Phase 6) — the read-side adapter boundary.
 *
 * A single interface with two implementations:
 * - {@link OnlinePosReadRepository}: wraps the existing SSR POS snapshot (online
 *   behavior unchanged — same data, same meaning).
 * - {@link OfflinePosReadRepository}: reads the local reference replica and
 *   enforces terminal/company/branch/warehouse scope at this boundary.
 *
 * Both use the shared pure search helpers so results are identical.
 */

import type { StoreNamespace } from "../types";
import type { StoreSnapshotRepository, LocalPosSnapshot } from "../replica/store-snapshot-repository";
import {
  findProductByBarcode,
  listCategoriesSorted,
  searchCustomers,
  searchProducts,
} from "./pos-search";
import {
  posSnapshotToReadModel,
  type CashSessionPayload,
  type CategoryPayload,
  type CustomerPayload,
  type OnlineSnapshotInput,
  type PosReadModel,
  type PosReadSource,
  type ProductPayload,
  type PromotionPayload,
  type SettingsPayload,
  type StockLevelPayload,
  type StoreContextPayload,
} from "./pos-read-types";

export interface PosReadRepository {
  readonly source: PosReadSource;
  searchProducts(query: string, limit?: number): Promise<ProductPayload[]>;
  lookupBarcode(barcode: string): Promise<ProductPayload | null>;
  getProduct(id: string): Promise<ProductPayload | null>;
  listCategories(): Promise<CategoryPayload[]>;
  searchCustomers(query: string, limit?: number): Promise<CustomerPayload[]>;
  listPromotions(): Promise<PromotionPayload[]>;
  getStock(productId: string, warehouseId?: string): Promise<StockLevelPayload | null>;
  getCashSession(): Promise<CashSessionPayload | null>;
  getSettings(): Promise<SettingsPayload | null>;
  getStoreContext(): Promise<StoreContextPayload | null>;
}

/** Shared read logic over an in-memory read model (used by both adapters). */
class ModelBackedRepository implements PosReadRepository {
  constructor(
    readonly source: PosReadSource,
    protected readonly model: PosReadModel,
  ) {}

  async searchProducts(query: string, limit = 50): Promise<ProductPayload[]> {
    return searchProducts(this.model.products, query, limit);
  }
  async lookupBarcode(barcode: string): Promise<ProductPayload | null> {
    return findProductByBarcode(this.model.products, barcode);
  }
  async getProduct(id: string): Promise<ProductPayload | null> {
    return this.model.products.find((product) => product.id === id && product.isActive) ?? null;
  }
  async listCategories(): Promise<CategoryPayload[]> {
    return listCategoriesSorted(this.model.categories);
  }
  async searchCustomers(query: string, limit = 50): Promise<CustomerPayload[]> {
    return searchCustomers(this.model.customers, query, limit);
  }
  async listPromotions(): Promise<PromotionPayload[]> {
    return [...this.model.promotions];
  }
  async getStock(productId: string, warehouseId?: string): Promise<StockLevelPayload | null> {
    return (
      this.model.stockLevels.find(
        (stock) =>
          stock.productId === productId &&
          (warehouseId === undefined || stock.warehouseId === warehouseId),
      ) ?? null
    );
  }
  async getCashSession(): Promise<CashSessionPayload | null> {
    return this.model.cashSession;
  }
  async getSettings(): Promise<SettingsPayload | null> {
    return this.model.settings;
  }
  async getStoreContext(): Promise<StoreContextPayload | null> {
    return this.model.storeContext;
  }
}

/** Online adapter over the existing SSR POS snapshot. */
export class OnlinePosReadRepository extends ModelBackedRepository {
  constructor(snapshot: OnlineSnapshotInput) {
    super("online", posSnapshotToReadModel(snapshot));
  }
}

export class PosReplicaScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosReplicaScopeError";
  }
}

/**
 * Verify the local replica's store context matches the expected terminal scope.
 * Returns the validated model or throws {@link PosReplicaScopeError}. This is the
 * adapter boundary scope enforcement (company + branch + warehouse + terminal).
 */
export function assertReplicaScope(
  snapshot: LocalPosSnapshot,
  expected: StoreNamespace & { warehouseId?: string | null },
): PosReadModel {
  const ctx = snapshot.storeContext;
  if (!ctx) {
    throw new PosReplicaScopeError("Local replica has no store context; not ready for offline POS");
  }
  if (ctx.companyId !== expected.companyId) {
    throw new PosReplicaScopeError("Replica company does not match the terminal");
  }
  if (ctx.branchId !== expected.branchId) {
    throw new PosReplicaScopeError("Replica branch does not match the terminal");
  }
  if (ctx.terminalId !== expected.terminalId) {
    throw new PosReplicaScopeError("Replica terminal does not match this terminal");
  }
  if (
    expected.warehouseId != null &&
    ctx.warehouseId != null &&
    ctx.warehouseId !== expected.warehouseId
  ) {
    throw new PosReplicaScopeError("Replica warehouse does not match the terminal");
  }
  return {
    storeContext: ctx,
    settings: snapshot.settings,
    categories: snapshot.categories,
    products: snapshot.products,
    customers: snapshot.customers,
    promotions: snapshot.promotions,
    stockLevels: snapshot.stockLevels,
    cashSession: snapshot.cashSession,
  };
}

/** Offline adapter over the local reference replica (scope-enforced). */
export class OfflinePosReadRepository extends ModelBackedRepository {
  private constructor(model: PosReadModel) {
    super("offline", model);
  }

  /** Load + scope-check the replica; throws if scope mismatches. */
  static async load(
    replica: StoreSnapshotRepository,
    expected: StoreNamespace & { warehouseId?: string | null },
  ): Promise<OfflinePosReadRepository> {
    const snapshot = await replica.readLocalSnapshot();
    const model = assertReplicaScope(snapshot, expected);
    return new OfflinePosReadRepository(model);
  }

  /** Build directly from an already-validated model (tests). */
  static fromModel(model: PosReadModel): OfflinePosReadRepository {
    return new OfflinePosReadRepository(model);
  }
}
