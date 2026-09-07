import { cookies } from "next/headers";
import { ReceivingPageClient } from "@/features/purchasing/components/receiving-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ReceivingPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { purchaseOrders, warehouses } = await getPurchasingSnapshot();

  return (
    <ReceivingPageClient
      locale={locale}
      purchaseOrders={purchaseOrders}
      warehouses={warehouses}
    />
  );
}
