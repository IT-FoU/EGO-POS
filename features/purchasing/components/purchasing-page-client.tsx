"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  CircleDollarSign,
  ClipboardList,
  Lock,
  PackageCheck,
  Plus,
  Search,
  Send,
  Truck,
  WalletCards,
} from "lucide-react";
import type { CurrencyCode, PurchaseOrder, PurchaseStatus, Supplier, SupplierPayable } from "@/features/purchasing/types";
import { formatMoney, formatNumber } from "@/features/purchasing/format";
import { PurchaseStatusBadge, SupplierStatusBadge } from "@/features/purchasing/components/purchasing-status";
import {
  MANUAL_ACTION_TARGET,
  PURCHASE_STATUS_VALUES,
  isReceivableStatus,
  manualActionsForStatus,
  type ManualPurchaseAction,
} from "@/features/purchasing/purchase-status";
import { updatePurchaseStatusAction } from "@/features/purchasing/actions";
import { cn } from "@/lib/utils";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import {
  fillPurchasingCopy,
  localizePurchasingError,
  payableStatusLabel,
  purchaseActionLabel,
  purchaseStatusLabel,
  tPurchasing,
} from "@/lib/i18n/purchasing-copy";

type PayableDisplayStatus = SupplierPayable["status"] | "overdue";

