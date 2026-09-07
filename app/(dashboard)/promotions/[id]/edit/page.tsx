import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PromotionForm } from "@/features/promotions/components/promotion-form";
import { getPromotionDetail } from "@/features/promotions/promotion-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({
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
  const { categories, membershipLevels, products, promotion } = await getPromotionDetail(id);

  if (!promotion) {
    notFound();
  }

  return (
    <PromotionForm
      categories={categories}
      initialPromotion={promotion}
      locale={locale}
      membershipLevels={membershipLevels}
      products={products}
    />
  );
}
