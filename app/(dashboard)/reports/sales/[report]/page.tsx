import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CircleDollarSign } from "lucide-react";
import { BarChart, DataTable } from "@/features/reports/components/report-primitives";
import { ReportMetricCard } from "@/features/reports/components/report-metric-card";
import { ReportComingSoon, ReportDetailShell } from "@/features/reports/components/report-page-shell";
import { formatLak } from "@/features/reports/format";
import { findReportCenterEntryBySlug } from "@/features/reports/report-center-catalog";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { paymentMethodLabel, tReports } from "@/lib/i18n/reports-copy";

export default async function SalesCenterReportPage({
  params,
}: {
  params: Promise<{ report: string }>;
}) {
  const { report } = await params;
  const entry = findReportCenterEntryBySlug("sales", report);
  if (!entry) notFound();
  if (entry.reuse === "sales") {
    redirect("/reports/sales");
  }
  if (entry.reuse !== "payment-methods") {
    return <ReportComingSoon entry={entry} />;
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { hub } = await getReportsSnapshot();
  const total = hub.paymentBreakdown.reduce((sum, row) => sum + row.value, 0);

  return (
    <ReportDetailShell entry={entry} locale={locale}>
      <div className="flex flex-col gap-6">
        <section className="grid gap-4 md:grid-cols-2">
          <ReportMetricCard
            icon={CircleDollarSign}
            label={tReports("salesByPayment", locale)}
            labelKey="salesByPayment"
            value={`${formatLak(total)} LAK`}
          />
        </section>
        <BarChart
          rows={hub.paymentBreakdown.map((row) => ({
            label: paymentMethodLabel(row.label, locale),
            value: row.value,
          }))}
          title={tReports("salesByPayment", locale)}
          titleKey="salesByPayment"
          valueKey="value"
        />
        <DataTable
          columnKeys={["paymentMethod", "revenue"]}
          columns={[tReports("paymentMethod", locale), tReports("revenue", locale)]}
          rows={hub.paymentBreakdown.map((row) => [
            paymentMethodLabel(row.label, locale),
            `${formatLak(row.value)} LAK`,
          ])}
        />
      </div>
    </ReportDetailShell>
  );
}
