import { DashboardPromotionPanel } from "@/features/dashboard/components/dashboard-promotion-panel";
import {
  getMiniMartDashboardPromotionSnapshot,
  type DashboardDateRange,
} from "@/features/dashboard/dashboard-service";

export async function DashboardPromotionLoader({ dateRange }: { dateRange: DashboardDateRange }) {
  const snapshot = await getMiniMartDashboardPromotionSnapshot(dateRange);
  return <DashboardPromotionPanel snapshot={snapshot} />;
}
