import { mockInventoryItems, mockWarehouses } from "@/features/inventory/mock-data";
import { mockProducts } from "@/features/products/mock-data";
import type { InventoryItem, Warehouse } from "@/features/inventory/types";
import type { Product } from "@/features/products/types";
import {
  mockPurchaseOrders,
  mockSupplierPayables,
  mockSuppliers,
} from "@/features/purchasing/mock-data";
import type { PurchaseOrder, Supplier, SupplierPayable } from "@/features/purchasing/types";
import { isDemoMode } from "@/lib/demo-mode";
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
  if (!isDemoMode()) {
    return getPrismaPurchasingSnapshot(tenantFromSession(await requireSession()));
  }

  return {
    suppliers: mockSuppliers,
    purchaseOrders: mockPurchaseOrders,
    payables: mockSupplierPayables,
    products: mockProducts,
    warehouses: mockWarehouses,
    inventoryItems: mockInventoryItems,
  };
}
