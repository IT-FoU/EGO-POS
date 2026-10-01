import { DashboardMemberCustomerPanel } from "@/features/dashboard/components/dashboard-member-customer-panel";
import { getMiniMartDashboardMemberCustomerSnapshot } from "@/features/dashboard/dashboard-member-customer-service";

export async function DashboardMemberCustomerLoader() {
  const snapshot = await getMiniMartDashboardMemberCustomerSnapshot();
  return <DashboardMemberCustomerPanel snapshot={snapshot} />;
}
