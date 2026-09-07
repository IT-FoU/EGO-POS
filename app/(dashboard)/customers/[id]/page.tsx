import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CustomerDetailClient } from "@/features/customers/components/customer-detail-client";
import { getCustomerDetail } from "@/features/customers/customer-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isNextProductionBuildPhase()) {
    notFound();
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { id } = await params;
  const { customer, payments, purchases } = await getCustomerDetail(id);

  if (!customer) {
    notFound();
  }

  return (
    <CustomerDetailClient
      customer={customer}
      locale={locale}
      payments={payments}
      purchases={purchases}
    />
  );
}
