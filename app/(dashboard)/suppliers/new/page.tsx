import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { getSuppliers } from "@/features/suppliers/supplier-service";

export default async function NewSupplierPage() {
  const suppliers = await getSuppliers();
  return <SupplierForm existingSuppliers={suppliers} />;
}
