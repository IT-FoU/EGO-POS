import { notFound } from "next/navigation";
import { SupplierDetailClient } from "@/features/suppliers/components/supplier-detail-client";
import { getSupplierDetail } from "@/features/suppliers/supplier-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isNextProductionBuildPhase()) {
    notFound();
  }

  const { id } = await params;
  const { payments, purchaseOrders, receivings, supplier } =
    await getSupplierDetail(id);

  if (!supplier) {
    notFound();
  }

  return (
    <SupplierDetailClient
      payments={payments}
      purchaseOrders={purchaseOrders}
      receivings={receivings}
      supplier={supplier}
    />
  );
}
