import { cookies } from "next/headers";
import { PromotionAnalyticsClient } from "@/features/promotions/components/promotion-analytics-client";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionAnalyticsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { promotions } = await getPromotionsSnapshot();

  return <PromotionAnalyticsClient locale={locale} promotions={promotions} />;
}
