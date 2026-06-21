import { PurchaseOrderForm } from "@/features/purchasing/components/purchase-order-form";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";

export default async function NewPurchaseOrderPage() {
  const { products, suppliers, warehouses } = await getPurchasingSnapshot();

  return (
    <PurchaseOrderForm
      products={products}
      suppliers={suppliers}
      warehouses={warehouses}
    />
  );
}
