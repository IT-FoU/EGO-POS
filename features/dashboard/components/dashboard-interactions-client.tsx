"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import type { DashboardWidgets } from "@/features/access-control/phase3-permissions";
import type { DashboardAlert, DashboardRangeKey, DashboardSnapshot } from "@/features/dashboard/dashboard-service";
import { formatBusinessDateLabel, formatBusinessDateTimeLabel } from "@/lib/datetime/business-timezone";
import {
  buildImportantAlertsView,
  formatDashboardAlertSeverity,
  localizeDashboardAlerts,
} from "@/features/dashboard/localize-dashboard-alerts";
import { getDashboardCopy, type DashboardCopy } from "@/lib/i18n/dashboard-copy";
import { AppLocaleProvider, useAppLocale } from "@/lib/i18n/use-app-locale";

type DetailKind = "alerts" | "cash_session" | "payment" | "profit" | "recent_bills" | "sales" | "top_products";

type DashboardInteractionsClientProps = {
  alertsSlot?: ReactNode;
  insightsSlot?: ReactNode;
  promotionSlot?: ReactNode;
  canViewProfit: boolean;
  copy: DashboardCopy;
  customEnd: string;
  customStart: string;
  snapshot: DashboardSnapshot;
  storeName: string;
  widgets: DashboardWidgets;
};

type DetailPanel = {
  description?: string;
  rows?: Array<{ label: string; value: string }>;
  table?: Array<{ label: string; meta?: string; value: string }>;
  title: string;
};

const dashboardDisplayClass =
  "transition duration-150 hover:border-primary hover:shadow-sm";
const dashboardActionClass =
  "cursor-pointer transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatMoney(value: number) {
  return `${formatNumber(value)} LAK`;
}

function formatBusinessDate(value: string) {
  return formatBusinessDateLabel(value);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return formatBusinessDateTimeLabel(value);
}

