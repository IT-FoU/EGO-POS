"use client";

import { t } from "@/lib/i18n/ui";
import { useState } from "react";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";
import type { DashboardSnapshot } from "@/features/dashboard/dashboard-service";
function formatLak(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}
export function CloseDayPanel({ closeDay }: {
    closeDay: DashboardSnapshot["closeDay"];
}) {
    const [isOpen, setIsOpen] = useState(false);
    const currentShift = closeDay.shiftSummaries.find((shift) => shift.status === "open");
    const shiftStatusLabel = currentShift ? "OPEN" : closeDay.shiftSummaries.length > 0 ? "CLOSED" : "NOT STARTED";
    return (<section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid min-w-0 gap-3 sm:grid-cols-3">
          <CompactMetric label="Status" value={shiftStatusLabel} tone={currentShift ? "success" : "default"}/>
          <CompactMetric label="Current Shift" value={currentShift ? "OPEN" : "-"}/>
          <CompactMetric label="Current Cashier" value={currentShift?.cashierId ?? "-"}/>
        </div>
        <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={() => setIsOpen((current) => !current)}>
          <Calculator className="size-4" aria-hidden="true"/>
          Close Day
          {isOpen ? <ChevronUp className="size-4" aria-hidden="true"/> : <ChevronDown className="size-4" aria-hidden="true"/>}
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{t("ui.closed.days.remain.editable.later.with.owner")}</p>

      {isOpen ? (<div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Total sales" value={`${formatLak(closeDay.totalSalesLak)} LAK`}/>
            <Metric label="Total cash sales" value={`${formatLak(closeDay.cashSalesLak)} LAK`}/>
            <Metric label="QR / transfer sales" value={`${formatLak(closeDay.qrTransferSalesLak)} LAK`}/>
            <Metric label="Total bills" value={String(closeDay.totalBills)}/>
            <Metric label="Total profit" value={`${formatLak(closeDay.profitLak)} LAK`}/>
            <Metric label="Cash expected" value={`${formatLak(closeDay.expectedCashLak)} LAK`}/>
            <Metric label="Cash counted" value={`${formatLak(closeDay.cashCountedLak)} LAK`}/>
            <Metric label="Difference over/short" tone={closeDay.differenceLak === 0 ? "default" : "danger"} value={`${formatLak(closeDay.differenceLak)} LAK`}/>
          </div>

          <div className="rounded-md border border-border">
            <div className="border-b border-border p-3 text-sm font-semibold">Shift summaries</div>
            <div className="max-h-72 overflow-auto p-3">
              {closeDay.shiftSummaries.length === 0 ? (<div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">{t("ui.no.shifts.have.been.closed.today")}</div>) : (<div className="flex flex-col gap-3">
                  {closeDay.shiftSummaries.map((shift) => (<div className="rounded-md border border-border bg-background p-3" key={`${shift.cashierId}-${shift.openedAt}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-semibold">{shift.status === "open" ? "Open shift" : "Closed shift"}</div>
                        <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {shift.cashierId}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <SummaryLine label="Opening cash" value={`${formatLak(shift.openingCashLak)} LAK`}/>
                        <SummaryLine label="Expected cash" value={`${formatLak(shift.expectedCashLak)} LAK`}/>
                        <SummaryLine label="Counted cash" value={`${formatLak(shift.countedCashLak)} LAK`}/>
                        <SummaryLine label="Difference" value={`${formatLak(shift.differenceLak)} LAK`}/>
                      </div>
                    </div>))}
                </div>)}
            </div>
          </div>
        </div>) : null}
    </section>);
}
function CompactMetric({ label, tone = "default", value, }: {
    label: string;
    tone?: "default" | "success";
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "success" ? "mt-1 font-semibold text-emerald-400" : "mt-1 truncate font-semibold"}>
        {value}
      </div>
    </div>);
}
function Metric({ label, tone = "default", value, }: {
    label: string;
    tone?: "danger" | "default";
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "mt-2 text-lg font-semibold text-danger" : "mt-2 text-lg font-semibold"}>
        {value}
      </div>
    </div>);
}
function SummaryLine({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>);
}
