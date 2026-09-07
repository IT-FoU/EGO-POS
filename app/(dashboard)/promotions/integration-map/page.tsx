"use client";

import Link from "next/link";
import { ArrowLeft, Boxes, FileText, Gift, Package, ShieldCheck, ShoppingCart, Users } from "lucide-react";
import { fillPromotionsCopy, tPromotions } from "@/lib/i18n/promotions-copy";
import { usePromotionsLocale } from "@/features/promotions/use-promotions-locale";

export default function PromotionIntegrationMapPage() {
  const locale = usePromotionsLocale();
  const t = (key: string) => tPromotions(key, locale);

  const connections = [
    { from: t("selectedProducts"), icon: Package, note: t("subtitle"), to: t("promotions") },
    { from: t("members"), icon: Users, note: t("memberOnly"), to: t("promotions") },
    { from: t("scope"), icon: Boxes, note: t("nearExpiry"), to: t("promotions") },
    { from: t("promotions"), icon: Gift, note: t("discountRules"), to: t("livePosPreview") },
    { from: t("promotions"), icon: FileText, note: t("usage"), to: t("analytics") },
    { from: t("promotions"), icon: ShieldCheck, note: t("approvalHistory"), to: t("approval") },
  ];

  const checkoutFlow = [
    t("selectedProducts"),
    t("discount"),
    t("activePromotions"),
    t("targeting"),
    t("stackRules"),
    t("couponRules"),
    t("profitProtection"),
    t("approvalRequired"),
    t("usage"),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {t("backToPromotions")}
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <ShoppingCart aria-hidden="true"/>
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">{t("integrationMap")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map(({ from, icon: Icon, note, to }) => (
          <article className="rounded-lg border border-border bg-card p-5" key={`${from}-${to}`}>
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                <Icon aria-hidden="true"/>
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{from}</div>
                <div className="text-sm text-muted-foreground">{fillPromotionsCopy(t("connectionTo"), { to })}</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("livePosPreview")}</h2>
          <div className="mt-5 grid gap-3">
            {checkoutFlow.map((step, index) => (
              <div className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={`${index}-${step}`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                <span className="min-w-0 break-words">{step}</span>
              </div>
            ))}
          </div>
        </div>
        <aside className="rounded-lg border border-danger/40 bg-danger/10 p-5">
          <h2 className="text-lg font-semibold text-danger">{t("profitProtection")}</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("negativeProfit")}</p>
          <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">{t("approvalRequiredBeforeActivation")}</div>
        </aside>
      </section>
    </div>
  );
}
