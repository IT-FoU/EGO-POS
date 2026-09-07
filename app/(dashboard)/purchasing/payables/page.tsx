import { cookies } from "next/headers";
import { PayablesPageClient } from "@/features/purchasing/components/payables-page-client";
import { getPurchasingSnapshot } from "@/features/purchasing/purchasing-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PayablesPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { payables, suppliers } = await getPurchasingSnapshot();

  return <PayablesPageClient locale={locale} payables={payables} suppliers={suppliers} />;
}
