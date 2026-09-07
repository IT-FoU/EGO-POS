import { cookies } from "next/headers";
import { PromotionsListClient } from "@/features/promotions/components/promotions-list-client";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { promotions } = await getPromotionsSnapshot();

  return <PromotionsListClient locale={locale} promotions={promotions} />;
}
