import {
  mockInventoryItems,
  mockStockMovements,
  mockWarehouses,
} from "@/features/inventory/mock-data";
import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import { isDemoMode } from "@/lib/demo-mode";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";

export async function getInventorySnapshot(): Promise<{
  warehouses: Warehouse[];
  items: InventoryItem[];
  movements: StockMovement[];
}> {
  if (!isDemoMode()) {
    return getPrismaInventorySnapshot(tenantFromSession(await requireSession()));
  }

  return {
    warehouses: mockWarehouses,
    items: mockInventoryItems,
    movements: mockStockMovements,
  };
}
