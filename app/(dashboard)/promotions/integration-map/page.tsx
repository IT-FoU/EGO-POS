import { t } from "@/lib/i18n/ui";
import Link from "next/link";
import { ArrowLeft, Boxes, FileText, Gift, Package, ShieldCheck, ShoppingCart, Users } from "lucide-react";
const connections = [
    { from: "Products", icon: Package, note: t("ui.price.cost.category.brand.barcode.target.pro"), to: "Promotions" },
    { from: "Membership", icon: Users, note: t("ui.tier.eligibility.member.only.campaigns.membe"), to: "Promotions" },
    { from: "Inventory", icon: Boxes, note: t("ui.stock.quantity.expiry.date.warehouse.slow.mo"), to: "Promotions" },
    { from: "Promotions", icon: Gift, note: t("ui.discount.rules.coupons.stacking.approval.pro"), to: "POS Checkout" },
    { from: "Promotions", icon: FileText, note: t("ui.usage.revenue.discount.profit.margin.impact"), to: "Reports" },
    { from: "Promotions", icon: ShieldCheck, note: t("ui.created.edited.approved.used.warning.blocked"), to: "Audit Trail" },
];
const checkoutFlow = [
    "Scan product",
    "Load price and cost",
    "Load active promotions",
    t("ui.filter.by.time.branch.customer.product"),
    "Apply priority and stack rules",
    t("ui.validate.coupon.member.discount.points"),
    "Check max discount and minimum profit",
    t("ui.apply.block.or.request.approval"),
    "Save usage and audit logs",
];
export default function PromotionIntegrationMapPage() {
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          Back to promotions
        </Link>
        <div className="mt-5 flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <ShoppingCart aria-hidden="true"/>
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold">Promotion Integration Map</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.visual.system.map.for.connecting.promotions.")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {connections.map(({ from, icon: Icon, note, to }) => (<article className="rounded-lg border border-border bg-card p-5" key={`${from}-${to}`}>
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
          </article>))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Checkout Calculation Flow</h2>
          <div className="mt-5 grid gap-3">
            {checkoutFlow.map((step, index) => (<div className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={step}>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                <span>{step}</span>
              </div>))}
          </div>
        </div>
        <aside className="rounded-lg border border-danger/40 bg-danger/10 p-5">
          <h2 className="text-lg font-semibold text-danger">Important Rule</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("ui.promotion.must.never.allow.negative.profit.i")}</p>
          <div className="mt-4 rounded-md border border-border bg-card p-3 text-sm">{t("ui.owner.admin.approval.is.allowed.only.for.nea")}</div>
        </aside>
      </section>
    </div>);
}
