import { cookies } from "next/headers";
import { allowsFine, FINE } from "@/features/access-control/fine-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { InventoryPageClient } from "@/features/inventory/components/inventory-page-client";
import { getInventoryListPage } from "@/features/inventory/inventory-service";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function InventoryPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const session = await requireSession();
  const keys = await getUserPermissionKeys(tenantFromSession(session));
  const listPage = await getInventoryListPage({ page: 1, pageSize: 100 });
  const actions = {
    adjustment: allowsFine(keys, "inventory.adjust"),
    count: allowsFine(keys, "inventory.count"),
    movement: allowsFine(keys, FINE.inventoryMovement),
    stockIn: allowsFine(keys, "inventory.stock_in"),
  };

  return (
    <InventoryPageClient
      actions={actions}
      items={listPage.items}
      listPage={listPage}
      locale={locale}
      movements={listPage.movements}
      warehouses={listPage.warehouses}
    />
  );
}
