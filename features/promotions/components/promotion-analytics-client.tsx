"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3, Gift, TrendingDown, TrendingUp, Users } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import type { Promotion } from "@/features/promotions/types";
import { usePromotionsLocale } from "@/features/promotions/use-promotions-locale";
import { tPromotions } from "@/lib/i18n/promotions-copy";

export function PromotionAnalyticsClient({
  locale: localeProp,
  promotions,
}: {
  locale?: SupportedLocale;
  promotions: Promotion[];
}) {
  const locale = usePromotionsLocale(localeProp);
  const t = (key: string) => tPromotions(key, locale);
  const totalSales = promotions.reduce((total, promotion) => total + promotion.totalSalesLak, 0);
  const totalDiscount = promotions.reduce((total, promotion) => total + promotion.totalDiscountLak, 0);
  const totalUsage = promotions.reduce((total, promotion) => total + promotion.usageCount, 0);
  const estimatedProfit = Math.max(totalSales * 0.18 - totalDiscount, 0);
  const topPromotions = [...promotions].sort((a, b) => b.totalSalesLak - a.totalSalesLak).slice(0, 10);
  const worstPromotions = [...promotions].sort((a, b) => (b.totalDiscountLak / Math.max(b.totalSalesLak, 1)) - (a.totalDiscountLak / Math.max(a.totalSalesLak, 1))).slice(0, 5);

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {t("backToPromotions")}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary"><BarChart3 aria-hidden="true"/></div>
          <div>
            <h1 className="text-3xl font-semibold">{t("analytics")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric icon={Gift} label={t("revenueGenerated")} value={`${formatLak(totalSales)} LAK`}/>
        <Metric icon={TrendingDown} label={t("discountGiven")} value={`${formatLak(totalDiscount)} LAK`}/>
        <Metric icon={BarChart3} label={t("totalUsage")} value={formatLak(totalUsage)}/>
        <Metric icon={TrendingUp} label={t("revenueGenerated")} value={`${formatLak(totalSales)} LAK`}/>
        <Metric icon={TrendingUp} label={t("estimatedProfit")} value={`${formatLak(estimatedProfit)} LAK`}/>
        <Metric icon={Users} label={t("members")} value="62% / 38%"/>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AnalyticsTable locale={locale} promotions={topPromotions} t={t} title={t("activePromotions")}/>
        <AnalyticsTable locale={locale} promotions={worstPromotions} t={t} title={t("expiredPromotions")}/>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title={t("usage")} value={t("subtitle")}/>
        <Panel title={t("promotionType")} value={promotions.map((promotion) => formatPromotionType(promotion.type, locale)).join(", ")}/>
        <Panel title={t("marginImpact")} value={t("subtitle")}/>
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
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 whitespace-nowrap text-lg font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon aria-hidden="true"/></div>
      </div>
    </div>
  );
}

function AnalyticsTable({ locale, promotions, t, title }: {
  locale: SupportedLocale;
  promotions: Promotion[];
  t: (key: string) => string;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">{t("promotions")}</th>
              <th className="px-3 py-3">{t("type")}</th>
              <th className="px-3 py-3 text-right">{t("usage")}</th>
              <th className="px-3 py-3 text-right">{t("revenueGenerated")}</th>
              <th className="px-3 py-3 text-right">{t("discountGiven")}</th>
            </tr>
          </thead>
          <tbody>
            {promotions.map((promotion) => (
              <tr className="border-b border-border last:border-b-0" key={promotion.id}>
                <td className="px-3 py-3 font-semibold">{promotion.promotionName}</td>
                <td className="px-3 py-3">{formatPromotionType(promotion.type, locale)}</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.usageCount)}</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.totalSalesLak)} LAK</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.totalDiscountLak)} LAK</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Panel({ title, value }: {
  title: string;
  value: string;
}) {
  return <section className="rounded-lg border border-border bg-card p-5"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{value}</p></section>;
}
