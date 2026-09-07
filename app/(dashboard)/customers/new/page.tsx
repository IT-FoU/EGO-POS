import { cookies } from "next/headers";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomersSnapshot } from "@/features/customers/customer-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function NewCustomerPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { levels } = await getCustomersSnapshot();

  return <CustomerForm levels={levels} locale={locale} />;
}
