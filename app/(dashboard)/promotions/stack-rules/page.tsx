import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { formatLak } from "@/features/promotions/format";
import { tPromotions } from "@/lib/i18n/promotions-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionStackRulesPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  const stackTypes = [
    tPromotions("productDiscount", locale),
    tPromotions("billDiscount", locale),
    tPromotions("coupon", locale),
    tPromotions("qrCoupon", locale),
    tPromotions("memberDiscount", locale),
    tPromotions("buyXGetY", locale),
    tPromotions("freeGift", locale),
  ];

  const priorityRules = [
    { order: 1, type: tPromotions("buyXGetY", locale), note: tPromotions("subtitle", locale) },
    { order: 2, type: tPromotions("productDiscount", locale), note: tPromotions("subtitle", locale) },
    { order: 3, type: `${tPromotions("coupon", locale)} / ${tPromotions("qrCoupon", locale)}`, note: tPromotions("subtitle", locale) },
    { order: 4, type: tPromotions("memberDiscount", locale), note: tPromotions("subtitle", locale) },
    { order: 5, type: tPromotions("buyXGetY", locale), note: tPromotions("subtitle", locale) },
  ];

  const excludedCombinations = [
    { first: tPromotions("coupon", locale), second: tPromotions("qrCoupon", locale), reason: tPromotions("subtitle", locale) },
    { first: tPromotions("freeGift", locale), second: tPromotions("buyXGetY", locale), reason: tPromotions("subtitle", locale) },
    { first: tPromotions("memberDiscount", locale), second: tPromotions("coupon", locale), reason: tPromotions("approvalRequired", locale) },
  ];

  const maxByType = [
    { type: tPromotions("productDiscount", locale), limit: tPromotions("maxDiscountPerItem", locale) },
    { type: tPromotions("billDiscount", locale), limit: `${formatLak(50000)} LAK` },
    { type: tPromotions("coupon", locale), limit: tPromotions("limitPerBill", locale) },
    { type: tPromotions("memberDiscount", locale), limit: tPromotions("memberScope", locale) },
    { type: tPromotions("buyXGetY", locale), limit: `${formatLak(100000)} LAK` },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {tPromotions("backToPromotions", locale)}
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold">{tPromotions("stackRules", locale)}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tPromotions("subtitle", locale)}</p>
            </div>
          </div>
          <button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground" type="button">
            {tPromotions("save", locale)} {tPromotions("stackRules", locale)}
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <RuleCard note={tPromotions("subtitle", locale)} title={tPromotions("stackRules", locale)} value={tPromotions("inactive", locale)}/>
        <RuleCard note={tPromotions("negativeProfit", locale)} title={tPromotions("maxDiscountPerItem", locale)} value="20%"/>
        <RuleCard note={tPromotions("subtitle", locale)} title={tPromotions("maxDiscountPerBill", locale)} value={`${formatLak(150000)} LAK`}/>
        <RuleCard note={tPromotions("approvalRequired", locale)} title={tPromotions("approval", locale)} value="8%"/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{tPromotions("stackRules", locale)}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stackTypes.map((type) => (
                <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={type}>
                  <input className="size-5 accent-[var(--primary)]" type="checkbox" defaultChecked/>
                  <span>{type}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{tPromotions("priority", locale)}</h2>
            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">{tPromotions("priority", locale)}</th>
                    <th className="px-3 py-3">{tPromotions("promotionType", locale)}</th>
                    <th className="px-3 py-3">{tPromotions("stackRules", locale)}</th>
                    <th className="px-3 py-3">{tPromotions("action", locale)}</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityRules.map((rule) => (
                    <tr className="border-b border-border last:border-b-0" key={rule.type}>
                      <td className="px-3 py-3 font-semibold">{rule.order}</td>
                      <td className="px-3 py-3">{rule.type}</td>
                      <td className="px-3 py-3 text-muted-foreground">{rule.note}</td>
                      <td className="px-3 py-3">
                        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{tPromotions("edit", locale)}</button>
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
            <h2 className="text-lg font-semibold">{tPromotions("maxDiscount", locale)}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {maxByType.map((row) => (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm" key={row.type}>
                  <span className="font-medium">{row.type}</span>
                  <span className="text-muted-foreground">{row.limit}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-md bg-warning/10 text-warning">
                <ShieldAlert aria-hidden="true"/>
              </div>
              <h2 className="text-lg font-semibold">{tPromotions("addExcludedCombination", locale)}</h2>
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
