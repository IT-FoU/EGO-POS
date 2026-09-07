import { cookies } from "next/headers";
import { PurchaseOrderForm } from "@/features/purchasing/components/purchase-order-form";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function NewPurchaseOrderPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { products, suppliers, warehouses } = await getPurchasingSnapshot();

  return (
    <PurchaseOrderForm
      locale={locale}
      products={products}
      suppliers={suppliers}
      warehouses={warehouses}
    />
  );
}
