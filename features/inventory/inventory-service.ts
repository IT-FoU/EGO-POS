import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";

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
