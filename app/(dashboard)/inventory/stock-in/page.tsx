import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getStockInItems } from "@/features/inventory/inventory-service";

export default async function StockInPage() {
  const snapshot = await getStockInItems();

  return (
    <InventoryActionForm
      items={snapshot.items}
      mode="stock-in"
      warehouses={snapshot.warehouses}
    />
  );
}
