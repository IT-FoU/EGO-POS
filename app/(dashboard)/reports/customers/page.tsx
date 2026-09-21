import { cookies } from "next/headers";
import { Gift, TrendingUp, Users, WalletCards } from "lucide-react";
import { BarChart, DataTable, ReportHeader } from "@/features/reports/components/report-primitives";
import { ReportMetricCard } from "@/features/reports/components/report-metric-card";
import { calculateAvailablePoints } from "@/features/customers/format";
import { membershipDisplayLabel } from "@/features/customers/membership-display";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tReports } from "@/lib/i18n/reports-copy";

export default async function CustomerReportPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { customers } = await getReportsSnapshot();
  const topCustomers = [...customers].sort((a, b) => b.totalPurchasesLak - a.totalPurchasesLak);
  const totalSpending = customers.reduce((total, customer) => total + customer.totalPurchasesLak, 0);
  const totalPoints = customers.reduce(
    (total, customer) => total + calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        description={tReports("customerReports", locale)}
        descriptionKey="customerReports"
        locale={locale}
        title={tReports("customerReport", locale)}
        titleKey="customerReport"
      />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ReportMetricCard icon={Users} label={tReports("totalCustomers", locale)} labelKey="totalCustomers" value={formatNumber(customers.length)} />
        <ReportMetricCard icon={TrendingUp} label={tReports("topCustomer", locale)} labelKey="topCustomer" value={topCustomers[0]?.fullName ?? tReports("na", locale)} />
        <ReportMetricCard icon={Gift} label={tReports("loyaltyPoints", locale)} labelKey="loyaltyPoints" value={formatNumber(totalPoints)} />
        <ReportMetricCard icon={WalletCards} label={tReports("customerSpending", locale)} labelKey="customerSpending" value={`${formatLak(totalSpending)} LAK`} />
      </section>
      <BarChart
        rows={topCustomers.map((customer) => ({ label: customer.fullName, spending: customer.totalPurchasesLak }))}
        title={tReports("customerSpending", locale)}
        titleKey="customerSpending"
        valueKey="spending"
      />
      <DataTable
        columnKeys={["customers", "membership", "customerSpending", "earnedPoints", "redeemedPoints", "availablePoints"]}
        columns={[
          tReports("customers", locale),
          tReports("membership", locale),
          tReports("customerSpending", locale),
          tReports("earnedPoints", locale),
          tReports("redeemedPoints", locale),
          tReports("availablePoints", locale),
        ]}
        rows={topCustomers.map((customer) => [
          customer.fullName,
          membershipDisplayLabel(customer.membershipLevel),
          `${formatLak(customer.totalPurchasesLak)} LAK`,
          formatNumber(customer.earnedPoints),
          formatNumber(customer.redeemedPoints),
          formatNumber(calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints)),
        ])}
      />
    </div>
  );
}
