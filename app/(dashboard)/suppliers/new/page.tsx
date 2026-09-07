import { cookies } from "next/headers";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function NewSupplierPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const suppliers = await getSuppliers();
  return <SupplierForm existingSuppliers={suppliers} locale={locale} />;
}
