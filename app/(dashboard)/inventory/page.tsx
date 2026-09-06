import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { InventoryPageClient } from "@/features/inventory/components/inventory-page-client";
import { getInventoryListPage } from "@/features/inventory/inventory-service";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function InventoryPage() {
  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "inventory")) {
    return <StoreAccessDenied />;
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const listPage = await getInventoryListPage({ page: 1, pageSize: 100 });

  return (
    <InventoryPageClient
      items={listPage.items}
      listPage={listPage}
      locale={locale}
      movements={listPage.movements}
      warehouses={listPage.warehouses}
    />
  );
}
