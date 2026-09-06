import { cookies } from "next/headers";
import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getStockInItems } from "@/features/inventory/inventory-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function StockInPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const snapshot = await getStockInItems();

  return (
    <InventoryActionForm
      items={snapshot.items}
      locale={locale}
      mode="stock-in"
      warehouses={snapshot.warehouses}
    />
  );
}
