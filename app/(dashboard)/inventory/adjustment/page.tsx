import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";

export default async function StockAdjustmentPage() {
  const snapshot = await getInventorySnapshot();

  return (
    <InventoryActionForm
      items={snapshot.items}
      mode="adjustment"
      warehouses={snapshot.warehouses}
    />
  );
}