const creditStatusStyles: Record<PayableDisplayStatus, string> = {
  overdue: "border-danger bg-danger/20 text-danger",
  paid: "border-success/40 bg-success/10 text-success",
  partial: "border-warning/40 bg-warning/10 text-warning",
  unpaid: "border-danger/40 bg-danger/10 text-danger",
};

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function PurchasingPageClient({
  locale: localeProp,
  payables,
  purchaseOrders,
  suppliers,
}: {
  locale?: SupportedLocale;
  payables: SupplierPayable[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PurchaseStatus | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const locale = useAppLocale(localeProp);
  const [todayIso, setTodayIso] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const t = (key: string) => tPurchasing(key, locale);

  function runStatusAction(order: PurchaseOrder, action: ManualPurchaseAction) {
    const nextStatus = MANUAL_ACTION_TARGET[action];
    if (
      action === "cancel" &&
      typeof window !== "undefined" &&
      !window.confirm(fillPurchasingCopy(t("confirmCancel"), { no: order.purchaseNo }))
    ) {
      return;
    }
    setProfileMessage(null);
    setPendingId(order.id);
    startTransition(async () => {
      const result = await updatePurchaseStatusAction({ purchaseId: order.id, status: nextStatus });
      setPendingId(null);
      if (!result.ok) {
        setProfileMessage(localizePurchasingError(result.error ?? t("failedToUpdateStatus"), locale));
        return;
      }
      setProfileMessage(
        fillPurchasingCopy(t("statusNow"), {
          no: order.purchaseNo,
          status: purchaseStatusLabel(nextStatus, locale),
        }),
      );
      router.refresh();
    });
  }

  useEffect(() => {
    setTodayIso(new Date().toISOString().slice(0, 10));
  }, []);

  const filteredOrders = useMemo(() => {
    const normalized = query.toLowerCase();
    return purchaseOrders.filter((order) => {
      const matchesQuery =
        order.purchaseNo.toLowerCase().includes(normalized) ||
        order.supplierName.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [purchaseOrders, query, statusFilter]);

  const supplierInsights = useMemo(() => {
    return suppliers.map((supplier) => {
      const supplierOrders = purchaseOrders.filter((order) => order.supplierId === supplier.id);
      const totalPurchasesLak = supplierOrders.reduce(
        (total, order) => total + order.subtotal * order.exchangeRate,
        0,
      );
      const lastOrder = [...supplierOrders].sort((left, right) =>
        right.purchaseDate.localeCompare(left.purchaseDate),
      )[0];
      return {
        ...supplier,
        lastPurchaseDate: lastOrder?.purchaseDate,
        totalPurchasesLak,
      };
    });
  }, [purchaseOrders, suppliers]);

  const currencyOutstanding = useMemo(() => {
    return purchaseOrders.reduce<Record<CurrencyCode, number>>(
      (totals, order) => {
        totals[order.currency] += order.balanceAmount;
        return totals;
      },
      { LAK: 0, THB: 0, USD: 0 },
    );
  }, [purchaseOrders]);

  const outstandingLak = payables.reduce((total, payable) => total + payable.balanceAmountLak, 0);
  const orderedCount = purchaseOrders.filter((order) => order.status === "ordered").length;
  const partialCount = purchaseOrders.filter((order) => order.status === "partial").length;

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{t("purchasingManagement")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("purchasing")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("purchasingSubtitle")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Truck}
          label={t("activeSuppliers")}
          value={String(suppliers.filter((supplier) => supplier.status === "active").length)}
        />
        <SummaryCard icon={ClipboardList} label={t("openPurchaseOrders")} value={String(orderedCount + partialCount)} />
        <SummaryCard icon={PackageCheck} label={t("partialReceives")} value={String(partialCount)} />
        <SummaryCard icon={CircleDollarSign} label={t("outstandingBalance")} value={formatMoney(outstandingLak, "LAK")} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <CurrencyCard amount={currencyOutstanding.LAK} currency="LAK" label={fillPurchasingCopy(t("outstandingCurrency"), { currency: "LAK" })} />
        <CurrencyCard amount={currencyOutstanding.THB} currency="THB" label={fillPurchasingCopy(t("outstandingCurrency"), { currency: "THB" })} />
        <CurrencyCard amount={currencyOutstanding.USD} currency="USD" label={fillPurchasingCopy(t("outstandingCurrency"), { currency: "USD" })} />
      </section>

      <nav className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Link
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
          href="/purchasing/new"
        >
          <Plus aria-hidden="true" />
          {t("newPurchaseOrder")}
        </Link>
        <Link
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary"
          href="/purchasing/receiving"
        >
          <PackageCheck aria-hidden="true" />
          {t("receiveGoods")}
        </Link>
        <Link
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary"
          href="/purchasing/payables"
        >
          <CircleDollarSign aria-hidden="true" />
          {t("paySupplier")}
        </Link>
        <Link
          className="inline-flex min-h-16 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:border-primary"
          href="/purchasing/suppliers"
        >
          <Truck aria-hidden="true" />
          {t("supplierList")}
        </Link>
      </nav>

      {profileMessage ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          {profileMessage}
          <button className="ml-3 underline" type="button" onClick={() => setProfileMessage(null)}>
            {t("dismiss")}
          </button>
        </div>
      ) : null}

      <section className="min-w-0 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t("purchaseOrders")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("purchaseOrdersHint")}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                aria-label={t("searchPoOrSupplier")}
                className="field-input pl-10"
                placeholder={t("searchPoOrSupplier")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label={t("filterByStatus")}
              className="field-input sm:w-48"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as PurchaseStatus | "all")}
            >
              <option value="all">{t("allStatuses")}</option>
              {PURCHASE_STATUS_VALUES.map((status) => (
                <option key={status} value={status}>
                  {purchaseStatusLabel(status, locale)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-5 max-w-full overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">{t("po")}</th>
                <th className="px-3 py-3">{t("supplier")}</th>
                <th className="px-3 py-3">{t("warehouse")}</th>
                <th className="px-3 py-3">{t("currency")}</th>
                <th className="px-3 py-3">{t("subtotal")}</th>
                <th className="px-3 py-3">{t("receivingProgress")}</th>
                <th className="px-3 py-3">{t("status")}</th>
                <th className="px-3 py-3 text-right">{t("action")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
                    {query || statusFilter !== "all" ? t("noResults") : t("noPurchaseOrders")}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const progress = getReceivingProgress(order, t("units"));
                  return (
                    <tr className="border-b border-border last:border-b-0" key={order.id}>
                      <td className="px-3 py-3 font-mono font-semibold">{order.purchaseNo}</td>
                      <td className="px-3 py-3">
                        <button
                          className="text-left font-semibold text-primary underline-offset-4 hover:underline"
                          type="button"
                          onClick={() =>
                            setProfileMessage(
                              fillPurchasingCopy(t("supplierProfileLater"), { name: order.supplierName }),
                            )
                          }
                        >
                          {order.supplierName}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{order.warehouseName}</td>
                      <td className="px-3 py-3">
                        {order.currency} x {formatNumber(order.exchangeRate, 4)}
                      </td>
                      <td className="px-3 py-3 font-semibold">{formatMoney(order.subtotal, order.currency)}</td>
                      <td className="px-3 py-3">
                        <ReceivingProgress locale={locale} progress={progress} />
                      </td>
                      <td className="px-3 py-3">
                        <PurchaseStatusBadge locale={locale} status={order.status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {manualActionsForStatus(order.status).map((action) => (
                            <StatusActionButton
                              action={action}
                              disabled={isPending && pendingId === order.id}
                              key={action}
                              locale={locale}
                              onClick={() => runStatusAction(order, action)}
                            />
                          ))}
                          {isReceivableStatus(order.status) ? (
                            <Link
                              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm font-semibold text-primary transition hover:border-primary"
                              href="/purchasing/receiving"
                            >
                              {t("receive")} <ArrowRight aria-hidden="true" className="size-4" />
                            </Link>
                          ) : null}
                          {manualActionsForStatus(order.status).length === 0 && !isReceivableStatus(order.status) ? (
                            <span className="text-xs text-muted-foreground">--</span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("supplierSnapshot")}</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {supplierInsights.slice(0, 6).map((supplier) => (
              <div className="min-w-0 rounded-md border border-border p-4" key={supplier.id}>
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="min-w-0">
                    <button
                      className="block max-w-full truncate text-left font-semibold text-primary underline-offset-4 hover:underline"
                      title={supplier.name}
                      type="button"
                      onClick={() =>
                        setProfileMessage(fillPurchasingCopy(t("supplierProfileLater"), { name: supplier.name }))
                      }
                    >
                      {supplier.name}
                    </button>
                    <div className="mt-1 text-xs text-muted-foreground">{supplier.supplierCode}</div>
                  </div>
                  <div>
                    <SupplierStatusBadge locale={locale} status={supplier.status} />
                  </div>
                </div>
                <dl className="mt-4 grid gap-3 text-sm">
                  <InsightRow label={t("totalPurchases")} value={formatMoney(supplier.totalPurchasesLak, "LAK")} />
                  <InsightRow label={t("outstanding")} value={formatMoney(supplier.outstandingBalanceLak, "LAK")} />
                  <InsightRow label={t("lastPo")} value={formatDisplayDate(supplier.lastPurchaseDate)} />
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">{t("supplierCredit")}</h2>
            <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
              <WalletCards aria-hidden="true" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payables.slice(0, 6).map((payable) => {
              const overdueDays = getOverdueDays(payable.dueDate, todayIso);
              const displayStatus: PayableDisplayStatus =
                payable.status !== "paid" && overdueDays > 0 ? "overdue" : payable.status;
              return (
                <div className="rounded-md border border-border p-3" key={payable.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-sm font-semibold">{payable.purchaseNo}</div>
                    <CreditStatusBadge locale={locale} status={displayStatus} />
                  </div>
                  <button
                    className="mt-2 text-left text-sm font-semibold text-primary underline-offset-4 hover:underline"
                    type="button"
                    onClick={() =>
                      setProfileMessage(fillPurchasingCopy(t("supplierProfileLater"), { name: payable.supplierName }))
                    }
                  >
                    {payable.supplierName}
                  </button>
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t("dueDate")}</span>
                      <span className="font-medium">{formatDisplayDate(payable.dueDate)}</span>
                    </div>
                    {displayStatus === "overdue" ? (
                      <div className="rounded-md border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                        {fillPurchasingCopy(t("daysOverdue"), { days: overdueDays })}
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t("outstanding")}</span>
                      <span className="font-semibold">{formatMoney(payable.balanceAmountLak, "LAK")}</span>
                    </div>
                  </div>
                  <Link
                    className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
                    href="/purchasing/payables"
                  >
                    {t("payNow")}
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </section>
    </div>
  );
}

function StatusActionButton({
  action,
  disabled,
  locale,
  onClick,
}: {
  action: ManualPurchaseAction;
  disabled: boolean;
  locale: SupportedLocale;
  onClick: () => void;
}) {
  const config = {
    cancel: { icon: Ban, className: "border-danger/40 text-danger hover:border-danger" },
    close: { icon: Lock, className: "border-border text-foreground hover:border-primary" },
    send: { icon: Send, className: "border-primary/40 bg-primary/10 text-primary hover:border-primary" },
  }[action];
  const Icon = config.icon;
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold transition disabled:opacity-50",
        config.className,
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4" />
      {purchaseActionLabel(action, locale)}
    </button>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function CurrencyCard({
  amount,
  currency,
  label,
}: {
  amount: number;
  currency: CurrencyCode;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-xl font-semibold">{formatMoney(amount, currency)}</div>
    </div>
  );
}

function ReceivingProgress({
  locale,
  progress,
}: {
  locale: SupportedLocale;
  progress: ReturnType<typeof getReceivingProgress>;
}) {
  return (
    <div className="min-w-48">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold">
          {tPurchasing("receivedPrefix", locale)}
          {formatNumber(progress.received)} / {formatNumber(progress.ordered)} {progress.unitName}
        </span>
        <span className="font-semibold text-primary">{progress.percent}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {tPurchasing("remainingPrefix", locale)}
        {formatNumber(progress.remaining)} {progress.unitName}
      </div>
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-background/60 p-3">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-base font-semibold">{value}</dd>
    </div>
  );
}

function CreditStatusBadge({
  locale,
  status,
}: {
  locale: SupportedLocale;
  status: PayableDisplayStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize",
        creditStatusStyles[status],
      )}
    >
      {payableStatusLabel(status, locale)}
    </span>
  );
}

function getReceivingProgress(order: PurchaseOrder, unitsLabel: string) {
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
    unitName: usesSingleUnit ? firstUnit : unitsLabel,
  };
}

function getOverdueDays(dueDate: string, todayIso: string) {
  if (!dueDate || !todayIso) return 0;
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00.000Z`).getTime();
  const today = new Date(`${todayIso}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(due) || !Number.isFinite(today) || today <= due) return 0;
  return Math.floor((today - due) / 86400000);
}

function formatDisplayDate(value?: string) {
  if (!value) return "--";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${day} ${monthNames[month - 1]} ${year}`;
}
