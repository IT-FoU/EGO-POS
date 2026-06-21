import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomersSnapshot } from "@/features/customers/customer-service";

export default async function NewCustomerPage() {
  const { levels } = await getCustomersSnapshot();

  return <CustomerForm levels={levels} />;
}
