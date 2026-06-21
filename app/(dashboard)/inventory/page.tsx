import { InventoryPageClient } from "@/features/inventory/components/inventory-page-client";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";

export default async function InventoryPage() {
  const snapshot = await getInventorySnapshot();

  return (
    <InventoryPageClient
      items={snapshot.items}
      movements={snapshot.movements}
      warehouses={snapshot.warehouses}
    />
  );
}
