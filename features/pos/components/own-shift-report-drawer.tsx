"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { formatLak } from "@/features/pos/format";
import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import type { OwnShiftReport } from "@/features/reports/own-shift-report-service";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

type OwnShiftReportDrawerProps = {
  locale?: string;
  onBack?: () => void;
  onClose: () => void;
};

type Copy = ReturnType<typeof copy>;

function copy(locale?: string) {
  const t = (key: string) => tPos(key, locale);
  return {
    accessDenied: t("ui.shift.access.denied"),
    amount: t("ui.amount"),
    back: t("ui.back.to.pos"),
    card: t("ui.card"),
    cashDrawerSummary: t("ui.cash.drawer.summary"),
    cashIn: t("ui.cash.in"),
    cashOut: t("ui.cash.out"),
    cashReceived: t("ui.cash.received"),
    cashier: t("ui.cashier"),
    closedAt: t("ui.closed.at"),
    closedShift: tPos("ui.staff.closed", locale),
    closingCash: t("ui.closing.cash"),
    discounts: t("ui.discount"),
    expectedCash: t("ui.expected.cash"),
    loading: t("ui.loading"),
    noReport: t("ui.no.shift.report"),
    openedAt: t("ui.opened.at"),
    openingCash: t("ui.opening.cash.total"),
    openShift: t("ui.cash.session.opened").replace(/\.$/, ""),
    ownShiftReport: t("ui.own.shift.report"),
    payment: t("ui.payment"),
    paymentBreakdown: t("ui.payment.breakdown"),
    promotionUsage: t("ui.promotion.usage"),
    qrPayment: t("ui.qr.payment"),
    receipt: t("ui.receipt"),
    recentBills: t("ui.recent.bills.shift"),
    refresh: t("ui.refresh"),
    refundTotal: t("ui.refund.total"),
    refundVoidSummary: t("ui.refund.void.summary"),
    shiftSummary: t("ui.shift.summary"),
    status: t("ui.status"),
    time: t("ui.time"),
    totalBills: t("ui.total.bills"),
    totalSales: t("ui.total.sales"),
    transfer: t("ui.bank.transfer"),
    variance: t("ui.variance"),
    voidTotal: t("ui.void.total"),
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
      status === "open" || status === "paid"
        ? "bg-success/10 text-success"
        : status === "voided" || status === "refunded"
          ? "bg-warning/10 text-warning"
          : "bg-muted text-muted-foreground",
    )}>
      {status}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-black text-primary">{value}</div>
    </div>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ReportContent({ c, report }: { c: Copy; report: OwnShiftReport }) {
  return (
    <div className="grid gap-4">
      <Section title={c.shiftSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.status} value={report.status === "open" ? c.openShift : c.closedShift} />
          <Metric label={c.cashier} value={report.cashierName} />
          <Metric label={c.openedAt} value={formatDate(report.openedAt)} />
          <Metric label={c.closedAt} value={formatDate(report.closedAt)} />
          <Metric label={c.totalSales} value={`${formatLak(report.totalSalesLak)} ${report.currency}`} />
          <Metric label={c.totalBills} value={String(report.totalBills)} />
          <Metric label={c.discounts} value={`${formatLak(report.discountsLak)} ${report.currency}`} />
          <Metric label={c.promotionUsage} value={String(report.promotionUsageCount)} />
        </div>
      </Section>

      <Section title={c.paymentBreakdown}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.cashReceived} value={`${formatLak(report.paymentBreakdown.cashLak)} ${report.currency}`} />
          <Metric label={c.transfer} value={`${formatLak(report.paymentBreakdown.transferLak)} ${report.currency}`} />
          <Metric label={c.qrPayment} value={`${formatLak(report.paymentBreakdown.qrLak)} ${report.currency}`} />
          <Metric label={c.card} value={`${formatLak(report.paymentBreakdown.cardLak)} ${report.currency}`} />
        </div>
      </Section>

      <Section title={c.refundVoidSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.refundTotal} value={`${formatLak(report.refundTotalLak)} ${report.currency}`} />
          <Metric label={c.voidTotal} value={`${formatLak(report.voidTotalLak)} ${report.currency}`} />
        </div>
      </Section>

      <Section title={c.cashDrawerSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.openingCash} value={`${formatLak(report.cashDrawer.openingCashLak)} ${report.currency}`} />
          <Metric label={c.cashIn} value={`${formatLak(report.cashDrawer.cashInLak)} ${report.currency}`} />
          <Metric label={c.cashOut} value={`${formatLak(report.cashDrawer.cashOutLak)} ${report.currency}`} />
          <Metric label={c.expectedCash} value={`${formatLak(report.cashDrawer.expectedCashLak)} ${report.currency}`} />
          <Metric label={c.closingCash} value={report.cashDrawer.closingCashLak == null ? "-" : `${formatLak(report.cashDrawer.closingCashLak)} ${report.currency}`} />
          <Metric label={c.variance} value={report.cashDrawer.varianceLak == null ? "-" : `${formatLak(report.cashDrawer.varianceLak)} ${report.currency}`} />
        </div>
      </Section>

      <Section title={c.recentBills}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{c.receipt}</th>
                <th className="px-3 py-2">{c.time}</th>
                <th className="px-3 py-2">{c.amount}</th>
                <th className="px-3 py-2">{c.payment}</th>
                <th className="px-3 py-2">{c.status}</th>
              </tr>
            </thead>
            <tbody>
              {report.recentBills.length === 0 ? (
                <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>{c.noReport}</td></tr>
              ) : report.recentBills.map((bill) => (
                <tr className="border-t border-border" key={`${bill.saleNo}-${bill.time}`}>
                  <td className="px-3 py-2 font-semibold">{bill.receiptNo}</td>
                  <td className="px-3 py-2">{formatDate(bill.time)}</td>
                  <td className="px-3 py-2">{formatLak(bill.amountLak)} {report.currency}</td>
                  <td className="px-3 py-2">{bill.paymentMethod}</td>
                  <td className="px-3 py-2"><StatusBadge status={bill.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

export function OwnShiftReportModal({ locale, onBack, onClose }: OwnShiftReportDrawerProps) {
  const detectedLocale = useAppLocale(locale);
  const c = copy(detectedLocale);
  const [report, setReport] = useState<OwnShiftReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadReport() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pos/own-shift-report");
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setReport(null);
        setError(response.status === 403 ? c.accessDenied : payload.message ?? payload.error?.message ?? c.noReport);
        return;
      }
      setReport((payload.data ?? null) as OwnShiftReport | null);
    } catch (loadError) {
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : c.noReport);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

  return (
    <PosWorkspaceModal
      headerActions={(
        <button className="grid size-10 place-items-center rounded-md border border-border" type="button" onClick={loadReport} aria-label={c.refresh}>
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} aria-hidden="true" />
        </button>
      )}
      onBack={onBack}
      onClose={onClose}
      title={c.ownShiftReport}
    >
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      ) : isLoading ? (
        <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : report ? (
        <ReportContent c={c} report={report} />
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{c.noReport}</div>
      )}
    </PosWorkspaceModal>
  );
}
