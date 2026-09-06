import { cookies } from "next/headers";
import { QuickStockInForm } from "@/features/inventory/components/quick-stock-in-form";
import { getQuickStockInItems } from "@/features/inventory/inventory-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function QuickStockInPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const [snapshot, suppliers] = await Promise.all([getQuickStockInItems(), getSuppliers()]);

  return (
    <QuickStockInForm
      items={snapshot.items}
      locale={locale}
      suppliers={suppliers}
      warehouses={snapshot.warehouses}
    />
  );
}
