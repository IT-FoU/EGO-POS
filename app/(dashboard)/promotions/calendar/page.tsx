import { cookies } from "next/headers";
import { PromotionCalendarClient } from "@/features/promotions/components/promotion-calendar-client";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionCalendarPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { promotions } = await getPromotionsSnapshot();

  return <PromotionCalendarClient locale={locale} promotions={promotions} />;
}
