import { t } from "@/lib/i18n/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, Boxes, CalendarDays, CalendarClock, CheckCircle2, ClipboardCheck, CreditCard, DollarSign, Package, PackagePlus, PackageX, Plus, ReceiptText, ShoppingBag, TrendingDown, TrendingUp, Truck, WalletCards, } from "lucide-react";
import { CloseDayPanel } from "@/features/dashboard/components/close-day-panel";
import { DashboardDateRangeControls } from "@/features/dashboard/components/dashboard-date-range-controls";
import { getMiniMartDashboardSnapshot, shouldRouteToPos, type DashboardAlert, type DashboardDateRange, type DashboardRangeKey, } from "@/features/dashboard/dashboard-service";
import { requireSession } from "@/lib/auth/session";
export const dynamic = "force-dynamic";
const rangeKeys = new Set<DashboardRangeKey>(["custom", "month", "today", "week", "year"]);
function formatLak(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}
function dateInputValue(value: Date) {
    return value.toISOString().slice(0, 10);
}
function formatBusinessDate(value: Date) {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(value);
}
function parseDateRange(params: Record<string, string | string[] | undefined>): DashboardDateRange {
    const requestedRange = typeof params.range === "string" ? params.range : "today";
    const key = rangeKeys.has(requestedRange as DashboardRangeKey)
        ? (requestedRange as DashboardRangeKey)
        : "today";
    const start = typeof params.start === "string" ? new Date(params.start) : undefined;
    const end = typeof params.end === "string" ? new Date(params.end) : undefined;
    return {
        end: end && Number.isFinite(end.getTime()) ? end : undefined,
        key,
        start: start && Number.isFinite(start.getTime()) ? start : undefined,
    };
}
export default async function DashboardPage({ searchParams, }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const session = await requireSession();
    if (shouldRouteToPos(session.user.roles ?? [])) {
        redirect("/pos");
    }
    const params = await searchParams;
    const dateRange = parseDateRange(params);
    const snapshot = await getMiniMartDashboardSnapshot(dateRange);
    const maxHourlySales = Math.max(...snapshot.hourlySales.map((point) => point.salesLak), 1);
    const storeName = session.user.activeCompanyName ?? "Business";
    const periodStart = new Date(snapshot.period.start);
    const periodEnd = new Date(snapshot.period.end);
    const customStart = dateRange.start ? dateInputValue(dateRange.start) : dateInputValue(periodStart);
    const customEnd = dateRange.end ? dateInputValue(dateRange.end) : dateInputValue(new Date(periodEnd.getTime() - 1));
    const hasSalesData = snapshot.hourlySales.some((point) => point.salesLak > 0);
    const cards = [
        { accent: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", icon: WalletCards, label: "Sales", value: `${formatLak(snapshot.cards.salesTodayLak)} LAK` },
        { accent: "border-blue-500/40 bg-blue-500/10 text-blue-400", icon: TrendingUp, label: "Profit", value: `${formatLak(snapshot.cards.profitTodayLak)} LAK` },
        { accent: "border-slate-500/40 bg-slate-500/10 text-slate-300", icon: ReceiptText, label: "Total Bills", value: String(snapshot.cards.totalBillsToday) },
        { accent: "border-teal-500/40 bg-teal-500/10 text-teal-400", icon: ShoppingBag, label: "Items Sold", value: formatLak(snapshot.cards.itemsSoldToday) },
        { accent: "border-orange-500/40 bg-orange-500/10 text-orange-400", icon: Boxes, label: "Low Stock", value: String(snapshot.cards.lowStockProducts) },
        { accent: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400", icon: CalendarClock, label: "Near Expiry", value: String(snapshot.cards.nearExpiryProducts) },
        { accent: "border-red-500/40 bg-red-500/10 text-red-400", icon: PackageX, label: "Expired", value: String(snapshot.cards.expiredProducts) },
        { accent: "border-purple-500/40 bg-purple-500/10 text-purple-400", icon: CreditCard, label: "Customer Credit Due", value: `${formatLak(snapshot.cards.customerCreditDueLak)} LAK` },
        { accent: "border-red-500/40 bg-red-500/10 text-red-400", icon: Truck, label: "Supplier Payables Due", value: `${formatLak(snapshot.cards.supplierPayablesDueLak)} LAK` },
        { accent: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400", icon: Banknote, label: "Cash Drawer Expected", value: `${formatLak(snapshot.cards.cashDrawerExpectedLak)} LAK` },
    ];
    const quickActions = [
        { href: "/pos", icon: Plus, label: "New Sale" },
        { href: "/products/new", icon: PackagePlus, label: "New Product" },
        { href: "/purchasing/new", icon: Truck, label: "Purchase Order" },
        { href: "/inventory/count", icon: ClipboardCheck, label: "Stock Count" },
        { href: "#close-day", icon: CalendarDays, label: "Close Day" },
    ];
    return (<div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{storeName}</p>
            <h1 className="mt-1 text-2xl font-semibold">Store Dashboard</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("ui.sales.inventory.alerts.credit.reminders.and.")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <DayStatusMetric label="Business Date" value={formatBusinessDate(periodStart)}/>
            <DayStatusMetric label="Status" value="OPEN" tone="success"/>
            <Link className="inline-flex h-full min-h-14 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="#close-day">
              Close Day
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <DashboardDateRangeControls activeRange={snapshot.period.key} endDate={customEnd} startDate={customStart}/>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-semibold">Quick Actions</div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {quickActions.map((action) => {
            const Icon = action.icon;
            return (<Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold transition hover:border-primary hover:bg-primary/10" href={action.href} key={action.label}>
                  <Icon className="size-4" aria-hidden="true"/>
                  {action.label}
                </Link>);
        })}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
            const Icon = card.icon;
            return (<article className="rounded-lg border border-border bg-card p-3.5" key={card.label}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm text-muted-foreground">{card.label}</div>
                <div className={`grid size-8 shrink-0 place-items-center rounded-md border ${card.accent}`}>
                  <Icon className="size-4" aria-hidden="true"/>
                </div>
              </div>
              <div className="mt-2 truncate text-xl font-semibold">{card.value}</div>
            </article>);
        })}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <article className="min-w-0 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-primary">{snapshot.period.label}</p>
              <h2 className="mt-1 text-xl font-semibold">Sales by Hour</h2>
            </div>
            <span className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              LAK
            </span>
          </div>
          {hasSalesData ? (<div className="mt-5 overflow-x-auto pb-2">
              <div className="flex h-72 min-w-[760px] items-end gap-2 border-b border-border px-1">
                {snapshot.hourlySales.map((point) => (<div className="flex min-w-7 flex-1 flex-col items-center gap-2" key={point.hour}>
                    <div className="w-full rounded-t-md bg-emerald-500/80 transition" style={{ height: `${Math.max((point.salesLak / maxHourlySales) * 220, 4)}px` }} title={`${point.hour}: ${formatLak(point.salesLak)} LAK`}/>
                    <span className="text-[11px] text-muted-foreground">{point.hour.slice(0, 2)}</span>
                  </div>))}
              </div>
            </div>) : (<div className="mt-5 grid h-72 place-items-center rounded-md border border-dashed border-border bg-background text-center">
              <div>
                <DollarSign className="mx-auto size-10 text-muted-foreground" aria-hidden="true"/>
                <p className="mt-3 text-sm font-semibold">No sales data for selected period</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("ui.sales.by.hour.will.appear.after.transactions")}</p>
              </div>
            </div>)}
        </article>

        <article className="min-w-0 rounded-lg border border-border bg-card p-5">
          <p className="text-sm font-medium text-primary">Top 10 Selling Products</p>
          <h2 className="mt-1 text-xl font-semibold">Best sellers</h2>
          <div className="mt-5 flex max-h-72 flex-col gap-3 overflow-y-auto">
            {snapshot.topProducts.length === 0 ? (<div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">{t("ui.no.products.sold.in.this.period")}</div>) : (snapshot.topProducts.map((product, index) => (<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3" key={product.name}>
                  <div className="min-w-0">
                    <div className="font-semibold">
                      {index + 1}. {product.name}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{formatLak(product.quantity)} items sold</div>
                  </div>
                  <div className="shrink-0 text-right font-semibold">{formatLak(product.totalLak)} LAK</div>
                </div>)))}
          </div>
        </article>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Dashboard Alerts</p>
          <h2 className="text-xl font-semibold">Needs attention</h2>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {snapshot.alerts.length === 0 ? (<div className="col-span-full grid min-h-32 place-items-center rounded-md border border-dashed border-border bg-background p-5 text-center">
              <div>
                <CheckCircle2 className="mx-auto size-9 text-success" aria-hidden="true"/>
                <div className="mt-3 font-semibold">All Systems Normal</div>
                <p className="mt-1 text-sm text-muted-foreground">{t("ui.no.business.alerts.today")}</p>
              </div>
            </div>) : (snapshot.alerts.map((alert) => (<AlertCard alert={alert} key={`${alert.type}-${alert.title}`}/>)))}
        </div>
      </section>

      <div id="close-day">
        <CloseDayPanel closeDay={snapshot.closeDay}/>
      </div>
    </div>);
}
function DayStatusMetric({ label, tone = "default", value, }: {
    label: string;
    tone?: "default" | "success";
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "success" ? "mt-1 font-semibold text-emerald-400" : "mt-1 font-semibold"}>
        {value}
      </div>
    </div>);
}
function AlertCard({ alert }: {
    alert: DashboardAlert;
}) {
    const visual = getAlertVisual(alert.title);
    const title = alert.title === "Low stock"
        ? "Low Stock Products"
        : alert.title === "Near expiry"
            ? "Near Expiry Products"
            : alert.title === "Customer credit due"
                ? "Customer Credit Due"
                : alert.title === "Supplier due"
                    ? "Supplier Payment Due"
                    : alert.title === "Cash drawer mismatch"
                        ? "Cash Difference"
                        : alert.title;
    const content = (<div className="flex h-full gap-3 rounded-md border border-border bg-background p-4 transition hover:border-primary">
      <div className={`grid size-10 shrink-0 place-items-center rounded-md border ${visual.className}`}>
        <visual.icon className="size-5" aria-hidden="true"/>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{alert.type}</span>
          <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${visual.className}`}>
            {alert.severity}
          </span>
          {alert.value ? (<span className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">
              {alert.value}
            </span>) : null}
        </div>
        <div className="mt-1 font-semibold">{title}</div>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{alert.message}</p>
      </div>
    </div>);
    return alert.href ? <Link href={alert.href}>{content}</Link> : content;
}
function getAlertVisual(title: string) {
    if (title === "Dead Stock") {
        return {
            className: "border-orange-500/40 bg-orange-500/10 text-orange-400",
            icon: Package,
        };
    }
    if (title === "Low Sales Warning") {
        return {
            className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
            icon: TrendingDown,
        };
    }
    if (title === "Cash Difference" || title === "Cash drawer mismatch") {
        return {
            className: "border-danger/40 bg-danger/10 text-danger",
            icon: AlertTriangle,
        };
    }
    if (title === "Near expiry") {
        return {
            className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
            icon: CalendarClock,
        };
    }
    if (title === "Supplier due") {
        return {
            className: "border-red-500/40 bg-red-500/10 text-red-400",
            icon: Truck,
        };
    }
    if (title === "Customer credit due") {
        return {
            className: "border-purple-500/40 bg-purple-500/10 text-purple-400",
            icon: CreditCard,
        };
    }
    return {
        className: "border-primary/40 bg-primary/10 text-primary",
        icon: AlertTriangle,
    };
}
