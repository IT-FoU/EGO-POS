import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PromotionDetailClient } from "@/features/promotions/components/promotion-detail-client";
import { getPromotionDetail } from "@/features/promotions/promotion-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function PromotionDetailPage({
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
  const { categories, products, promotion, simulation } = await getPromotionDetail(id);

  if (!promotion || !simulation) {
    notFound();
  }

  return (
    <PromotionDetailClient
      categories={categories}
      locale={locale}
      products={products}
      promotion={promotion}
      simulation={simulation}
    />
  );
}
