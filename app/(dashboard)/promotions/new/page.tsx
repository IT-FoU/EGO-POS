import { PromotionForm } from "@/features/promotions/components/promotion-form";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";

export default async function NewPromotionPage() {
  const { categories, membershipLevels, products } = await getPromotionsSnapshot();

  return (
    <PromotionForm
      categories={categories}
      membershipLevels={membershipLevels}
      products={products}
    />
  );
}
