"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import {
  CASH_DENOMINATIONS_LAK,
  denominationLineSubtotal,
  sumParsedDenominationCounts,
} from "@/features/cash-sessions/denominations";
import type { CashSessionCountBreakdown, DenominationCountMap } from "@/features/cash-sessions/types";
import { formatLak } from "@/features/pos/format";
import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import { canViewBranchShiftReports } from "@/features/reports/own-shift-report-access";
import type {
  BranchShiftSessionRow,
  OwnShiftCapabilities,
  OwnShiftReport,
} from "@/features/reports/own-shift-report-service";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

type OwnShiftReportDrawerProps = {
  locale?: string;
  onBack?: () => void;
  onClose: () => void;
  /** Store role from POS policy — used for mode tabs (Cashier vs Manager/Owner). */
  storeRole?: string;
};

type ReportMode = "my" | "branch";

type ApiPayload = {
  capabilities?: OwnShiftCapabilities;
  mode?: string;
  report?: OwnShiftReport | null;
  sessions?: BranchShiftSessionRow[] | null;
};

type Copy = ReturnType<typeof copy>;

function copy(locale?: string) {
  const t = (key: string) => tPos(key, locale);
  return {
    accessDenied: t("ui.shift.access.denied"),
    amount: t("ui.amount"),
    backToList: t("ui.shift.back.to.list"),
    branchMode: t("ui.shift.mode.branch"),
    card: t("ui.card"),
    cashDrawerSummary: t("ui.cash.drawer.summary"),
    cashIn: t("ui.cash.in"),
    cashOut: t("ui.cash.out"),
    cashReceived: t("ui.cash.received"),
    cashRefunds: t("ui.shift.cash.refunds"),
    cashier: t("ui.cashier"),
    closedAt: t("ui.closed.at"),
    closedShift: tPos("ui.staff.closed", locale),
    closingCash: t("ui.closing.cash"),
    closingDenoms: t("ui.shift.denomination.closing"),
    denomQty: t("ui.shift.denomination.qty"),
    denomSubtotal: t("ui.shift.denomination.subtotal"),
    discounts: t("ui.discount"),
    expectedCash: t("ui.expected.cash"),
    loading: t("ui.loading"),
    myMode: t("ui.shift.mode.my"),
    noBreakdown: t("ui.shift.no.breakdown"),
    nonCash: t("ui.shift.non.cash"),
    noReport: t("ui.no.shift.report"),
    openDetail: t("ui.shift.open.detail"),
    openedAt: t("ui.opened.at"),
    openingCash: t("ui.opening.cash.total"),
    openingDenoms: t("ui.shift.denomination.opening"),
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
    salesCount: t("ui.shift.sales.count"),
    sessionList: t("ui.shift.session.list"),
    shiftSummary: t("ui.shift.summary"),
    status: t("ui.status"),
    time: t("ui.time"),
    totalBills: t("ui.total.bills"),
    totalSales: t("ui.total.sales"),
    transfer: t("ui.bank.transfer"),
    variance: t("ui.variance"),
    voidLimitation: t("ui.shift.void.limitation"),
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
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-[11px] font-semibold",
        status === "open" || status === "paid"
          ? "bg-success/10 text-success"
          : status === "voided" || status === "refunded"
            ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground",
      )}
    >
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

function DenominationTable({
  c,
  counts,
  emptyLabel,
  title,
}: {
  c: Copy;
  counts: DenominationCountMap | undefined;
  emptyLabel: string;
  title: string;
}) {
  const rows = CASH_DENOMINATIONS_LAK.map((denomination) => {
    const qty = Number(counts?.[String(denomination)] ?? 0);
    return {
      denomination,
      qty,
      subtotal: denominationLineSubtotal(denomination, qty),
    };
  }).filter((row) => row.qty > 0);

  const total = counts ? sumParsedDenominationCounts(counts) : 0;

  return (
    <Section title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">LAK</th>
                <th className="px-3 py-2">{c.denomQty}</th>
                <th className="px-3 py-2">{c.denomSubtotal}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-border" key={row.denomination}>
                  <td className="px-3 py-2 font-semibold">{formatLak(row.denomination)}</td>
                  <td className="px-3 py-2">{row.qty}</td>
                  <td className="px-3 py-2">{formatLak(row.subtotal)}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="px-3 py-2 font-bold" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2 font-bold">{formatLak(total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function BreakdownSections({
  breakdown,
  c,
}: {
  breakdown: CashSessionCountBreakdown | null;
  c: Copy;
}) {
  if (!breakdown || (!breakdown.opening && !breakdown.closing)) {
    return (
      <Section title={c.openingDenoms}>
        <p className="text-sm text-muted-foreground">{c.noBreakdown}</p>
      </Section>
    );
  }
  return (
    <>
      <DenominationTable c={c} counts={breakdown.opening} emptyLabel={c.noBreakdown} title={c.openingDenoms} />
      <DenominationTable c={c} counts={breakdown.closing} emptyLabel={c.noBreakdown} title={c.closingDenoms} />
    </>
  );
}

