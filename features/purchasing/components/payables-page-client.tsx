"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleDollarSign, Search } from "lucide-react";
import type { Supplier, SupplierPayable } from "@/features/purchasing/types";
import { formatMoney } from "@/features/purchasing/format";
import { PayableStatusBadge } from "@/features/purchasing/components/purchasing-status";
import { createSupplierPaymentAction } from "@/features/purchasing/actions";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { localizePurchasingError, tPurchasing } from "@/lib/i18n/purchasing-copy";

export function PayablesPageClient({
  locale: localeProp,
  payables,
  suppliers,
}: {
  locale?: SupportedLocale;
  payables: SupplierPayable[];
  suppliers: Supplier[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [paidDrafts, setPaidDrafts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const locale = useAppLocale(localeProp);
  const t = (key: string) => tPurchasing(key, locale);

  const filteredPayables = useMemo(() => {
    const normalized = query.toLowerCase();
    return payables.filter(
      (payable) =>
        payable.purchaseNo.toLowerCase().includes(normalized) ||
        payable.supplierName.toLowerCase().includes(normalized),
    );
  }, [payables, query]);

  const totalOutstanding = payables.reduce((total, payable) => total + payable.balanceAmountLak, 0);
  const totalPaid = payables.reduce((total, payable) => total + payable.paidAmountLak, 0);

  function savePayment(payable: SupplierPayable) {
    const amount = paidDrafts[payable.id] ?? 0;
    if (!payable.purchaseId || amount <= 0) {
      setMessage(t("enterPaymentAmount"));
      return;
    }
    startTransition(async () => {
      const result = await createSupplierPaymentAction({
        amount,
        note: `Payment for ${payable.purchaseNo}`,
        paymentMethod: "cash",
        purchaseId: payable.purchaseId!,
      });
      if (!result.ok) {
        setMessage(localizePurchasingError(result.error ?? t("supplierPaymentFailed"), locale));
        return;
      }
      setMessage(t("supplierPaymentSaved"));
      setPaidDrafts((current) => ({ ...current, [payable.id]: 0 }));
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/purchasing">
          <ArrowLeft aria-hidden="true" />
          {t("backToPurchasing")}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <CircleDollarSign aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{t("supplierCreditTitle")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("payables")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("payablesSubtitle")}</p>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label={t("suppliersTracked")} value={String(suppliers.length)} />
        <Metric label={t("paidAmountLabel")} value={formatMoney(totalPaid, "LAK")} />
        <Metric label={t("unpaidAmountLabel")} value={formatMoney(totalOutstanding, "LAK")} />
      </section>

      <section className="min-w-0 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">{t("supplierPayableList")}</h2>
          <label className="relative w-full md:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              aria-label={t("searchPayable")}
              className="field-input pl-10"
              placeholder={t("searchPayable")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 max-w-full overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">{t("supplier")}</th>
                <th className="px-3 py-3">{t("po")}</th>
                <th className="px-3 py-3">{t("totalLak")}</th>
                <th className="px-3 py-3">{t("paidLakCol")}</th>
                <th className="px-3 py-3">{t("unpaidLakCol")}</th>
                <th className="px-3 py-3">{t("dueDate")}</th>
                <th className="px-3 py-3">{t("status")}</th>
                <th className="px-3 py-3">{t("payment")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayables.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
                    {query ? t("noResults") : t("noPayables")}
                  </td>
                </tr>
              ) : (
                filteredPayables.map((payable) => {
                  const draft = paidDrafts[payable.id] ?? 0;
                  const remaining = Math.max(payable.balanceAmountLak - draft, 0);
                  return (
                    <tr className="border-b border-border last:border-b-0" key={payable.id}>
                      <td className="px-3 py-3 font-semibold">{payable.supplierName}</td>
                      <td className="px-3 py-3 font-mono">{payable.purchaseNo}</td>
                      <td className="px-3 py-3">{formatMoney(payable.totalAmountLak, "LAK")}</td>
                      <td className="px-3 py-3">{formatMoney(payable.paidAmountLak + draft, "LAK")}</td>
                      <td className="px-3 py-3 font-semibold">{formatMoney(remaining, "LAK")}</td>
                      <td className="px-3 py-3">{payable.dueDate}</td>
                      <td className="px-3 py-3">
                        <PayableStatusBadge locale={locale} status={payable.status} />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="field-input h-10"
                          max={payable.balanceAmountLak}
                          min="0"
                          type="number"
                          value={draft}
                          onChange={(event) =>
                            setPaidDrafts((current) => ({ ...current, [payable.id]: Number(event.target.value) }))
                          }
                        />
                        <button
                          className="mt-2 h-9 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          disabled={isPending || draft <= 0 || !payable.purchaseId}
                          type="button"
                          onClick={() => savePayment(payable)}
                        >
                          {isPending ? t("saving") : t("save")}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
    </div>
  );
}
