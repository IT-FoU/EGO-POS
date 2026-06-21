import { CustomersListClient } from "@/features/customers/components/customers-list-client";
import { getCustomersSnapshot } from "@/features/customers/customer-service";

export default async function CustomersPage() {
  const { customers, payments, purchases } = await getCustomersSnapshot();

  return <CustomersListClient customers={customers} payments={payments} purchases={purchases} />;
}
