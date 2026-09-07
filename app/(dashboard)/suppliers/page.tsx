import { cookies } from "next/headers";
import { SuppliersListClient } from "@/features/suppliers/components/suppliers-list-client";
import { getSuppliersSnapshot } from "@/features/suppliers/supplier-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function SuppliersPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { payments, purchaseOrders, suppliers } = await getSuppliersSnapshot();

  return (
    <SuppliersListClient
      locale={locale}
      payments={payments}
      purchaseOrders={purchaseOrders}
      suppliers={suppliers}
    />
  );
}
