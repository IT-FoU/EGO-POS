import { cookies } from "next/headers";
import { CustomersListClient } from "@/features/customers/components/customers-list-client";
import { getCustomersSnapshot } from "@/features/customers/customer-service";
import { requireSession } from "@/lib/auth/session";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function CustomersPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { customers, payments, purchases } = await getCustomersSnapshot();

  return (
    <CustomersListClient
      customers={customers}
      locale={locale}
      payments={payments}
      purchases={purchases}
      storeRoles={session.user.roles}
    />
  );
}
