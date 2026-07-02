"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Ban, CircleDollarSign, ClipboardList, Lock, PackageCheck, Plus, Search, Send, Truck, WalletCards, } from "lucide-react";
import type { CurrencyCode, PurchaseOrder, PurchaseStatus, Supplier, SupplierPayable, } from "@/features/purchasing/types";
import { formatMoney, formatNumber } from "@/features/purchasing/format";
import { PurchaseStatusBadge, SupplierStatusBadge } from "@/features/purchasing/components/purchasing-status";
import {
  MANUAL_ACTION_TARGET,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_VALUES,
  manualActionsForStatus,
  isReceivableStatus,
  type ManualPurchaseAction,
} from "@/features/purchasing/purchase-status";
import { updatePurchaseStatusAction } from "@/features/purchasing/actions";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";
type PayableDisplayStatus = SupplierPayable["status"] | "overdue";
const creditStatusStyles: Record<PayableDisplayStatus, string> = {
    overdue: "border-danger bg-danger/20 text-danger",
    paid: "border-success/40 bg-success/10 text-success",
    partial: "border-warning/40 bg-warning/10 text-warning",
    unpaid: "border-danger/40 bg-danger/10 text-danger",
};
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function PurchasingPageClient({ purchaseOrders, suppliers, payables, }: {
    purchaseOrders: PurchaseOrder[];
    suppliers: Supplier[];
    payables: SupplierPayable[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "all">("all");
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [locale, setLocale] = useState<"en" | "th">("en");
    const [todayIso, setTodayIso] = useState("");
    const [profileMessage, setProfileMessage] = useState<string | null>(null);
    function runStatusAction(order: PurchaseOrder, action: ManualPurchaseAction) {
        const nextStatus = MANUAL_ACTION_TARGET[action];
        if (action === "cancel" && typeof window !== "undefined" && !window.confirm(`Cancel ${order.purchaseNo}?`)) {
            return;
        }
        setProfileMessage(null);
        setPendingId(order.id);
        startTransition(async () => {
            const result = await updatePurchaseStatusAction({ purchaseId: order.id, status: nextStatus });
            setPendingId(null);
            if (!result.ok) {
                setProfileMessage(result.error ?? "Failed to update purchase order status.");
                return;
            }
            setProfileMessage(`${order.purchaseNo} is now ${PURCHASE_STATUS_LABELS[nextStatus]}.`);
            router.refresh();
        });
    }
    useEffect(() => {
        const readLocale = () => {
            const storedLocale = readStringFromStorage(DemoStorageKeys.locale);
            setLocale(storedLocale === "th" ? "th" : "en");
        };
        readLocale();
        setTodayIso(new Date().toISOString().slice(0, 10));
        window.addEventListener("storage", readLocale);
        return () => window.removeEventListener("storage", readLocale);
    }, []);
    const filteredOrders = useMemo(() => {
        const normalized = query.toLowerCase();
        return purchaseOrders.filter((order) => {
            const matchesQuery = order.purchaseNo.toLowerCase().includes(normalized) ||
                order.supplierName.toLowerCase().includes(normalized);
            const matchesStatus = statusFilter === "all" || order.status === statusFilter;
            return matchesQuery && matchesStatus;
        });
    }, [purchaseOrders, query, statusFilter]);
    const supplierInsights = useMemo(() => {
        return suppliers.map((supplier) => {
            const supplierOrders = purchaseOrders.filter((order) => order.supplierId === supplier.id);
            const totalPurchasesLak = supplierOrders.reduce((total, order) => total + order.subtotal * order.exchangeRate, 0);
            const lastOrder = [...supplierOrders].sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate))[0];
            return {
                ...supplier,
                lastPurchaseDate: lastOrder?.purchaseDate,
                totalPurchasesLak,
            };
        });
    }, [purchaseOrders, suppliers]);
    const currencyOutstanding = useMemo(() => {
        return purchaseOrders.reduce<Record<CurrencyCode, number>>((totals, order) => {
            totals[order.currency] += order.balanceAmount;
            return totals;
        }, { LAK: 0, THB: 0, USD: 0 });
    }, [purchaseOrders]);
    const outstandingLak = payables.reduce((total, payable) => total + payable.balanceAmountLak, 0);
    const orderedCount = purchaseOrders.filter((order) => order.status === "ordered").length;
    const partialCount = purchaseOrders.filter((order) => order.status === "partial").length;
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Purchasing Management</p>
            <h1 className="mt-2 text-3xl font-semibold">
              {locale === "th" ? "Purchasing" : "Purchasing"}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.supplier.purchasing.workspace.for.purchase.o")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/purchasing/new">
              <Plus aria-hidden="true"/>
              New Purchase Order
            </Link>
            <Link className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" href="/purchasing/receiving">
              <PackageCheck aria-hidden="true"/>
              Receive Goods
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Truck} label="Active suppliers" value={String(suppliers.filter((supplier) => supplier.status === "active").length)}/>
        <SummaryCard icon={ClipboardList} label="Open purchase orders" value={String(orderedCount + partialCount)}/>
        <SummaryCard icon={PackageCheck} label="Partial receives" value={String(partialCount)}/>
        <SummaryCard icon={CircleDollarSign} label="Outstanding balance" value={formatMoney(outstandingLak, "LAK")}/>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <CurrencyCard currency="LAK" amount={currencyOutstanding.LAK}/>
        <CurrencyCard currency="THB" amount={currencyOutstanding.THB}/>
        <CurrencyCard currency="USD" amount={currencyOutstanding.USD}/>
      </section>

      <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90" href="/purchasing/new">
          <Plus aria-hidden="true"/>
          New Purchase Order
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/receiving">
          <PackageCheck aria-hidden="true"/>
          Receive Goods
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/payables">
          <CircleDollarSign aria-hidden="true"/>
          Pay Supplier
        </Link>
        <Link className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary" href="/purchasing/suppliers">
          <Truck aria-hidden="true"/>
          Supplier List
        </Link>
      </nav>

      {profileMessage ? (<div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          {profileMessage}
          <button className="ml-3 underline" type="button" onClick={() => setProfileMessage(null)}>
            Dismiss
          </button>
        </div>) : null}

      <section className="min-w-0 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Purchase orders</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.multi.currency.order.list.with.receiving.pro")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input className="field-input pl-10" placeholder="Search PO or supplier" value={query} onChange={(event) => setQuery(event.target.value)}/>
            </label>
            <select className="field-input sm:w-48" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as PurchaseStatus | "all")} aria-label="Filter by status">
              <option value="all">All statuses</option>
              {PURCHASE_STATUS_VALUES.map((status) => (<option key={status} value={status}>{PURCHASE_STATUS_LABELS[status]}</option>))}
            </select>
          </div>
        </div>
        <div className="mt-5 max-w-full overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">PO</th>
                <th className="px-3 py-3">Supplier</th>
                <th className="px-3 py-3">Warehouse</th>
                <th className="px-3 py-3">Currency</th>
                <th className="px-3 py-3">Subtotal</th>
                <th className="px-3 py-3">Receiving progress</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
            const progress = getReceivingProgress(order);
            return (<tr className="border-b border-border last:border-b-0" key={order.id}>
                    <td className="px-3 py-3 font-mono font-semibold">{order.purchaseNo}</td>
                    <td className="px-3 py-3">
                      <button className="text-left font-semibold text-primary underline-offset-4 hover:underline" type="button" onClick={() => setProfileMessage(`Supplier profile for ${order.supplierName} will be connected later.`)}>
                        {order.supplierName}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{order.warehouseName}</td>
                    <td className="px-3 py-3">
                      {order.currency} x {formatNumber(order.exchangeRate, 4)}
                    </td>
                    <td className="px-3 py-3 font-semibold">{formatMoney(order.subtotal, order.currency)}</td>
                    <td className="px-3 py-3">
                      <ReceivingProgress progress={progress}/>
                    </td>
                    <td className="px-3 py-3"><PurchaseStatusBadge status={order.status}/></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {manualActionsForStatus(order.status).map((action) => (
                          <StatusActionButton
                            key={action}
                            action={action}
                            disabled={isPending && pendingId === order.id}
                            onClick={() => runStatusAction(order, action)}
                          />
                        ))}
                        {isReceivableStatus(order.status) ? (
                          <Link className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-semibold text-primary transition hover:border-primary" href="/purchasing/receiving">
                            Receive <ArrowRight aria-hidden="true" className="size-4"/>
                          </Link>
                        ) : null}
                        {manualActionsForStatus(order.status).length === 0 && !isReceivableStatus(order.status) ? (
                          <span className="text-xs text-muted-foreground">--</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Supplier snapshot</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {supplierInsights.slice(0, 6).map((supplier) => (<div className="min-w-0 rounded-md border border-border p-4" key={supplier.id}>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="min-w-0">
                    <button className="block max-w-full truncate text-left font-semibold text-primary underline-offset-4 hover:underline" type="button" title={supplier.name} onClick={() => setProfileMessage(`Supplier profile for ${supplier.name} will be connected later.`)}>
                      {supplier.name}
                    </button>
                    <div className="mt-1 text-xs text-muted-foreground">{supplier.supplierCode}</div>
                  </div>
                  <div>
                    <SupplierStatusBadge status={supplier.status}/>
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <InsightRow label="Total Purchases" value={formatMoney(supplier.totalPurchasesLak, "LAK")}/>
                  <InsightRow label="Outstanding" value={formatMoney(supplier.outstandingBalanceLak, "LAK")}/>
                  <InsightRow label="Last PO" value={formatDisplayDate(supplier.lastPurchaseDate)}/>
                </dl>
              </div>))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Supplier credit</h2>
            <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
              <WalletCards aria-hidden="true"/>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payables.slice(0, 6).map((payable) => {
            const overdueDays = getOverdueDays(payable.dueDate, todayIso);
            const displayStatus: PayableDisplayStatus = payable.status !== "paid" && overdueDays > 0 ? "overdue" : payable.status;
            return (<div className="rounded-md border border-border p-3" key={payable.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-sm font-semibold">{payable.purchaseNo}</div>
                    <CreditStatusBadge status={displayStatus}/>
                  </div>
                  <button className="mt-2 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline" type="button" onClick={() => setProfileMessage(`Supplier profile for ${payable.supplierName} will be connected later.`)}>
                    {payable.supplierName}
                  </button>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Due Date</span>
                      <span className="font-medium">{formatDisplayDate(payable.dueDate)}</span>
                    </div>
                    {displayStatus === "overdue" ? (<div className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {overdueDays} days overdue
                      </div>) : null}
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Outstanding</span>
                      <span className="font-semibold">{formatMoney(payable.balanceAmountLak, "LAK")}</span>
                    </div>
                  </div>
                  <Link className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90" href="/purchasing/payables">
                    Pay Now
                  </Link>
                </div>);
        })}
          </div>
        </section>
      </section>
    </div>);
}
const statusActionConfig: Record<ManualPurchaseAction, { icon: typeof Send; label: string; className: string }> = {
    cancel: { icon: Ban, label: "Cancel", className: "border-danger/40 text-danger hover:border-danger" },
    close: { icon: Lock, label: "Close", className: "border-border text-foreground hover:border-primary" },
    send: { icon: Send, label: "Send", className: "border-primary/40 bg-primary/10 text-primary hover:border-primary" },
};
function StatusActionButton({ action, disabled, onClick, }: {
    action: ManualPurchaseAction;
    disabled: boolean;
    onClick: () => void;
}) {
    const config = statusActionConfig[action];
    const Icon = config.icon;
    return (<button className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition disabled:opacity-50", config.className)} type="button" disabled={disabled} onClick={onClick}>
      <Icon aria-hidden="true" className="size-4"/>
      {config.label}
    </button>);
}
function SummaryCard({ icon: Icon, label, value, }: {
    icon: typeof Truck;
    label: string;
    value: string;
}) {
    return (<div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </div>);
}
function CurrencyCard({ amount, currency }: {
    amount: number;
    currency: CurrencyCode;
}) {
    return (<div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">Outstanding {currency}</div>
      <div className="mt-2 break-words text-xl font-semibold">{formatMoney(amount, currency)}</div>
    </div>);
}
function ReceivingProgress({ progress, }: {
    progress: ReturnType<typeof getReceivingProgress>;
}) {
    return (<div className="min-w-48">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold">{t("ui.received")}{formatNumber(progress.received)} / {formatNumber(progress.ordered)} {progress.unitName}</span>
        <span className="font-semibold text-primary">{progress.percent}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }}/>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{t("ui.remaining")}{formatNumber(progress.remaining)} {progress.unitName}
      </div>
    </div>);
}
function InsightRow({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="min-w-0 rounded-md bg-background/60 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-base font-semibold">{value}</dd>
    </div>);
}
function CreditStatusBadge({ status }: {
    status: PayableDisplayStatus;
}) {
    return (<span className={cn("inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize", creditStatusStyles[status])}>
      {status}
    </span>);
}
function getReceivingProgress(order: PurchaseOrder) {
    const ordered = order.items.reduce((total, item) => total + item.quantity, 0);
    const received = order.items.reduce((total, item) => total + item.receivedQuantity, 0);
    const remaining = Math.max(ordered - received, 0);
    const percent = ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
    const firstUnit = order.items[0]?.unitName;
    const usesSingleUnit = firstUnit && order.items.every((item) => item.unitName === firstUnit);
    return {
        ordered,
        percent,
        received,
        remaining,
        unitName: usesSingleUnit ? firstUnit : "units",
    };
}
function getOverdueDays(dueDate: string, todayIso: string) {
    if (!dueDate || !todayIso)
        return 0;
    const due = new Date(`${dueDate.slice(0, 10)}T00:00:00.000Z`).getTime();
    const today = new Date(`${todayIso}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(due) || !Number.isFinite(today) || today <= due)
        return 0;
    return Math.floor((today - due) / 86400000);
}
function formatDisplayDate(value?: string) {
    if (!value)
        return "--";
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    if (!year || !month || !day)
        return value;
    return `${day} ${monthNames[month - 1]} ${year}`;
}
