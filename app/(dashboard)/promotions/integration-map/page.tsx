import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowLeft, Boxes, FileText, Gift, Package, ShieldCheck, ShoppingCart, Users } from "lucide-react";
import { tPromotions } from "@/lib/i18n/promotions-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function PromotionIntegrationMapPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);

  const connections = [
    { from: tPromotions("selectedProducts", locale), icon: Package, note: tPromotions("subtitle", locale), to: tPromotions("promotions", locale) },
    { from: tPromotions("members", locale), icon: Users, note: tPromotions("memberOnly", locale), to: tPromotions("promotions", locale) },
    { from: tPromotions("scope", locale), icon: Boxes, note: tPromotions("nearExpiry", locale), to: tPromotions("promotions", locale) },
    { from: tPromotions("promotions", locale), icon: Gift, note: tPromotions("discountRules", locale), to: tPromotions("livePosPreview", locale) },
    { from: tPromotions("promotions", locale), icon: FileText, note: tPromotions("usage", locale), to: tPromotions("analytics", locale) },
    { from: tPromotions("promotions", locale), icon: ShieldCheck, note: tPromotions("approvalHistory", locale), to: tPromotions("approval", locale) },
  ];

  const checkoutFlow = [
    tPromotions("selectedProducts", locale),
    tPromotions("discount", locale),
    tPromotions("activePromotions", locale),
    tPromotions("targeting", locale),
    tPromotions("stackRules", locale),
    tPromotions("couponRules", locale),
    tPromotions("profitProtection", locale),
    tPromotions("approvalRequired", locale),
    tPromotions("usage", locale),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {tPromotions("backToPromotions", locale)}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <ShoppingCart aria-hidden="true"/>
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">{tPromotions("integrationMap", locale)}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tPromotions("subtitle", locale)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map(({ from, icon: Icon, note, to }) => (
          <article className="rounded-lg border border-border bg-card p-5" key={`${from}-${to}`}>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon aria-hidden="true"/>
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{from}</div>
                <div className="text-sm text-muted-foreground">to {to}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{tPromotions("livePosPreview", locale)}</h2>
          <div className="mt-5 grid gap-3">
            {checkoutFlow.map((step, index) => (
              <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={step}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-danger/40 bg-danger/10 p-5">
          <h2 className="text-lg font-semibold text-danger">{tPromotions("profitProtection", locale)}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{tPromotions("negativeProfit", locale)}</p>
          <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">{tPromotions("approvalRequiredBeforeActivation", locale)}</div>
        </aside>
      </section>
    </div>
  );
}
