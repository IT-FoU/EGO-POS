import { t } from "@/lib/i18n/ui";
import { Gift, TrendingUp, Users, WalletCards } from "lucide-react";
import { BarChart, DataTable, MetricCard, ReportHeader, } from "@/features/reports/components/report-primitives";
import { calculateAvailablePoints } from "@/features/customers/format";
import { membershipDisplayLabel } from "@/features/customers/membership-display";
import { formatLak, formatNumber } from "@/features/reports/format";
import { getReportsSnapshot } from "@/features/reports/report-service";
export default async function CustomerReportPage() {
    const { customers } = await getReportsSnapshot();
    const topCustomers = [...customers].sort((a, b) => b.totalPurchasesLak - a.totalPurchasesLak);
    const totalSpending = customers.reduce((total, customer) => total + customer.totalPurchasesLak, 0);
    const totalPoints = customers.reduce((total, customer) => total + calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints), 0);
    return (<div className="flex flex-col gap-6">
      <ReportHeader title="Customer Report" description={t("ui.top.customers.loyalty.points.and.customer.sp")}/>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Total Customers" value={formatNumber(customers.length)}/>
        <MetricCard icon={TrendingUp} label="Top Customer" value={topCustomers[0]?.fullName ?? "N/A"}/>
        <MetricCard icon={Gift} label="Loyalty Points" value={formatNumber(totalPoints)}/>
        <MetricCard icon={WalletCards} label="Customer Spending" value={`${formatLak(totalSpending)} LAK`}/>
      </section>
      <BarChart rows={topCustomers.map((customer) => ({ label: customer.fullName, spending: customer.totalPurchasesLak }))} title="Customer Spending" valueKey="spending"/>
      <DataTable columns={["Customer", "Membership", "Total Purchases", "Earned Points", "Redeemed Points", "Available Points"]} rows={topCustomers.map((customer) => [
            customer.fullName,
            membershipDisplayLabel(customer.membershipLevel),
            `${formatLak(customer.totalPurchasesLak)} LAK`,
            formatNumber(customer.earnedPoints),
            formatNumber(customer.redeemedPoints),
            formatNumber(calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints)),
        ])}/>
    </div>);
}
