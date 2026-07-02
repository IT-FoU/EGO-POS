import { CustomersListClient } from "@/features/customers/components/customers-list-client";
import { getCustomersSnapshot } from "@/features/customers/customer-service";
import { requireSession } from "@/lib/auth/session";

export default async function CustomersPage() {
  const session = await requireSession();
  const { customers, payments, purchases } = await getCustomersSnapshot();

  return <CustomersListClient customers={customers} payments={payments} purchases={purchases} storeRoles={session.user.roles} />;
}