function ReportContent({ c, report }: { c: Copy; report: OwnShiftReport }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
        {report.voidCashLimitation || c.voidLimitation}
      </div>

      <Section title={c.shiftSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.status} value={report.status === "open" ? c.openShift : c.closedShift} />
          <Metric label={c.cashier} value={report.cashierName} />
          <Metric label={c.openedAt} value={formatDate(report.openedAt)} />
          <Metric label={c.closedAt} value={formatDate(report.closedAt)} />
          <Metric label={c.totalSales} value={`${formatLak(report.totalSalesLak)} ${report.currency}`} />
          <Metric label={c.salesCount} value={String(report.totalBills)} />
          <Metric label={c.discounts} value={`${formatLak(report.discountsLak)} ${report.currency}`} />
          <Metric label={c.promotionUsage} value={String(report.promotionUsageCount)} />
        </div>
      </Section>

      <Section title={c.paymentBreakdown}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.cashReceived} value={`${formatLak(report.paymentBreakdown.cashLak)} ${report.currency}`} />
          <Metric label={c.nonCash} value={`${formatLak(report.paymentBreakdown.nonCashLak)} ${report.currency}`} />
          <Metric label={c.transfer} value={`${formatLak(report.paymentBreakdown.transferLak)} ${report.currency}`} />
          <Metric label={c.qrPayment} value={`${formatLak(report.paymentBreakdown.qrLak)} ${report.currency}`} />
          <Metric label={c.card} value={`${formatLak(report.paymentBreakdown.cardLak)} ${report.currency}`} />
        </div>
      </Section>

      <Section title={c.refundVoidSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.refundTotal} value={`${formatLak(report.refundTotalLak)} ${report.currency}`} />
          <Metric label={c.cashRefunds} value={`${formatLak(report.refundCashLak)} ${report.currency}`} />
          <Metric label={c.voidTotal} value={`${formatLak(report.voidTotalLak)} ${report.currency}`} />
        </div>
      </Section>

      <Section title={c.cashDrawerSummary}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={c.openingCash} value={`${formatLak(report.cashDrawer.openingCashLak)} ${report.currency}`} />
          <Metric label={c.cashIn} value={`${formatLak(report.cashDrawer.cashInLak)} ${report.currency}`} />
          <Metric label={c.cashOut} value={`${formatLak(report.cashDrawer.cashOutLak)} ${report.currency}`} />
          <Metric label={c.expectedCash} value={`${formatLak(report.cashDrawer.expectedCashLak)} ${report.currency}`} />
          <Metric
            label={c.closingCash}
            value={
              report.cashDrawer.closingCashLak == null
                ? "-"
                : `${formatLak(report.cashDrawer.closingCashLak)} ${report.currency}`
            }
          />
          <Metric
            label={c.variance}
            value={
              report.cashDrawer.varianceLak == null
                ? "-"
                : `${formatLak(report.cashDrawer.varianceLak)} ${report.currency}`
            }
          />
        </div>
      </Section>

      <BreakdownSections breakdown={report.cashDrawer.countBreakdown} c={c} />

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
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                    {c.noReport}
                  </td>
                </tr>
              ) : (
                report.recentBills.map((bill) => (
                  <tr className="border-t border-border" key={`${bill.saleNo}-${bill.time}`}>
                    <td className="px-3 py-2 font-semibold">{bill.receiptNo}</td>
                    <td className="px-3 py-2">{formatDate(bill.time)}</td>
                    <td className="px-3 py-2">
                      {formatLak(bill.amountLak)} {report.currency}
                    </td>
                    <td className="px-3 py-2">{bill.paymentMethod}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={bill.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function SessionList({
  c,
  onOpen,
  sessions,
}: {
  c: Copy;
  onOpen: (sessionId: string) => void;
  sessions: BranchShiftSessionRow[];
}) {
  return (
    <Section title={c.sessionList}>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{c.noReport}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{c.cashier}</th>
                <th className="px-3 py-2">{c.openedAt}</th>
                <th className="px-3 py-2">{c.closedAt}</th>
                <th className="px-3 py-2">{c.status}</th>
                <th className="px-3 py-2">{c.openingCash}</th>
                <th className="px-3 py-2">{c.expectedCash}</th>
                <th className="px-3 py-2">{c.closingCash}</th>
                <th className="px-3 py-2">{c.variance}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((row) => (
                <tr className="border-t border-border" key={row.id}>
                  <td className="px-3 py-2 font-semibold">{row.cashierName}</td>
                  <td className="px-3 py-2">{formatDate(row.openedAt)}</td>
                  <td className="px-3 py-2">{formatDate(row.closedAt)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2">{formatLak(row.openingCashLak)}</td>
                  <td className="px-3 py-2">
                    {row.expectedCashLak == null ? "-" : formatLak(row.expectedCashLak)}
                  </td>
                  <td className="px-3 py-2">
                    {row.closingCashLak == null ? "-" : formatLak(row.closingCashLak)}
                  </td>
                  <td className="px-3 py-2">
                    {row.varianceLak == null ? "-" : formatLak(row.varianceLak)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      className="h-9 rounded-md border border-border px-3 text-xs font-semibold"
                      type="button"
                      onClick={() => onOpen(row.id)}
                    >
                      {c.openDetail}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function OwnShiftReportModal({ locale, onBack, onClose, storeRole }: OwnShiftReportDrawerProps) {
  const detectedLocale = useAppLocale(locale);
  const c = copy(detectedLocale);
  const showBranchMode = canViewBranchShiftReports(storeRole);

  const [mode, setMode] = useState<ReportMode>("my");
  const [report, setReport] = useState<OwnShiftReport | null>(null);
  const [sessions, setSessions] = useState<BranchShiftSessionRow[]>([]);
  const [detailShiftId, setDetailShiftId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function load(nextMode: ReportMode = mode, shiftId?: string | null) {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (shiftId) {
        params.set("shiftId", shiftId);
      } else {
        params.set("mode", nextMode);
      }
      const response = await fetch(`/api/pos/own-shift-report?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        setReport(null);
        setSessions([]);
        setError(response.status === 403 ? c.accessDenied : payload.message ?? payload.error?.message ?? c.noReport);
        return;
      }

      const data = (payload.data ?? {}) as ApiPayload;
      // Backward-compat: older responses may return the report object directly as data.
      const legacyReport =
        data && typeof data === "object" && "shiftId" in data && "cashDrawer" in data
          ? (data as unknown as OwnShiftReport)
          : null;

      setReport(data.report ?? legacyReport);
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (loadError) {
      setReport(null);
      setSessions([]);
      setError(loadError instanceof Error ? loadError.message : c.noReport);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load("my");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial MY SHIFT load only
  }, []);

  function selectMode(next: ReportMode) {
    if (!showBranchMode && next === "branch") return;
    setMode(next);
    setDetailShiftId(null);
    void load(next);
  }

  function openSessionDetail(sessionId: string) {
    setDetailShiftId(sessionId);
    void load(mode, sessionId);
  }

  function backToBranchList() {
    setDetailShiftId(null);
    setReport(null);
    void load("branch");
  }

  return (
    <PosWorkspaceModal
      headerActions={
        <button
          aria-label={c.refresh}
          className="grid size-10 place-items-center rounded-md border border-border"
          type="button"
          onClick={() => void load(mode, detailShiftId)}
        >
          <RefreshCw className={cn("size-4", isLoading && "animate-spin")} aria-hidden="true" />
        </button>
      }
      onBack={onBack}
      onClose={onClose}
      title={c.ownShiftReport}
    >
      {showBranchMode ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className={cn(
              "h-10 rounded-md border px-4 text-sm font-semibold",
              mode === "my" ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
            type="button"
            onClick={() => selectMode("my")}
          >
            {c.myMode}
          </button>
          <button
            className={cn(
              "h-10 rounded-md border px-4 text-sm font-semibold",
              mode === "branch" ? "border-primary bg-primary text-primary-foreground" : "border-border",
            )}
            type="button"
            onClick={() => selectMode("branch")}
          >
            {c.branchMode}
          </button>
          {detailShiftId ? (
            <button
              className="h-10 rounded-md border border-border px-4 text-sm font-semibold"
              type="button"
              onClick={backToBranchList}
            >
              {c.backToList}
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      ) : isLoading ? (
        <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">{c.loading}</div>
      ) : mode === "branch" && !detailShiftId ? (
        <SessionList c={c} sessions={sessions} onOpen={openSessionDetail} />
      ) : report ? (
        <ReportContent c={c} report={report} />
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {c.noReport}
        </div>
      )}
    </PosWorkspaceModal>
  );
}
