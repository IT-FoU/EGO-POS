import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, BarChart3, Gift, TrendingDown, TrendingUp, Users } from "lucide-react";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import { getPromotionsSnapshot } from "@/features/promotions/promotion-service";
import { tPromotions } from "@/lib/i18n/promotions-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionAnalyticsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const { promotions } = await getPromotionsSnapshot();
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
          {tPromotions("backToPromotions", locale)}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary"><BarChart3 aria-hidden="true"/></div>
          <div>
            <h1 className="text-3xl font-semibold">{tPromotions("analytics", locale)}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tPromotions("subtitle", locale)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric icon={Gift} label={tPromotions("revenueGenerated", locale)} value={`${formatLak(totalSales)} LAK`}/>
        <Metric icon={TrendingDown} label={tPromotions("discountGiven", locale)} value={`${formatLak(totalDiscount)} LAK`}/>
        <Metric icon={BarChart3} label={tPromotions("totalUsage", locale)} value={formatLak(totalUsage)}/>
        <Metric icon={TrendingUp} label={tPromotions("revenueGenerated", locale)} value={`${formatLak(totalSales)} LAK`}/>
        <Metric icon={TrendingUp} label={tPromotions("estimatedProfit", locale)} value={`${formatLak(estimatedProfit)} LAK`}/>
        <Metric icon={Users} label={tPromotions("members", locale)} value="62% / 38%"/>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <AnalyticsTable locale={locale} promotions={topPromotions} title={tPromotions("activePromotions", locale)}/>
        <AnalyticsTable locale={locale} promotions={worstPromotions} title={tPromotions("expiredPromotions", locale)}/>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title={tPromotions("usage", locale)} value={tPromotions("subtitle", locale)}/>
        <Panel title={tPromotions("promotionType", locale)} value={promotions.map((promotion) => formatPromotionType(promotion.type, locale)).join(", ")}/>
        <Panel title={tPromotions("marginImpact", locale)} value={tPromotions("subtitle", locale)}/>
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

function AnalyticsTable({ locale, promotions, title }: {
  locale: ReturnType<typeof getServerLocale>;
  promotions: Awaited<ReturnType<typeof getPromotionsSnapshot>>["promotions"];
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">{tPromotions("promotions", locale)}</th>
              <th className="px-3 py-3">{tPromotions("type", locale)}</th>
              <th className="px-3 py-3 text-right">{tPromotions("usage", locale)}</th>
              <th className="px-3 py-3 text-right">{tPromotions("revenueGenerated", locale)}</th>
              <th className="px-3 py-3 text-right">{tPromotions("discountGiven", locale)}</th>
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
