import { cookies } from "next/headers";
import { PromotionForm } from "@/features/promotions/components/promotion-form";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function NewPromotionPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { categories, membershipLevels, products } = await getPromotionsSnapshot();

  return (
    <PromotionForm
      categories={categories}
      locale={locale}
      membershipLevels={membershipLevels}
      products={products}
    />
  );
}
