import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SupplierDetailClient } from "@/features/suppliers/components/supplier-detail-client";
import { getSupplierDetail } from "@/features/suppliers/supplier-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

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
      locale={locale}
      payments={payments}
      purchaseOrders={purchaseOrders}
      receivings={receivings}
      supplier={supplier}
    />
  );
}
