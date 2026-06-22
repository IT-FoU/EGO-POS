import type { InventoryItem, Warehouse } from "@/features/inventory/types";
import type { Product } from "@/features/products/types";
import type { PurchaseOrder, Supplier, SupplierPayable } from "@/features/purchasing/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaPurchasingSnapshot } from "@/features/purchasing/prisma-repository";

export async function getPurchasingSnapshot(): Promise<{
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  payables: SupplierPayable[];
  products: Product[];
  warehouses: Warehouse[];
  inventoryItems: InventoryItem[];
}> {
  // DB-only (B7-4): purchase orders, receiving, products, inventory, suppliers,
  // and payables are read from PostgreSQL via Prisma, scoped to the active
  // tenant/company/warehouse. Missing data yields empty live results, never mock.
  return getPrismaPurchasingSnapshot(tenantFromSession(await requireSession()));
}
