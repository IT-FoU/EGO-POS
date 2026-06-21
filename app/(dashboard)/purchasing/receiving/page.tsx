import { ReceivingPageClient } from "@/features/purchasing/components/receiving-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";

export default async function ReceivingPage() {
  const { purchaseOrders, warehouses } = await getPurchasingSnapshot();

  return (
    <ReceivingPageClient
      purchaseOrders={purchaseOrders}
      warehouses={warehouses}
    />
  );
}
