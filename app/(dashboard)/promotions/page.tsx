import { PromotionsListClient } from "@/features/promotions/components/promotions-list-client";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";

export default async function PromotionsPage() {
  const { promotions } = await getPromotionsSnapshot();

  return <PromotionsListClient promotions={promotions} />;
}
