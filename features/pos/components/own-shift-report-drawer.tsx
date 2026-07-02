"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

import { formatLak } from "@/features/pos/format";
import type { OwnShiftReport } from "@/features/reports/own-shift-report-service";
import { cn } from "@/lib/utils";

type OwnShiftReportDrawerProps = {
  locale?: "en" | "th";
  onClose: () => void;
};

type Copy = ReturnType<typeof copy>;

function copy(locale: "en" | "th") {
  if (locale === "th") {
    return {
      accessDenied: "คุณไม่มีสิทธิ์ดูส่วนนี้",
      back: "กลับไปหน้า POS",
      card: "บัตร",
      cashDrawerSummary: "สรุปลิ้นชักเงินสด",
      cashIn: "เงินเข้า",
      cashOut: "เงินออก",
      cashReceived: "เงินสดรับ",
      cashier: "แคชเชียร์",
      closedAt: "ปิดกะเมื่อ",
      closedShift: "ปิดกะแล้ว",
      closingCash: "เงินสดปิดกะ",
      discounts: "ส่วนลด",
      expectedCash: "เงินสดที่ควรมี",
      noReport: "ไม่พบรายงานกะ",
      openedAt: "เปิดกะเมื่อ",
      openingCash: "เงินสดเปิดกะ",
      openShift: "กำลังเปิดกะ",
      ownShiftReport: "รายงานกะของฉัน",
      paymentBreakdown: "สรุปการชำระเงิน",
      promotionUsage: "การใช้โปรโมชัน",
      qrPayment: "QR Payment",
      recentBills: "บิลล่าสุดในกะของฉัน",
      refresh: "รีเฟรช",
      refundTotal: "ยอดคืนเงิน",
      refundVoidSummary: "สรุปคืนเงิน / ยกเลิกบิล",
      shiftSummary: "สรุปกะ",
      status: "สถานะ",
      totalBills: "จำนวนบิล",
      totalSales: "ยอดขายรวม",
      transfer: "โอนเงิน",
      variance: "ส่วนต่าง",
      voidTotal: "ยอดยกเลิกบิล",
    };
  }
  return {
    accessDenied: "You do not have permission to view this section.",
    back: "Back to POS",
    card: "Card",
    cashDrawerSummary: "Cash Drawer Summary",
    cashIn: "Cash In",
    cashOut: "Cash Out",
    cashReceived: "Cash Received",
    cashier: "Cashier",
    closedAt: "Closed At",
    closedShift: "Closed Shift",
    closingCash: "Closing Cash",
    discounts: "Discounts",
    expectedCash: "Expected Cash",
    noReport: "No shift report found.",
    openedAt: "Opened At",
    openingCash: "Opening Cash",
    openShift: "Open Shift",
    ownShiftReport: "Own Shift Report",
    paymentBreakdown: "Payment Breakdown",
    promotionUsage: "Promotion Usage",
    qrPayment: "QR Payment",
    recentBills: "Recent Bills in My Shift",
    refresh: "Refresh",
    refundTotal: "Refund Total",
    refundVoidSummary: "Refund / Void Summary",
    shiftSummary: "Shift Summary",
    status: "Status",
    totalBills: "Total Bills",
    totalSales: "Total Sales",
    transfer: "Transfer",
    variance: "Variance",
    voidTotal: "Void Total",
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
                <th className="px-3 py-2">Receipt</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Status</th>
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

export function OwnShiftReportDrawer({ locale = "en", onClose }: OwnShiftReportDrawerProps) {
  const [detectedLocale, setDetectedLocale] = useState<"en" | "th">(locale);
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
    setDetectedLocale(document.documentElement.dataset.locale === "th" ? "th" : locale);
    void loadReport();
  }, []);

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-[60] flex w-full justify-end">
      <aside className="pointer-events-auto flex h-full w-full max-w-[calc(100vw-4rem)] flex-col border-l border-border bg-background shadow-2xl xl:max-w-[calc(100vw-17rem)]">
        <header className="flex items-start justify-between gap-4 border-b border-border bg-card p-5">
          <div className="min-w-0">
            <button className="mb-2 text-sm font-semibold text-primary" type="button" onClick={onClose}>{c.back}</button>
            <h2 className="truncate text-xl font-semibold">{c.ownShiftReport}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="grid size-10 place-items-center rounded-md border border-border" type="button" onClick={loadReport} aria-label={c.refresh}>
              <RefreshCw className={cn("size-4", isLoading && "animate-spin")} aria-hidden="true" />
            </button>
            <button className="grid size-10 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
          ) : isLoading ? (
            <div className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : report ? (
            <ReportContent c={c} report={report} />
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{c.noReport}</div>
          )}
        </div>
      </aside>
    </div>
  );
}
