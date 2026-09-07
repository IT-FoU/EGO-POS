"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Gift, Package, Percent, ShieldAlert, SlidersHorizontal, Tags, } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import {
  localizePromotionError,
  promotionStatusLabel,
  tPromotions,
} from "@/lib/i18n/promotions-copy";
import { usePromotionsLocale } from "@/features/promotions/use-promotions-locale";
import type { Category, Product } from "@/features/products/types";
import { PromotionStatusBadge } from "@/features/promotions/components/promotion-status-badge";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import type { Promotion, PromotionSimulation } from "@/features/promotions/types";
import { archivePromotionAction, updatePromotionAction } from "@/features/promotions/actions";

let activeLocale: SupportedLocale = "en";

function t(key: string) {
  return tPromotions(key, activeLocale);
}

export function PromotionDetailClient({
  categories,
  locale: localeProp,
  products,
  promotion,
  simulation,
}: {
  categories: Category[];
  locale?: SupportedLocale;
  products: Product[];
  promotion: Promotion;
  simulation: PromotionSimulation;
}) {
  const router = useRouter();
  const locale = usePromotionsLocale(localeProp);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  activeLocale = locale;

  const includedProducts = products.filter((product) => promotion.applicableProductIds.includes(product.id));
  const includedCategories = categories.filter((category) => promotion.applicableCategoryIds.includes(category.id));
  const estimatedCost = Math.round(simulation.cartSubtotalLak * 0.72);
  const estimatedProfit = simulation.finalTotalLak - estimatedCost;
  const profitMargin = simulation.finalTotalLak > 0 ? (estimatedProfit / simulation.finalTotalLak) * 100 : 0;
  const minimumMarginPercent = 8;
  const hasProfitRisk = estimatedProfit < 0 || profitMargin < minimumMarginPercent;

  return (
    <div className="flex flex-col gap-6">
      {message ? (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {t("backToPromotions")}
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Gift aria-hidden="true"/>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold">{promotion.promotionName}</h1>
                <PromotionStatusBadge locale={locale} status={promotion.status}/>
              </div>
              <p className="mt-2 font-mono text-sm text-muted-foreground">
                {promotion.promotionCode}
              </p>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                {promotion.description}
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-4 text-sm lg:w-80">
            <div className="text-muted-foreground">{t("promotionType")}</div>
            <div className="mt-2 text-lg font-semibold">
              {formatPromotionType(promotion.type, locale)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CalendarDays} label={t("dateRange")} value={`${promotion.startDate} to ${promotion.endDate}`}/>
        <Metric icon={SlidersHorizontal} label={t("priority")} value={String(promotion.priority)}/>
        <Metric icon={Percent} label={t("usage")} value={formatLak(promotion.usageCount)}/>
        <Metric icon={Gift} label={t("discountGiven")} value={`${formatLak(promotion.totalDiscountLak)} LAK`}/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("promotionManagement")}</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label={t("status")} value={promotionStatusLabel(promotion.status, locale)}/>
              <Summary label={t("type")} value={formatPromotionType(promotion.type, locale)}/>
              <Summary label={t("startDate")} value={promotion.startDate}/>
              <Summary label={t("endDate")} value={promotion.endDate}/>
              <Summary label={t("members")} value={promotion.membershipLevels.join(", ")}/>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("usage")}</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label={t("usage")} value={formatLak(promotion.usageCount)}/>
              <Summary label={t("revenueGenerated")} value={`${formatLak(promotion.totalSalesLak)} LAK`}/>
              <Summary label={t("discountGiven")} value={`${formatLak(promotion.totalDiscountLak)} LAK`}/>
              <Summary label={t("discount")} value={`${formatLak(promotion.usageCount ? promotion.totalDiscountLak / promotion.usageCount : 0)} LAK`}/>
            </dl>
          </section>

          <form
            className="rounded-lg border border-border bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(async () => {
                const result = await updatePromotionAction(promotion.id, {
                  priority: Number(formData.get("priority") ?? promotion.priority),
                  promotionName: String(formData.get("promotionName") ?? "").trim(),
                  status: String(formData.get("status") ?? promotion.status) as "active" | "inactive" | "scheduled" | "expired",
                });
                if (!result.ok) {
                  setMessage(localizePromotionError(result.error, locale));
                  return;
                }
                setMessage(t("updatedSuccessfully"));
                router.refresh();
              });
            }}
          >
            <h2 className="text-lg font-semibold">{t("editPromotion")}</h2>
            <div className="mt-5 flex flex-col gap-3">
              <input className="field-input" name="promotionName" defaultValue={promotion.promotionName} required/>
              <input className="field-input" name="priority" type="number" min="1" defaultValue={promotion.priority}/>
              <select className="field-input" name="status" defaultValue={promotion.status}>
                <option value="active">{t("active")}</option>
                <option value="scheduled">{t("scheduled")}</option>
                <option value="inactive">{t("inactive")}</option>
                <option value="expired">{t("expired")}</option>
              </select>
              <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={isPending || hasProfitRisk} type="submit">
                {isPending ? t("saving") : t("savePromotion")}
              </button>
              <button
                className="h-11 rounded-md border border-warning px-4 text-sm font-semibold disabled:opacity-50"
                disabled={isPending}
                type="button"
                onClick={() => {
                  startTransition(async () => {
                    const result = await archivePromotionAction(promotion.id);
                    if (!result.ok) {
                      setMessage(localizePromotionError(result.error, locale));
                      return;
                    }
                    setMessage(t("archivedSuccessfully"));
                    router.refresh();
                  });
                }}
              >
                {t("archivePromotion")}
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className={hasProfitRisk ? "grid size-10 shrink-0 place-items-center rounded-md bg-danger/10 text-danger" : "grid size-10 shrink-0 place-items-center rounded-md bg-success/10 text-success"}>
                <ShieldAlert aria-hidden="true"/>
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t("profitProtection")}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t("negativeProfit")}: {minimumMarginPercent}%
                </p>
              </div>
            </div>
            {hasProfitRisk ? (
              <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-danger">{t("negativeProfit")}</div>
            ) : null}
            <dl className="mt-5 grid gap-3 text-sm">
              <Summary label={t("discount")} value={`${formatLak(estimatedCost)} LAK`}/>
              <Summary label={t("discountValue")} value={`${formatLak(simulation.cartSubtotalLak)} LAK`}/>
              <Summary label={t("discountAmountLak")} value={`-${formatLak(simulation.discountLak)} LAK`}/>
              <Summary label={t("discount")} value={`${formatLak(simulation.finalTotalLak)} LAK`}/>
              <Summary label={t("estimatedProfit")} value={`${formatLak(estimatedProfit)} LAK`}/>
              <Summary label={t("marginImpact")} value={`${profitMargin.toFixed(1)}%`}/>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("approvalHistory")}</h2>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="rounded-md border border-border bg-background p-3">
                {t("draft")} - {t("createdBy")}
              </div>
              <div className="rounded-md border border-border bg-background p-3 text-muted-foreground">{t("approvalRequiredBeforeActivation")}</div>
            </div>
          </section>
        </aside>

        <div className="flex flex-col gap-6">
          <section className="grid gap-6 lg:grid-cols-2">
            <IncludedList
              emptyText={t("selectedProducts")}
              icon={Package}
              items={includedProducts.map((product) => ({
                caption: product.sku,
                id: product.id,
                label: product.nameEn,
              }))}
              title={t("productsIncluded")}
            />
            <IncludedList
              emptyText={t("selectedCategories")}
              icon={Tags}
              items={includedCategories.map((category) => ({
                caption: `${category.productCount} products`,
                id: category.id,
                label: category.nameEn,
              }))}
              title={t("categoriesIncluded")}
            />
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("promotionSimulation")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">{t("promotionName")}</th>
                    <th className="px-3 py-3 text-right">{t("usage")}</th>
                    <th className="px-3 py-3 text-right">{t("discount")}</th>
                    <th className="px-3 py-3 text-right">{t("discountGiven")}</th>
                    <th className="px-3 py-3 text-right">{t("summary")}</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.lineResults.map((line) => (
                    <tr className="border-b border-border last:border-b-0" key={line.label}>
                      <td className="px-3 py-3 font-semibold">{line.label}</td>
                      <td className="px-3 py-3 text-right">{line.quantity}</td>
                      <td className="px-3 py-3 text-right">{formatLak(line.originalTotalLak)} LAK</td>
                      <td className="px-3 py-3 text-right text-danger">-{formatLak(line.discountLak)} LAK</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatLak(line.finalTotalLak)} LAK</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <ResultCard label={t("summary")} value={`${formatLak(simulation.cartSubtotalLak)} LAK`}/>
              <ResultCard label={t("discountGiven")} value={`-${formatLak(simulation.discountLak)} LAK`}/>
              <ResultCard label={t("summary")} value={`${formatLak(simulation.finalTotalLak)} LAK`}/>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: {
  icon: typeof Gift;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-lg font-semibold">{value}</div>
        </div>
        <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </div>
  );
}

function Summary({ label, value }: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function IncludedList({ emptyText, icon: Icon, items, title }: {
  emptyText: string;
  icon: typeof Package;
  items: Array<{
    caption: string;
    id: string;
    label: string;
  }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Icon className="text-primary" aria-hidden="true"/>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (
          <div className="rounded-md border border-border bg-background p-3" key={item.id}>
            <div className="font-semibold">{item.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.caption}</div>
          </div>
        ))}
        {items.length === 0 ? (<p className="text-sm text-muted-foreground">{emptyText}</p>) : null}
      </div>
    </section>
  );
}

function ResultCard({ label, value }: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>
  );
}
