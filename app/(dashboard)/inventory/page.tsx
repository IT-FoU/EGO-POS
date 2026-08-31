import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { InventoryPageClient } from "@/features/inventory/components/inventory-page-client";
import { getInventoryListPage } from "@/features/inventory/inventory-service";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";

export default async function InventoryPage() {
  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "inventory")) {
    return <StoreAccessDenied />;
  }

  const listPage = await getInventoryListPage({ page: 1, pageSize: 100 });

  return (
    <InventoryPageClient
      items={listPage.items}
      listPage={listPage}
      movements={listPage.movements}
      warehouses={listPage.warehouses}
    />
  );
}
