import { notFound } from "next/navigation";
import { CustomerDetailClient } from "@/features/customers/components/customer-detail-client";
import { getCustomerDetail } from "@/features/customers/customer-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isNextProductionBuildPhase()) {
    notFound();
  }

  const { id } = await params;
  const { customer, payments, purchases } = await getCustomerDetail(id);

  if (!customer) {
    notFound();
  }

  return (
    <CustomerDetailClient
      customer={customer}
      payments={payments}
      purchases={purchases}
    />
  );
}
