"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CreditCard,
  Package,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { DashboardDateRangeControls } from "@/features/dashboard/components/dashboard-date-range-controls";
import type { DashboardAlert, DashboardRangeKey, DashboardSnapshot } from "@/features/dashboard/dashboard-service";
import type { DashboardCopy } from "@/lib/i18n/dashboard-copy";

type DetailKind = "alerts" | "cash_session" | "payment" | "profit" | "sales" | "top_products";

type DashboardInteractionsClientProps = {
  canViewProfit: boolean;
  copy: DashboardCopy;
  customEnd: string;
  customStart: string;
  snapshot: DashboardSnapshot;
  storeName: string;
};

type DetailPanel = {
  description?: string;
  rows?: Array<{ label: string; value: string }>;
  table?: Array<{ label: string; meta?: string; value: string }>;
  title: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatMoney(value: number) {
  return `${formatNumber(value)} LAK`;
}

function formatBusinessDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export function DashboardInteractionsClient({
  canViewProfit,
  copy,
  customEnd,
  customStart,
  snapshot,
  storeName,
}: DashboardInteractionsClientProps) {
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const periodStart = snapshot.period.start;
  const totalPaymentsLak = snapshot.paymentBreakdown.reduce((total, payment) => total + payment.totalLak, 0);
  const maxHourlySales = Math.max(...snapshot.hourlySales.map((point) => point.salesLak), 1);
  const hasSalesData = snapshot.hourlySales.some((point) => point.salesLak > 0);
  const averageBillLak =
    snapshot.cards.totalBillsToday > 0 ? snapshot.cards.salesTodayLak / snapshot.cards.totalBillsToday : 0;
  const profitMargin = snapshot.cards.salesTodayLak > 0
    ? Math.round((snapshot.cards.profitTodayLak / snapshot.cards.salesTodayLak) * 1000) / 10
    : 0;

  const activeDetail = useMemo(
    () =>
      detail
        ? buildDetailPanel({
            averageBillLak,
            canViewProfit,
            copy,
            detail,
            profitMargin,
            snapshot,
            totalPaymentsLak,
          })
        : null,
    [averageBillLak, canViewProfit, copy, detail, profitMargin, snapshot, totalPaymentsLak],
  );

  const metrics = [
    {
      detail: "sales" as const,
      helper: formatRangeLabel(snapshot.period.key, copy),
      icon: WalletCards,
      label: copy.todaySales,
      value: formatMoney(snapshot.cards.salesTodayLak),
    },
    {
      detail: "profit" as const,
      helper: copy.totalProfit,
      icon: TrendingUp,
      label: copy.todayProfit,
      value: canViewProfit ? formatMoney(snapshot.cards.profitTodayLak) : "****",
    },
    {
      detail: "sales" as const,
      helper: copy.averageBill,
      icon: ShoppingCart,
      label: copy.averageBill,
      value: formatMoney(averageBillLak),
    },
    {
      detail: "cash_session" as const,
      helper: copy.cashSessionStatus,
      icon: Banknote,
      label: copy.cashDrawerExpected,
      value: formatMoney(snapshot.shift.expectedCashLak),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{storeName}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{copy.dashboard}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.dashboardSubtitle}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
            <MiniStatus label={copy.businessDate} value={formatBusinessDate(periodStart)} />
            <MiniStatus
              label={copy.status}
              value={formatShiftStatus(snapshot.shift.status, copy)}
              tone={snapshot.shift.status === "open" ? "success" : "default"}
            />
          </div>
        </div>
      </section>

      <DashboardDateRangeControls
        activeRange={snapshot.period.key}
        copy={copy}
        endDate={customEnd}
        startDate={customStart}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            helper={metric.helper}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            onClick={() => setDetail(metric.detail)}
            value={metric.value}
          />
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
        <Panel
          actionLabel={copy.viewDetails}
          onAction={() => setDetail("sales")}
          subtitle={snapshot.period.label}
          title={copy.salesTrend}
        >
          {hasSalesData ? (
            <HourlyChart maxHourlySales={maxHourlySales} points={snapshot.hourlySales} />
          ) : (
            <EmptyState icon={WalletCards} title={copy.emptySales} description={copy.reportNote} />
          )}
        </Panel>

        <div className="grid min-w-0 gap-5">
          <Panel actionLabel={copy.viewDetails} onAction={() => setDetail("payment")} title={copy.paymentBreakdown}>
            {snapshot.paymentBreakdown.length === 0 ? (
              <EmptyState compact icon={CreditCard} title={copy.noPaymentData} description={copy.paymentBreakdown} />
            ) : (
              <div className="grid gap-3">
                {snapshot.paymentBreakdown.map((payment) => {
                  const percent = totalPaymentsLak > 0 ? Math.round((payment.totalLak / totalPaymentsLak) * 100) : 0;
                  return (
                    <PaymentProgress
                      key={payment.method}
                      method={formatPaymentMethod(payment.method, copy)}
                      percent={percent}
                      totalLak={payment.totalLak}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel actionLabel={copy.viewDetails} onAction={() => setDetail("cash_session")} title={copy.cashSessionStatus}>
            <div className="grid gap-3">
              <CashLine label={copy.status} value={formatShiftStatus(snapshot.shift.status, copy)} />
              <CashLine label={copy.openTime} value={formatDateTime(snapshot.shift.openedAt)} />
              <CashLine label={copy.cashExpected} value={formatMoney(snapshot.shift.expectedCashLak)} />
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
        <Panel actionLabel={copy.viewMore} onAction={() => setDetail("top_products")} title={copy.bestSellers}>
          <BestSellersList copy={copy} products={snapshot.topProducts.slice(0, 10)} />
        </Panel>

        <Panel actionLabel={copy.viewDetails} onAction={() => setDetail("alerts")} title={copy.importantAlerts}>
          <AlertsList alerts={snapshot.alerts} copy={copy} />
        </Panel>
      </section>

      <DetailDrawer content={activeDetail} copy={copy} onClose={() => setDetail(null)} />
    </div>
  );
}

function MetricCard({
  helper,
  icon: Icon,
  label,
  onClick,
  value,
}: {
  helper: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
      type="button"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="mt-2 truncate text-2xl font-semibold">{value}</div>
          <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon className="size-5" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

function Panel({
  actionLabel,
  children,
  onAction,
  subtitle,
  title,
}: {
  actionLabel: string;
  children: ReactNode;
  onAction: () => void;
  subtitle?: string;
  title: string;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subtitle ? <p className="text-sm font-medium text-primary">{subtitle}</p> : null}
          <h2 className={subtitle ? "mt-1 text-xl font-semibold" : "text-xl font-semibold"}>{title}</h2>
        </div>
        <button className="text-sm font-semibold text-primary hover:underline" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      </div>
      <div className="mt-5">{children}</div>
    </article>
  );
}

function HourlyChart({
  maxHourlySales,
  points,
}: {
  maxHourlySales: number;
  points: DashboardSnapshot["hourlySales"];
}) {
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex h-56 min-w-[760px] items-end gap-2 border-b border-border px-1">
        {points.map((point) => (
          <div className="flex min-w-7 flex-1 flex-col items-center gap-2" key={point.hour}>
            <div
              className="w-full rounded-t-md bg-primary transition hover:opacity-80"
              style={{ height: `${Math.max((point.salesLak / maxHourlySales) * 180, 4)}px` }}
              title={`${point.hour}: ${formatMoney(point.salesLak)}`}
            />
            <span className="text-xs text-muted-foreground">{point.hour.slice(0, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BestSellersList({ copy, products }: { copy: DashboardCopy; products: DashboardSnapshot["topProducts"] }) {
  if (products.length === 0) {
    return <EmptyState compact icon={Package} title={copy.emptyTopProducts} description={copy.bestSellers} />;
  }

  return (
    <div className="grid gap-2">
      {products.map((product, index) => (
        <div className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-[64px_minmax(0,1fr)_120px_140px] sm:items-center" key={product.name}>
          <span className="font-semibold text-primary">#{index + 1}</span>
          <span className="min-w-0 truncate font-semibold" title={product.name}>{product.name}</span>
          <span className="text-sm text-muted-foreground sm:text-right">{formatNumber(product.quantity)} {copy.unitsSold}</span>
          <span className="font-semibold sm:text-right">{formatMoney(product.totalLak)}</span>
        </div>
      ))}
    </div>
  );
}

function AlertsList({ alerts, copy }: { alerts: DashboardAlert[]; copy: DashboardCopy }) {
  if (alerts.length === 0) {
    return <EmptyState compact icon={AlertTriangle} title={copy.noImportantAlerts} description={copy.emptyAlerts} />;
  }

  return (
    <div className="grid gap-3">
      {alerts.slice(0, 5).map((alert) => (
        <div className="rounded-md border border-border bg-background p-3" key={`${alert.type}-${alert.title}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{alert.type}</span>
            <span className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">{alert.severity}</span>
            {alert.value ? <span className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">{alert.value}</span> : null}
          </div>
          <div className="mt-2 font-semibold">{alert.title}</div>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{alert.message}</p>
        </div>
      ))}
    </div>
  );
}

function PaymentProgress({ method, percent, totalLak }: { method: string; percent: number; totalLak: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{method}</span>
        <span className="font-semibold">{formatMoney(totalLak)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function MiniStatus({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "default" | "success";
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "success" ? "mt-1 font-semibold text-success" : "mt-1 font-semibold"}>{value}</div>
    </div>
  );
}

function CashLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 font-semibold">{value}</span>
    </div>
  );
}

function EmptyState({
  compact = false,
  description,
  icon: Icon,
  title,
}: {
  compact?: boolean;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className={compact ? "rounded-md border border-dashed border-border bg-background p-4 text-center" : "grid min-h-56 place-items-center rounded-md border border-dashed border-border bg-background p-5 text-center"}>
      <div>
        <Icon className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <div className="mt-3 font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function DetailDrawer({
  content,
  copy,
  onClose,
}: {
  content: DetailPanel | null;
  copy: DashboardCopy;
  onClose: () => void;
}) {
  if (!content) return null;

  return (
    <section className="fixed bottom-0 right-0 top-0 z-40 flex w-full max-w-3xl flex-col border-l border-border bg-card shadow-2xl">
      <header className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{copy.detail}</p>
            <h2 className="mt-1 text-2xl font-semibold">{content.title}</h2>
            {content.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{content.description}</p> : null}
          </div>
          <button
            aria-label={copy.close}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:text-foreground"
            type="button"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {content.rows?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {content.rows.map((row) => (
              <SummaryRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ) : null}

        {content.table?.length ? (
          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            {content.table.map((row) => (
              <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-3 last:border-b-0" key={`${row.label}-${row.value}-${row.meta ?? ""}`}>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{row.label}</div>
                  {row.meta ? <div className="mt-1 text-sm text-muted-foreground">{row.meta}</div> : null}
                </div>
                <div className="shrink-0 text-right font-semibold">{row.value}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3">
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 text-right font-semibold">{value}</span>
    </div>
  );
}

function buildDetailPanel({
  averageBillLak,
  canViewProfit,
  copy,
  detail,
  profitMargin,
  snapshot,
  totalPaymentsLak,
}: {
  averageBillLak: number;
  canViewProfit: boolean;
  copy: DashboardCopy;
  detail: DetailKind;
  profitMargin: number;
  snapshot: DashboardSnapshot;
  totalPaymentsLak: number;
}): DetailPanel {
  if (detail === "sales") {
    return {
      rows: [
        { label: copy.totalSales, value: formatMoney(snapshot.cards.salesTodayLak) },
        { label: copy.totalBills, value: formatNumber(snapshot.cards.totalBillsToday) },
        { label: copy.averageBill, value: formatMoney(averageBillLak) },
        { label: copy.cash, value: formatMoney(snapshot.shift.cashSalesLak) },
        { label: copy.qrTransfer, value: formatMoney(snapshot.shift.qrTransferSalesLak) },
      ],
      table: snapshot.hourlySales
        .filter((point) => point.salesLak > 0)
        .map((point) => ({ label: point.hour, meta: copy.salesTrend, value: formatMoney(point.salesLak) })),
      title: copy.salesDetails,
    };
  }

  if (detail === "profit") {
    return {
      description: copy.profitHelperNote,
      rows: canViewProfit
        ? [
            { label: copy.todayProfit, value: formatMoney(snapshot.cards.profitTodayLak) },
            { label: copy.totalSales, value: formatMoney(snapshot.cards.salesTodayLak) },
            { label: copy.cogs, value: formatMoney(snapshot.cards.cogsLak) },
            { label: copy.discount, value: formatMoney(snapshot.cards.discountLak) },
            { label: copy.profitMargin, value: `${profitMargin}%` },
          ]
        : [{ label: copy.profit, value: "****" }],
      title: copy.profitDetails,
    };
  }

  if (detail === "payment") {
    return {
      rows: [{ label: copy.total, value: formatMoney(totalPaymentsLak) }],
      table: snapshot.paymentBreakdown.map((payment) => {
        const percent = totalPaymentsLak > 0 ? Math.round((payment.totalLak / totalPaymentsLak) * 100) : 0;
        return {
          label: formatPaymentMethod(payment.method, copy),
          meta: copy.paymentBreakdown,
          value: `${formatMoney(payment.totalLak)} / ${percent}%`,
        };
      }),
      title: copy.paymentDetails,
    };
  }

  if (detail === "cash_session") {
    return {
      rows: [
        { label: copy.status, value: formatShiftStatus(snapshot.shift.status, copy) },
        { label: copy.openTime, value: formatDateTime(snapshot.shift.openedAt) },
        { label: copy.startingCash, value: formatMoney(snapshot.shift.openingCashLak) },
        { label: copy.cashExpected, value: formatMoney(snapshot.shift.expectedCashLak) },
        { label: copy.cashSales, value: formatMoney(snapshot.shift.cashSalesLak) },
        { label: copy.cashOut, value: formatMoney(snapshot.shift.cashOutLak) },
      ],
      title: copy.cashSessionDetails,
    };
  }

  if (detail === "top_products") {
    return {
      table: snapshot.topProducts.map((product, index) => ({
        label: `${index + 1}. ${product.name}`,
        meta: `${formatNumber(product.quantity)} ${copy.unitsSold}`,
        value: formatMoney(product.totalLak),
      })),
      title: copy.bestSellers,
    };
  }

  return {
    table: snapshot.alerts.map((alert) => ({
      label: alert.title,
      meta: alert.message,
      value: alert.value ?? alert.severity,
    })),
    title: copy.importantAlerts,
  };
}

function formatPaymentMethod(method: string, copy: DashboardCopy) {
  if (method === "cash") return copy.cash;
  if (method === "card") return copy.card;
  if (method === "qr" || method === "transfer") return copy.qrTransfer;
  return copy.otherPayments;
}

function formatShiftStatus(status: "closed" | "not_started" | "open", copy: DashboardCopy) {
  if (status === "open") return copy.statusOpen;
  if (status === "closed") return copy.statusClosed;
  return copy.statusNotStarted;
}

function formatRangeLabel(range: DashboardRangeKey, copy: DashboardCopy) {
  if (range === "week") return copy.thisWeek;
  if (range === "month") return copy.thisMonth;
  if (range === "year") return copy.thisYear;
  if (range === "custom") return copy.customDate;
  return copy.today;
}
