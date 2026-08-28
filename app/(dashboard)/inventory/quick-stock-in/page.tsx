import { QuickStockInForm } from "@/features/inventory/components/quick-stock-in-form";
import { getQuickStockInItems } from "@/features/inventory/inventory-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";

export default async function QuickStockInPage() {
  const [snapshot, suppliers] = await Promise.all([getQuickStockInItems(), getSuppliers()]);

  return (
    <QuickStockInForm
      items={snapshot.items}
      suppliers={suppliers}
      warehouses={snapshot.warehouses}
    />
  );
}
