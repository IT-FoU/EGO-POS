import { SuppliersListClient } from "@/features/suppliers/components/suppliers-list-client";
import { getSuppliersSnapshot } from "@/features/suppliers/supplier-service";

export default async function SuppliersPage() {
  const { payments, purchaseOrders, suppliers } = await getSuppliersSnapshot();

  return <SuppliersListClient payments={payments} purchaseOrders={purchaseOrders} suppliers={suppliers} />;
}
