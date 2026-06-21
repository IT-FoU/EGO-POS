import { PurchasingPageClient } from "@/features/purchasing/components/purchasing-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";

export default async function PurchasingPage() {
  const { purchaseOrders, suppliers, payables } = await getPurchasingSnapshot();

  return (
    <PurchasingPageClient
      purchaseOrders={purchaseOrders}
      suppliers={suppliers}
      payables={payables}
    />
  );
}
