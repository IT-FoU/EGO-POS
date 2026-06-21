import { PayablesPageClient } from "@/features/purchasing/components/payables-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";

export default async function PayablesPage() {
  const { payables, suppliers } = await getPurchasingSnapshot();

  return <PayablesPageClient payables={payables} suppliers={suppliers} />;
}
