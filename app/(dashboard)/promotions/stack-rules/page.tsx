import { t } from "@/lib/i18n/ui";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { formatLak } from "@/features/promotions/format";
const stackTypes = [
    "Product discount",
    "Bill discount",
    "Coupon code",
    "QR coupon",
    "Member discount",
    "Point redemption",
    "Buy X Get Y",
    "Free gift",
];
const priorityRules = [
    { order: 1, type: "Buy X Get Y", note: t("ui.apply.free.item.before.bill.level.discounts") },
    { order: 2, type: "Product discount", note: t("ui.apply.item.discount.and.validate.item.margin") },
    { order: 3, type: "Coupon code / QR coupon", note: t("ui.validate.usage.limits.and.member.only.rules") },
    { order: 4, type: "Member discount", note: t("ui.apply.after.promotion.and.coupon.discounts") },
    { order: 5, type: "Point redemption", note: t("ui.apply.last.and.never.below.zero.payable") },
];
const excludedCombinations = [
    { first: "Coupon code", second: "QR coupon", reason: t("ui.prevent.double.coupon.use.on.one.bill") },
    { first: "Free gift", second: "Buy X Get Y", reason: t("ui.avoid.duplicate.free.item.entitlement") },
    { first: "Point redemption", second: "High-risk coupon", reason: t("ui.require.owner.approval.near.minimum.margin") },
];
const maxByType = [
    { type: "Product discount", limit: t("ui.20.per.item") },
    { type: "Bill discount", limit: `${formatLak(50000)} LAK per bill` },
    { type: "Coupon code", limit: "1 coupon per bill" },
    { type: "Member discount", limit: "Membership rule maximum" },
    { type: "Point redemption", limit: `${formatLak(100000)} LAK per bill` },
];
export default function PromotionStackRulesPage() {
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          Back to promotions
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold">Promotion Stack Rules</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.configure.how.promotions.coupons.membership.")}</p>
            </div>
          </div>
          <button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground" type="button">
            Save Stack Rules
          </button>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <RuleCard title="Allow all stacking" value="Off" note={t("ui.use.explicit.priority.and.exclusions.for.saf")}/>
        <RuleCard title="Max discount per item" value="20%" note={t("ui.blocks.item.level.selling.below.minimum.marg")}/>
        <RuleCard title="Max discount per bill" value={`${formatLak(150000)} LAK`} note={t("ui.applies.after.coupons.membership.and.points")}/>
        <RuleCard title="Approval threshold" value={t("ui.8.margin")} note={t("ui.near.threshold.campaigns.require.owner.admin")}/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Supported Stacking Types</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stackTypes.map((type) => (<label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={type}>
                  <input className="size-5 accent-[var(--primary)]" type="checkbox" defaultChecked/>
                  <span>{type}</span>
                </label>))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Priority Order</h2>
            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Priority</th>
                    <th className="px-3 py-3">Promotion type</th>
                    <th className="px-3 py-3">Checkout rule</th>
                    <th className="px-3 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityRules.map((rule) => (<tr className="border-b border-border last:border-b-0" key={rule.type}>
                      <td className="px-3 py-3 font-semibold">{rule.order}</td>
                      <td className="px-3 py-3">{rule.type}</td>
                      <td className="px-3 py-3 text-muted-foreground">{rule.note}</td>
                      <td className="px-3 py-3">
                        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">Move</button>
                      </td>
                    </tr>))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Max Discount by Type</h2>
            <div className="mt-4 flex flex-col gap-3">
              {maxByType.map((row) => (<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm" key={row.type}>
                  <span className="font-medium">{row.type}</span>
                  <span className="text-muted-foreground">{row.limit}</span>
                </div>))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-md bg-warning/10 text-warning">
                <ShieldAlert aria-hidden="true"/>
              </div>
              <h2 className="text-lg font-semibold">Excluded Combinations</h2>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {excludedCombinations.map((row) => (<div className="rounded-md border border-border bg-background p-3 text-sm" key={`${row.first}-${row.second}`}>
                  <div className="font-semibold">{row.first} + {row.second}</div>
                  <div className="mt-1 text-muted-foreground">{row.reason}</div>
                </div>))}
            </div>
          </section>
        </aside>
      </section>
    </div>);
}
function RuleCard({ note, title, value }: {
    note: string;
    title: string;
    value: string;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{note}</p>
    </section>);
}
