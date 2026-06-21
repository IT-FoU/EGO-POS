import { SuppliersPageClient } from "@/features/purchasing/components/suppliers-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";

export default async function SuppliersPage() {
  const { suppliers, purchaseOrders, payables } = await getPurchasingSnapshot();

  return (
    <SuppliersPageClient
      suppliers={suppliers}
      purchaseOrders={purchaseOrders}
      payables={payables}
    />
  );
}
