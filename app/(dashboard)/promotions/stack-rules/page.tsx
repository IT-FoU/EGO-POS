"use client";

import Link from "next/link";
import { ArrowLeft, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { formatLak } from "@/features/promotions/format";
import { usePromotionsLocale } from "@/features/promotions/use-promotions-locale";
import { tPromotions } from "@/lib/i18n/promotions-copy";

export default function PromotionStackRulesPage() {
  const locale = usePromotionsLocale();
  const t = (key: string) => tPromotions(key, locale);

  const stackTypes = [
    t("productDiscount"),
    t("billDiscount"),
    t("coupon"),
    t("qrCoupon"),
    t("memberDiscount"),
    t("buyXGetY"),
    t("freeGift"),
  ];

  const priorityRules = [
    { order: 1, type: t("buyXGetY"), note: t("stackPriorityHint") },
    { order: 2, type: t("productDiscount"), note: t("stackPriorityHint") },
    { order: 3, type: `${t("coupon")} / ${t("qrCoupon")}`, note: t("stackPriorityHint") },
    { order: 4, type: t("memberDiscount"), note: t("stackPriorityHint") },
    { order: 5, type: t("billDiscount"), note: t("stackPriorityHint") },
  ];

  const excludedCombinations = [
    { first: t("coupon"), second: t("qrCoupon"), reason: t("excludedComboHint") },
    { first: t("freeGift"), second: t("buyXGetY"), reason: t("excludedComboHint") },
    { first: t("memberDiscount"), second: t("coupon"), reason: t("approvalRequired") },
  ];

  const maxByType = [
    { type: t("productDiscount"), limit: t("maxDiscountPerItem") },
    { type: t("billDiscount"), limit: `${formatLak(50000)} LAK` },
    { type: t("coupon"), limit: t("limitPerBill") },
    { type: t("memberDiscount"), limit: t("memberScope") },
    { type: t("buyXGetY"), limit: `${formatLak(100000)} LAK` },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {t("backToPromotions")}
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold">{t("stackRules")}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
            </div>
          </div>
          <button className="h-11 shrink-0 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground" type="button">
            {t("save")} {t("stackRules")}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <RuleCard note={t("stackPriorityHint")} title={t("stackRules")} value={t("inactive")}/>
        <RuleCard note={t("negativeProfit")} title={t("maxDiscountPerItem")} value="20%"/>
        <RuleCard note={t("stackPriorityHint")} title={t("maxDiscountPerBill")} value={`${formatLak(150000)} LAK`}/>
        <RuleCard note={t("approvalRequired")} title={t("approval")} value="8%"/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("stackRules")}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stackTypes.map((type) => (
                <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={type}>
                  <input className="size-5 accent-[var(--primary)]" type="checkbox" defaultChecked/>
                  <span className="min-w-0 break-words">{type}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("priority")}</h2>
            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">{t("priority")}</th>
                    <th className="px-3 py-3">{t("promotionType")}</th>
                    <th className="px-3 py-3">{t("stackRules")}</th>
                    <th className="px-3 py-3">{t("action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityRules.map((rule) => (
                    <tr className="border-b border-border last:border-b-0" key={rule.order}>
                      <td className="px-3 py-3 font-semibold">{rule.order}</td>
                      <td className="px-3 py-3">{rule.type}</td>
                      <td className="px-3 py-3 text-muted-foreground">{rule.note}</td>
                      <td className="px-3 py-3">
                        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{t("edit")}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("maxDiscount")}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {maxByType.map((row) => (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm" key={row.type}>
                  <span className="min-w-0 break-words font-medium">{row.type}</span>
                  <span className="shrink-0 text-muted-foreground">{row.limit}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-md bg-warning/10 text-warning">
                <ShieldAlert aria-hidden="true"/>
              </div>
              <h2 className="min-w-0 text-lg font-semibold">{t("addExcludedCombination")}</h2>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {excludedCombinations.map((row) => (
                <div className="rounded-md border border-border bg-background p-3 text-sm" key={`${row.first}-${row.second}`}>
                  <div className="font-semibold">{row.first} + {row.second}</div>
                  <div className="mt-1 text-muted-foreground">{row.reason}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}

function RuleCard({ note, title, value }: {
  note: string;
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{note}</p>
    </section>
  );
}
