import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { InventoryPageClient } from "@/features/inventory/components/inventory-page-client";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";

export default async function InventoryPage() {
  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "inventory")) {
    return <StoreAccessDenied />;
  }

  const snapshot = await getInventorySnapshot();

  return (
    <InventoryPageClient
      items={snapshot.items}
      movements={snapshot.movements}
      warehouses={snapshot.warehouses}
    />
  );
}
