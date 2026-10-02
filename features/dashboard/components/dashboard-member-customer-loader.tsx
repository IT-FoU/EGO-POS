import { DashboardMemberCustomerPanel } from "@/features/dashboard/components/dashboard-member-customer-panel";
import { getMiniMartDashboardMemberCustomerSnapshot } from "@/features/dashboard/dashboard-member-customer-service";

export async function DashboardMemberCustomerLoader({
  linkCustomers = true,
  linkMembership = true,
}: {
  linkCustomers?: boolean;
  linkMembership?: boolean;
}) {
  const snapshot = await getMiniMartDashboardMemberCustomerSnapshot();
  return <DashboardMemberCustomerPanel linkCustomers={linkCustomers} linkMembership={linkMembership} snapshot={snapshot} />;
}
