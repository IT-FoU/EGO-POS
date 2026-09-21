import { cookies } from "next/headers";
import { ReportCenterClient } from "@/features/reports/components/report-center-client";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  return <ReportCenterClient locale={locale} />;
}
