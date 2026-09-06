import { cookies } from "next/headers";
import { InventoryActionForm } from "@/features/inventory/components/inventory-action-form";
import { getInventorySnapshot } from "@/features/inventory/inventory-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function StockAdjustmentPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const snapshot = await getInventorySnapshot();

  return (
    <InventoryActionForm
      items={snapshot.items}
      locale={locale}
      mode="adjustment"
      warehouses={snapshot.warehouses}
    />
  );
}
