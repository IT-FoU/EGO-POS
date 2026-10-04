import { cookies } from "next/headers";
import { CustomerForm } from "@/features/customers/components/customer-form";
import { getCustomersSnapshot } from "@/features/customers/customer-service";
import { allowsPermission } from "@/features/access-control/phase3-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function NewCustomerPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value, session.user.locale);
  const tenant = tenantFromSession(session);
  const [{ levels }, keys] = await Promise.all([
    getCustomersSnapshot(),
    getUserPermissionKeys(tenant),
  ]);

  return <CustomerForm canChangeLevel={allowsPermission(keys, "membership.level.change")} levels={levels} locale={locale} />;
}
