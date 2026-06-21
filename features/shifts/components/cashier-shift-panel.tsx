"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState } from "react";
import { Banknote, Clock3, LockKeyhole, LogOut, Play } from "lucide-react";
type ShiftStatus = "closed" | "open";
type ShiftSnapshot = {
    cashOutLak: number;
    countedCashLak: number;
    note: string;
    openedAt: Date | null;
    openingCashLak: number;
    reason: string;
    status: ShiftStatus;
};
function formatLak(value: number) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}
export function CashierShiftPanel({ cashSalesLak, onShiftStatusChange, qrTransferSalesLak, }: {
    cashSalesLak: number;
    onShiftStatusChange?: (isOpen: boolean) => void;
    qrTransferSalesLak: number;
}) {
    const [openingCash, setOpeningCash] = useState(0);
    const [openingNote, setOpeningNote] = useState("");
    const [countedCash, setCountedCash] = useState(0);
    const [cashOut, setCashOut] = useState(0);
    const [cashOutReason, setCashOutReason] = useState("");
    const [closingNote, setClosingNote] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [shift, setShift] = useState<ShiftSnapshot>({
        cashOutLak: 0,
        countedCashLak: 0,
        note: "",
        openedAt: null,
        openingCashLak: 0,
        reason: "",
        status: "closed",
    });
    const expectedCash = shift.status === "open" ? shift.openingCashLak + cashSalesLak - cashOut : 0;
    const difference = shift.status === "open" ? countedCash - expectedCash : shift.countedCashLak - (shift.openingCashLak + cashSalesLak - shift.cashOutLak);
    const workingHours = useMemo(() => {
        if (!shift.openedAt) {
            return "0.00";
        }
        return ((Date.now() - shift.openedAt.getTime()) / 36e5).toFixed(2);
    }, [shift.openedAt]);
    function startShift(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        const openedAt = new Date();
        setShift({
            cashOutLak: 0,
            countedCashLak: 0,
            note: openingNote,
            openedAt,
            openingCashLak: openingCash,
            reason: "",
            status: "open",
        });
        onShiftStatusChange?.(true);
    }
    function closeShift(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError(null);
        if (cashOut > 0 && cashOutReason.trim().length === 0) {
            setError(t("ui.cash.out.reason.is.required.when.cash.out.am"));
            return;
        }
        setShift((current) => ({
            ...current,
            cashOutLak: cashOut,
            countedCashLak: countedCash,
            note: closingNote,
            reason: cashOutReason,
            status: "closed",
        }));
        onShiftStatusChange?.(false);
    }
    return (<section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Shift</p>
          <h2 className="mt-1 text-xl font-semibold">Cashier shift control</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <StatusPill label="Status" value={shift.status === "open" ? "Open" : "Not started"}/>
          <StatusPill label="Working hours" value={workingHours}/>
          <StatusPill label="Expected cash" value={`${formatLak(expectedCash)} LAK`}/>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Banknote} label="Cash in drawer" value={`${formatLak(shift.openingCashLak)} LAK`}/>
        <Metric icon={Banknote} label="Cash sales" value={`${formatLak(cashSalesLak)} LAK`}/>
        <Metric icon={Banknote} label="QR / transfer sales" value={`${formatLak(qrTransferSalesLak)} LAK`}/>
        <Metric icon={LockKeyhole} label="Over / short" value={`${formatLak(difference)} LAK`}/>
      </div>

      {error ? <div className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div> : null}

      {shift.status !== "open" ? (<form className="mt-4 grid gap-3 lg:grid-cols-[220px_1fr_auto]" onSubmit={startShift}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Opening cash amount
            <input className="field-input" min="0" type="number" value={openingCash} onChange={(event) => setOpeningCash(Number(event.target.value))}/>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Note optional
            <input className="field-input" value={openingNote} onChange={(event) => setOpeningNote(event.target.value)}/>
          </label>
          <button className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">
            <Play className="size-4" aria-hidden="true"/>
            Start Shift
          </button>
        </form>) : (<form className="mt-4 grid gap-3 xl:grid-cols-[180px_180px_1fr_1fr_auto]" onSubmit={closeShift}>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Counted cash
            <input className="field-input" min="0" type="number" value={countedCash} onChange={(event) => setCountedCash(Number(event.target.value))}/>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Cash out amount
            <input className="field-input" min="0" type="number" value={cashOut} onChange={(event) => setCashOut(Number(event.target.value))}/>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Cash out reason
            <select className="field-input" value={cashOutReason} onChange={(event) => setCashOutReason(event.target.value)}>
              <option value="">Select reason</option>
              <option value="Store expense">Store expense</option>
              <option value="Bank deposit">Bank deposit</option>
              <option value="Cash correction">Cash correction</option>
              <option value="Change money">Change money</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Note optional
            <input className="field-input" value={closingNote} onChange={(event) => setClosingNote(event.target.value)}/>
          </label>
          <button className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="submit">
            <LogOut className="size-4" aria-hidden="true"/>
            Close Shift
          </button>
        </form>)}

      <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">{t("ui.ot.rules.will.use.owner.defined.settings.in.")}</div>
    </section>);
}
function StatusPill({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border px-3 py-2">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>);
}
function Metric({ icon: Icon, label, value, }: {
    icon: typeof Clock3;
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" aria-hidden="true"/>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>);
}