export function DashboardInteractionsClient({
  alertsSlot,
  insightsSlot,
  promotionSlot,
  canViewProfit,
  copy: _ssrCopy,
  customEnd,
  customStart,
  snapshot,
  storeName,
  widgets,
}: DashboardInteractionsClientProps) {
  const locale = useAppLocale();
  const copy = getDashboardCopy(locale);
  const [detail, setDetail] = useState<DetailKind | null>(null);
  const periodStart = snapshot.period.start;
  const totalPaymentsLak = snapshot.paymentBreakdown.reduce((total, payment) => total + payment.totalLak, 0);
  const trendPoints = snapshot.salesTrend ?? snapshot.hourlySales;
  const maxTrendSales = Math.max(...trendPoints.map((point) => point.salesLak), 1);
  const hasSalesData = trendPoints.some((point) => point.salesLak > 0);
  const hasDashboardError = snapshot.dataStatus.hasError;
  const averageBillLak = snapshot.cards.averageBillLak
    ?? (snapshot.cards.totalBillsToday > 0 ? snapshot.cards.salesTodayLak / snapshot.cards.totalBillsToday : 0);
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
            showCost: widgets.cost,
            snapshot,
            totalPaymentsLak,
          })
        : null,
    [averageBillLak, canViewProfit, copy, detail, profitMargin, snapshot, totalPaymentsLak, widgets.cost],
  );

  const metrics = [
    widgets.sales ? {
      helper: formatRangeLabel(snapshot.period.key, copy),
      icon: WalletCards,
      label: copy.todaySales,
      value: formatMoney(snapshot.cards.salesTodayLak),
    } : null,
    widgets.profit ? {
      helper: copy.totalProfit,
      icon: TrendingUp,
      label: copy.todayProfit,
      value: hasDashboardError ? copy.unavailable : formatMoney(snapshot.cards.profitTodayLak),
    } : null,
    widgets.bills ? {
      helper: copy.totalBills,
      icon: ReceiptText,
      label: copy.totalBills,
      value: hasDashboardError ? copy.unavailable : formatNumber(snapshot.cards.totalBillsToday),
    } : null,
    widgets.avgBill ? {
      helper: copy.averageBill,
      icon: ShoppingCart,
      label: copy.averageBill,
      value: hasDashboardError ? copy.unavailable : formatMoney(averageBillLak),
    } : null,
    widgets.cashSession ? {
      helper: copy.cashSessionStatus,
      icon: Banknote,
      label: copy.cashDrawerExpected,
      value: hasDashboardError ? copy.unavailable : cashSessionValue(snapshot, copy),
    } : null,
  ].filter((metric): metric is NonNullable<typeof metric> => Boolean(metric));

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {snapshot.dataStatus.hasError ? (
        <DataStatusBanner message={copy.dashboardUnavailable} tone="error" />
      ) : snapshot.dataStatus.isPartial ? (
        <DataStatusBanner
          message={
            snapshot.dataStatus.warnings?.some((warning) => warning.includes("sale lines"))
              ? copy.grossProfitWarning
              : copy.dashboardPartialWarning
          }
          tone="warning"
        />
      ) : null}
      <section className={`${dashboardDisplayClass} rounded-lg border border-border bg-card p-5`}>
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

      {metrics.length > 0 ? (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard
            helper={metric.helper}
            icon={metric.icon}
            key={metric.label}
            label={metric.label}
            value={metric.value}
          />
        ))}
      </section>
      ) : null}

      {widgets.trend || widgets.sales || widgets.cashSession ? (
      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        {widgets.trend ? (
        <Panel
          actionLabel={copy.viewDetails}
          onAction={() => setDetail("sales")}
          subtitle={formatRangeLabel(snapshot.period.key, copy)}
          title={trendTitle(snapshot.period.trendGranularity, copy)}
        >
          {hasDashboardError ? (
            <EmptyState compact icon={AlertTriangle} title={copy.unavailable} description={copy.dashboardUnavailable} />
          ) : hasSalesData ? (
            <SalesTrendChart maxSales={maxTrendSales} points={trendPoints} />
          ) : (
            <EmptyState
              icon={WalletCards}
              title={copy.emptySales}
              description={trendEmptyDescription(snapshot.period.trendGranularity, copy)}
            />
          )}
        </Panel>
        ) : null}

        <div className="grid min-w-0 content-start gap-5">
          {widgets.sales ? (
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
          ) : null}

          {widgets.cashSession ? (
          <Panel actionLabel={copy.viewDetails} onAction={() => setDetail("cash_session")} title={copy.cashSessionStatus}>
            <CashSessionSummary snapshot={snapshot} copy={copy} />
          </Panel>
          ) : null}
        </div>
      </section>
      ) : null}

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.75fr)]">
        {widgets.bestSellers ? (
        <Panel actionLabel={copy.viewMore} onAction={() => setDetail("top_products")} title={copy.bestSellersByRevenue}>
          <BestSellersList copy={copy} products={snapshot.topProducts.slice(0, 10)} />
        </Panel>
        ) : null}
        {alertsSlot ?? <ImportantAlertsCard alerts={snapshot.alerts} dataStatus={snapshot.dataStatus} />}
      </section>

      {widgets.recentBills ? (
        <Panel actionLabel={copy.viewMore} onAction={() => setDetail("recent_bills")} title={copy.recentSales}>
          {snapshot.recentSales.length === 0 ? (
            <EmptyState compact icon={ReceiptText} title={copy.recentSales} description={copy.emptySales} />
          ) : (
            <div className="grid gap-2">
              {snapshot.recentSales.slice(0, 8).map((sale) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={sale.saleNo}>
                  <span className="min-w-0 truncate font-medium">{sale.saleNo}</span>
                  <span className="shrink-0 text-muted-foreground">{formatMoney(sale.totalLak)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {insightsSlot}

      {promotionSlot}

      <DetailDrawer content={activeDetail} copy={copy} onClose={() => setDetail(null)} />
    </div>
  );
}

function MetricCard({
  helper,
  icon: Icon,
  label,
  value,
}: {
  helper: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className={`${dashboardDisplayClass} flex min-h-[124px] min-w-0 flex-col justify-between rounded-lg border border-border bg-card p-4 text-left`}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-medium leading-5 text-muted-foreground">{label}</p>
        <div className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/40 bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-3 min-w-0">
        <div className="whitespace-nowrap text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
        <p className="mt-1 min-h-4 break-words text-xs leading-4 text-muted-foreground">{helper}</p>
      </div>
    </div>
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
    <article className={`${dashboardDisplayClass} min-w-0 rounded-lg border border-border bg-card p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {subtitle ? <p className="text-sm font-medium text-primary">{subtitle}</p> : null}
          <h2 className={subtitle ? "mt-1 text-xl font-semibold" : "text-xl font-semibold"}>{title}</h2>
        </div>
        <button
          className={`${dashboardActionClass} rounded-sm px-2 py-1 text-sm font-semibold text-primary hover:bg-primary/10 hover:text-foreground hover:underline`}
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

function SalesTrendChart({
  maxSales,
  points,
}: {
  maxSales: number;
  points: DashboardSnapshot["hourlySales"];
}) {
  const needsNarrowRangeScroll = points.length >= 24;
  return (
    <div className="overflow-x-auto pb-2">
      <div className={`flex h-56 ${needsNarrowRangeScroll ? "min-w-[680px] sm:min-w-0" : "min-w-full"} items-end gap-1 border-b border-border px-1 sm:gap-2`}>
        {points.map((point) => (
          <div className="flex min-w-7 flex-1 flex-col items-center gap-2" key={point.label}>
            <div
              aria-label={`${point.label}: ${formatMoney(point.salesLak)}`}
              className="w-full rounded-t-md bg-primary transition hover:opacity-80"
              role="img"
              style={{ height: `${point.salesLak > 0 ? (point.salesLak / maxSales) * 180 : 0}px` }}
              title={`${point.label}: ${formatMoney(point.salesLak)}`}
            />
            <span className="whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">{point.label}</span>
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
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" title={copy.productRevenueHelper}>
          {copy.productRevenue}
        </p>
        <span className="text-xs text-muted-foreground">{copy.topTen}</span>
      </div>
      {products.map((product, index) => (
        <div className={`${dashboardDisplayClass} grid min-w-0 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background p-3`} key={product.name}>
          <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">#{index + 1}</span>
          <span className="min-w-0 break-words font-semibold" title={product.name}>{product.name}</span>
          <span className="shrink-0 text-right font-semibold" title={copy.productRevenueHelper}>{formatMoney(product.totalLak)}</span>
        </div>
      ))}
    </div>
  );
}

function PaymentProgress({ method, percent, totalLak }: { method: string; percent: number; totalLak: number }) {
  return (
    <div className={`${dashboardDisplayClass} rounded-md border border-border bg-background p-3`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 break-words font-semibold">{method}</span>
        <span className="shrink-0 text-right font-semibold">{formatMoney(totalLak)}</span>
      </div>
      <div
        aria-label={`${method}: ${percent}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-1 text-right text-xs text-muted-foreground">{percent}%</div>
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
    <div className={`${dashboardDisplayClass} rounded-md border border-border bg-background px-4 py-3`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "success" ? "mt-1 font-semibold text-success" : "mt-1 font-semibold"}>{value}</div>
    </div>
  );
}

function CashLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${dashboardDisplayClass} flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3`}>
      <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
      <span className="shrink-0 font-semibold">{value}</span>
    </div>
  );
}

function DataStatusBanner({ message, tone }: { message: string; tone: "error" | "warning" }) {
  return (
    <div
      className={`${dashboardDisplayClass} ${
        tone === "error"
          ? "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
          : "rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm text-primary"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}

function cashSessionValue(snapshot: DashboardSnapshot, copy: DashboardCopy) {
  if (snapshot.shift.hasActiveCashSession) {
    return formatMoney(snapshot.shift.expectedCashLak);
  }
  return snapshot.shift.requireCashShiftBeforeSale ? copy.noOpenCashSession : copy.noActiveCashSession;
}

function CashSessionSummary({ copy, snapshot }: { copy: DashboardCopy; snapshot: DashboardSnapshot }) {
  if (!snapshot.shift.hasActiveCashSession) {
    return (
      <EmptyState
        compact
        icon={Banknote}
        title={snapshot.shift.requireCashShiftBeforeSale ? copy.noOpenCashSession : copy.noActiveCashSession}
        description={copy.cashSessionStatus}
      />
    );
  }

  return (
    <div className="grid gap-3">
      <CashLine label={copy.status} value={formatShiftStatus(snapshot.shift.status, copy)} />
      <CashLine label={copy.cashier} value={snapshot.shift.cashierName ?? copy.currentCashier} />
      <CashLine label={copy.openTime} value={formatDateTime(snapshot.shift.openedAt)} />
      <CashLine label={copy.openingCash} value={formatMoney(snapshot.shift.openingCashLak)} />
      <CashLine label={copy.cashExpected} value={formatMoney(snapshot.shift.expectedCashLak)} />
      {snapshot.shift.countedCashLak !== null ? (
        <CashLine label={copy.countedCash} value={formatMoney(snapshot.shift.countedCashLak)} />
      ) : null}
      {snapshot.shift.differenceLak !== null ? (
        <CashLine label={copy.variance} value={formatMoney(snapshot.shift.differenceLak)} />
      ) : null}
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
    <div
      className={`${dashboardDisplayClass} ${
        compact
          ? "rounded-md border border-dashed border-border bg-background p-4 text-center"
          : "grid min-h-56 place-items-center rounded-md border border-dashed border-border bg-background p-5 text-center"
      }`}
    >
      <div>
        <Icon className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
        <div className="mt-3 font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function trendTitle(granularity: DashboardSnapshot["period"]["trendGranularity"], copy: DashboardCopy) {
  if (granularity === "day") return copy.dailySales;
  if (granularity === "month") return copy.monthlySales;
  return copy.hourlySales;
}

function trendEmptyDescription(granularity: DashboardSnapshot["period"]["trendGranularity"], copy: DashboardCopy) {
  if (granularity === "day") return copy.reportNoteDaily;
  if (granularity === "month") return copy.reportNoteMonthly;
  return copy.reportNoteHourly;
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
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!content) return;
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusableElements.length === 0) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    };
  }, [content, onClose]);

  if (!content) return null;

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72" role="presentation">
      <section
        aria-labelledby="dashboard-detail-title"
        aria-modal="true"
        className="flex h-full w-full max-w-none flex-col overflow-x-hidden border-l border-border bg-card shadow-2xl"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
      <header className="sticky top-0 z-20 border-b border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">{copy.detail}</p>
            <h2 className="mt-1 text-2xl font-semibold" id="dashboard-detail-title">{content.title}</h2>
            {content.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{content.description}</p> : null}
          </div>
          <button
            aria-label={copy.close}
            className={`${dashboardActionClass} grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground hover:border-primary hover:bg-primary/10 hover:text-foreground`}
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
      </header>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
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
              <div className={`${dashboardDisplayClass} flex min-w-0 items-center justify-between gap-3 border-b border-border p-3 last:border-b-0`} key={`${row.label}-${row.value}-${row.meta ?? ""}`}>
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
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${dashboardDisplayClass} flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3`}>
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
  showCost,
  snapshot,
  totalPaymentsLak,
}: {
  averageBillLak: number;
  canViewProfit: boolean;
  copy: DashboardCopy;
  detail: DetailKind;
  profitMargin: number;
  showCost: boolean;
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
      table: (snapshot.salesTrend ?? snapshot.hourlySales)
        .filter((point) => point.salesLak > 0)
        .map((point) => ({ label: point.label, meta: trendTitle(snapshot.period.trendGranularity, copy), value: formatMoney(point.salesLak) })),
      title: copy.salesDetails,
    };
  }

  if (detail === "profit") {
    return {
      description: copy.profitHelperNote,
      rows: canViewProfit
        ? [
            { label: copy.todayProfit, value: snapshot.dataStatus.hasError ? copy.unavailable : formatMoney(snapshot.cards.profitTodayLak) },
            { label: copy.totalSales, value: formatMoney(snapshot.cards.salesTodayLak) },
            ...(showCost ? [{ label: copy.cogs, value: formatMoney(snapshot.cards.cogsLak) }] : []),
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
        { label: copy.cashier, value: snapshot.shift.cashierName ?? copy.currentCashier },
        { label: copy.openTime, value: formatDateTime(snapshot.shift.openedAt) },
        { label: copy.startingCash, value: formatMoney(snapshot.shift.openingCashLak) },
        { label: copy.cashExpected, value: cashSessionValue(snapshot, copy) },
        ...(snapshot.shift.countedCashLak === null
          ? []
          : [{ label: copy.countedCash, value: formatMoney(snapshot.shift.countedCashLak) }]),
        ...(snapshot.shift.differenceLak === null
          ? []
          : [{ label: copy.variance, value: formatMoney(snapshot.shift.differenceLak) }]),
        { label: copy.cashSales, value: formatMoney(snapshot.shift.cashSalesLak) },
        { label: copy.cashOut, value: formatMoney(snapshot.shift.cashOutLak) },
      ],
      title: copy.cashSessionDetails,
    };
  }

  if (detail === "recent_bills") {
    return {
      table: snapshot.recentSales.map((sale) => ({
        label: sale.saleNo,
        meta: formatPaymentMethod(sale.paymentMethod, copy),
        value: formatMoney(sale.totalLak),
      })),
      title: copy.recentSales,
    };
  }

  if (detail === "top_products") {
    return {
      description: copy.productRevenueHelper,
      table: snapshot.topProducts.map((product, index) => ({
        label: `${index + 1}. ${product.name}`,
        meta: copy.productRevenue,
        value: formatMoney(product.totalLak),
      })),
      title: copy.bestSellersByRevenue,
    };
  }

  return {
    table: localizeDashboardAlerts(snapshot.alerts, copy).map((alert) => ({
      label: alert.title,
      meta: alert.message,
      value: alert.value ?? formatDashboardAlertSeverity(alert.severity, copy),
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

function ImportantAlertsCard({
  alerts,
  dataStatus,
}: {
  alerts: DashboardAlert[];
  dataStatus?: DashboardSnapshot["dataStatus"];
}) {
  const locale = useAppLocale();
  const view = buildImportantAlertsView(alerts, locale);
  const [open, setOpen] = useState(false);
  const content = open
    ? {
        table: view.items.map((alert) => ({
          label: alert.title,
          meta: alert.message,
          value: alert.value ?? alert.severityLabel,
        })),
        title: view.title,
      }
    : null;

  return (
    <>
      <Panel actionLabel={view.viewDetails} onAction={() => setOpen(true)} title={view.title}>
        {dataStatus?.hasError ? (
          <EmptyState compact icon={AlertTriangle} title={view.copy.unavailable} description={view.copy.dashboardUnavailable} />
        ) : view.items.length === 0 ? (
          <EmptyState compact icon={AlertTriangle} title={view.emptyTitle} description={view.emptyDescription} />
        ) : (
          <div className="grid gap-3">
            {view.items.slice(0, 5).map((alert) => (
              <div className={`${dashboardDisplayClass} rounded-md border border-border border-l-4 bg-background p-3 ${alertSeverityClasses(alert.severity)}`} key={`${alert.type}-${alert.title}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{alert.type}</span>
                  <span className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">{alert.severityLabel}</span>
                  {alert.value ? <span className="rounded-md border border-border px-2 py-0.5 text-xs font-semibold">{alert.value}</span> : null}
                </div>
                <div className="mt-2 font-semibold">{alert.title}</div>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{alert.message}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <DetailDrawer content={content} copy={view.copy} onClose={() => setOpen(false)} />
    </>
  );
}

function alertSeverityClasses(severity: DashboardAlert["severity"]) {
  if (severity === "critical") return "border-l-destructive";
  if (severity === "warning") return "border-l-primary";
  return "border-l-muted-foreground";
}

export function DashboardAlertsClient({
  alerts,
  dataStatus,
  initialLocale,
}: {
  alerts: DashboardAlert[];
  dataStatus?: DashboardSnapshot["dataStatus"];
  initialLocale?: string | null;
}) {
  return (
    <AppLocaleProvider initialLocale={initialLocale}>
      <ImportantAlertsCard alerts={alerts} dataStatus={dataStatus} />
    </AppLocaleProvider>
  );
}

function ImportantAlertsFallbackCard() {
  const locale = useAppLocale();
  const copy = getDashboardCopy(locale);
  return (
    <article className={`${dashboardDisplayClass} min-w-0 rounded-lg border border-border bg-card p-5`}>
      <h2 className="text-xl font-semibold">{copy.importantAlerts}</h2>
      <div className="mt-5 grid gap-3">
        <div className="h-20 rounded-md border border-border bg-background" />
        <div className="h-20 rounded-md border border-border bg-background" />
      </div>
    </article>
  );
}

export function DashboardAlertsFallback({ initialLocale }: { initialLocale?: string | null } = {}) {
  return (
    <AppLocaleProvider initialLocale={initialLocale}>
      <ImportantAlertsFallbackCard />
    </AppLocaleProvider>
  );
}
