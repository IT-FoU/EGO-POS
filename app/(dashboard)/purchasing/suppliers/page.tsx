import { cookies } from "next/headers";
import { SuppliersPageClient } from "@/features/purchasing/components/suppliers-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PurchasingSuppliersPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { payables, purchaseOrders, suppliers } = await getPurchasingSnapshot();

  return (
    <SuppliersPageClient
      locale={locale}
      payables={payables}
      purchaseOrders={purchaseOrders}
      suppliers={suppliers}
    />
  );
}
