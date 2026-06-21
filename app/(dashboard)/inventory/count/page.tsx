import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";

export default async function StockCountPage() {
  const snapshot = await getInventorySnapshot();

  return (
    <InventoryActionForm
      items={snapshot.items}
      mode="count"
      warehouses={snapshot.warehouses}
    />
  );
}
