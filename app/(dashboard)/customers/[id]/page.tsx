import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { allowsPermission } from "@/features/access-control/phase3-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { CustomerDetailClient } from "@/features/customers/components/customer-detail-client";
import { getCustomerDetail } from "@/features/customers/customer-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (isNextProductionBuildPhase()) {
    notFound();
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { id } = await params;
  const session = await requireSession();
  const permissionKeys = await getUserPermissionKeys(tenantFromSession(session));
  const { customer, payments, pointEntries, purchases } = await getCustomerDetail(id);

  if (!customer) {
    notFound();
  }

  return (
    <CustomerDetailClient
      canAdjustPoints={allowsPermission(permissionKeys, "membership.points.adjust")}
      customer={customer}
      locale={locale}
      payments={payments}
      pointEntries={pointEntries}
      purchases={purchases}
    />
  );
}
