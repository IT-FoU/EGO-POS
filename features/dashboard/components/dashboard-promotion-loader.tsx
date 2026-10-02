import { DashboardPromotionPanel } from "@/features/dashboard/components/dashboard-promotion-panel";
import {
  getMiniMartDashboardPromotionSnapshot,
  type DashboardDateRange,
} from "@/features/dashboard/dashboard-service";

export async function DashboardPromotionLoader({ dateRange, linkPromotions = true }: { dateRange: DashboardDateRange; linkPromotions?: boolean }) {
  const snapshot = await getMiniMartDashboardPromotionSnapshot(dateRange);
  return <DashboardPromotionPanel linkPromotions={linkPromotions} snapshot={snapshot} />;
}
