import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  getPrismaInventorySnapshot,
  getPrismaReceivableCatalogItems,
  mergeQuickStockInCatalog,
  mergeStockInCatalog,
} from "@/features/inventory/prisma-repository";

export async function getInventorySnapshot(): Promise<{
  warehouses: Warehouse[];
  items: InventoryItem[];
  movements: StockMovement[];
}> {
  // DB-only (B7-4): warehouses, stock items, movements, and lots are read from
  // PostgreSQL via Prisma, scoped to the active tenant/company/warehouse.
  // Missing data yields empty live results, never mock.
  return getPrismaInventorySnapshot(tenantFromSession(await requireSession()));
}

export async function getReceivableCatalogItems(): Promise<InventoryItem[]> {
  return getPrismaReceivableCatalogItems(tenantFromSession(await requireSession()));
}

export async function getQuickStockInItems(): Promise<{
  items: InventoryItem[];
  warehouses: Warehouse[];
}> {
  const tenant = tenantFromSession(await requireSession());
  const [snapshot, catalog] = await Promise.all([
    getPrismaInventorySnapshot(tenant),
    getPrismaReceivableCatalogItems(tenant),
  ]);
  return {
    items: mergeQuickStockInCatalog(snapshot.items, catalog),
    warehouses: snapshot.warehouses,
  };
}

export async function getStockInItems(): Promise<{
  items: InventoryItem[];
  warehouses: Warehouse[];
}> {
  const tenant = tenantFromSession(await requireSession());
  const [snapshot, catalog] = await Promise.all([
    getPrismaInventorySnapshot(tenant),
    getPrismaReceivableCatalogItems(tenant),
  ]);
  return {
    items: mergeStockInCatalog(snapshot.items, catalog),
    warehouses: snapshot.warehouses,
  };
}
