import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";

export default async function StockInPage() {
  const snapshot = await getInventorySnapshot();

  return (
    <InventoryActionForm
      items={snapshot.items}
      mode="stock-in"
      warehouses={snapshot.warehouses}
    />
  );
}
