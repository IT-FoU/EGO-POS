import { notFound } from "next/navigation";
import { PromotionForm } from "@/features/promotions/components/promotion-form";
import { getPromotionDetail } from "@/features/promotions/promotion-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isNextProductionBuildPhase()) {
    notFound();
  }

  const { id } = await params;
  const { categories, membershipLevels, products, promotion } = await getPromotionDetail(id);

  if (!promotion) {
    notFound();
  }

  return (
    <PromotionForm
      categories={categories}
      initialPromotion={promotion}
      membershipLevels={membershipLevels}
      products={products}
    />
  );
}
