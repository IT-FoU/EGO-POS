"use client";

import { t } from "@/lib/i18n/ui";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Gift, Package, Percent, ShieldAlert, SlidersHorizontal, Tags, } from "lucide-react";
import type { Category, Product } from "@/features/products/types";
import { PromotionStatusBadge } from "@/features/promotions/components/promotion-status-badge";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import type { Promotion, PromotionSimulation } from "@/features/promotions/types";
import { archivePromotionAction, updatePromotionAction } from "@/features/promotions/actions";
export function PromotionDetailClient({ categories, products, promotion, simulation, }: {
    categories: Category[];
    products: Product[];
    promotion: Promotion;
    simulation: PromotionSimulation;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const includedProducts = products.filter((product) => promotion.applicableProductIds.includes(product.id));
    const includedCategories = categories.filter((category) => promotion.applicableCategoryIds.includes(category.id));
    const estimatedCost = Math.round(simulation.cartSubtotalLak * 0.72);
    const estimatedProfit = simulation.finalTotalLak - estimatedCost;
    const profitMargin = simulation.finalTotalLak > 0 ? (estimatedProfit / simulation.finalTotalLak) * 100 : 0;
    const minimumMarginPercent = 8;
    const hasProfitRisk = estimatedProfit < 0 || profitMargin < minimumMarginPercent;
    return (<div className="flex flex-col gap-6">
      {message ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          Back to promotions
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Gift aria-hidden="true"/>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-semibold">{promotion.promotionName}</h1>
                <PromotionStatusBadge status={promotion.status}/>
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
            <div className="text-muted-foreground">Promotion type</div>
            <div className="mt-2 text-lg font-semibold">
              {formatPromotionType(promotion.type)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={CalendarDays} label="Date range" value={`${promotion.startDate} to ${promotion.endDate}`}/>
        <Metric icon={SlidersHorizontal} label="Priority" value={String(promotion.priority)}/>
        <Metric icon={Percent} label="Usage count" value={formatLak(promotion.usageCount)}/>
        <Metric icon={Gift} label="Discount given" value={`${formatLak(promotion.totalDiscountLak)} LAK`}/>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="flex flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Promotion information</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label="Active status" value={promotion.status}/>
              <Summary label="Type" value={formatPromotionType(promotion.type)}/>
              <Summary label="Start date" value={promotion.startDate}/>
              <Summary label="End date" value={promotion.endDate}/>
              <Summary label="Membership levels" value={promotion.membershipLevels.join(", ")}/>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Usage statistics</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label="Usage count" value={formatLak(promotion.usageCount)}/>
              <Summary label="Total sales" value={`${formatLak(promotion.totalSalesLak)} LAK`}/>
              <Summary label="Total discount" value={`${formatLak(promotion.totalDiscountLak)} LAK`}/>
              <Summary label="Average discount" value={`${formatLak(promotion.usageCount ? promotion.totalDiscountLak / promotion.usageCount : 0)} LAK`}/>
            </dl>
          </section>

          <form className="rounded-lg border border-border bg-card p-5" onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
                const result = await updatePromotionAction(promotion.id, {
                    priority: Number(formData.get("priority") ?? promotion.priority),
                    promotionName: String(formData.get("promotionName") ?? "").trim(),
                    status: String(formData.get("status") ?? promotion.status) as "active" | "inactive" | "scheduled" | "expired",
                });
                if (!result.ok) {
                    setMessage(result.error ?? t("ui.promotion.update.failed"));
                    return;
                }
                setMessage(t("ui.promotion.updated.successfully"));
                router.refresh();
            });
        }}>
            <h2 className="text-lg font-semibold">Edit promotion</h2>
            <div className="mt-5 flex flex-col gap-3">
              <input className="field-input" name="promotionName" defaultValue={promotion.promotionName} required/>
              <input className="field-input" name="priority" type="number" min="1" defaultValue={promotion.priority}/>
              <select className="field-input" name="status" defaultValue={promotion.status}>
                <option value="active">Active</option>
                <option value="scheduled">Scheduled</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
              <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={isPending || hasProfitRisk}>
                {isPending ? t("ui.saving") : "Save promotion"}
              </button>
              <button className="h-11 rounded-md border border-warning px-4 text-sm font-semibold disabled:opacity-50" type="button" disabled={isPending} onClick={() => {
            startTransition(async () => {
                const result = await archivePromotionAction(promotion.id);
                if (!result.ok) {
                    setMessage(result.error ?? t("ui.promotion.archive.failed"));
                    return;
                }
                setMessage(t("ui.promotion.archived.successfully"));
                router.refresh();
            });
        }}>
                Archive promotion
              </button>
            </div>
          </form>

          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className={hasProfitRisk ? "grid size-10 shrink-0 place-items-center rounded-md bg-danger/10 text-danger" : "grid size-10 shrink-0 place-items-center rounded-md bg-success/10 text-success"}>
                <ShieldAlert aria-hidden="true"/>
              </div>
              <div>
                <h2 className="text-lg font-semibold">Profit protection</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Minimum margin: {minimumMarginPercent}{t("ui.checkout.enforcement.is.prepared.for.server.")}</p>
              </div>
            </div>
            {hasProfitRisk ? (<div className="mt-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm font-medium text-danger">{t("ui.this.promotion.causes.negative.profit.please")}</div>) : null}
            <dl className="mt-5 grid gap-3 text-sm">
              <Summary label="Cost" value={`${formatLak(estimatedCost)} LAK`}/>
              <Summary label="Original price" value={`${formatLak(simulation.cartSubtotalLak)} LAK`}/>
              <Summary label="Discount amount" value={`-${formatLak(simulation.discountLak)} LAK`}/>
              <Summary label="Final price" value={`${formatLak(simulation.finalTotalLak)} LAK`}/>
              <Summary label="Estimated profit" value={`${formatLak(estimatedProfit)} LAK`}/>
              <Summary label="Profit margin" value={`${profitMargin.toFixed(1)}%`}/>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Approval history</h2>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              <div className="rounded-md border border-border bg-background p-3">
                Draft created by Owner
              </div>
              <div className="rounded-md border border-border bg-background p-3 text-muted-foreground">{t("ui.owner.admin.approval.required.for.high.risk.")}</div>
            </div>
          </section>
        </aside>

        <div className="flex flex-col gap-6">
          <section className="grid gap-6 lg:grid-cols-2">
            <IncludedList emptyText={t("ui.no.specific.products.selected")} icon={Package} items={includedProducts.map((product) => ({
            caption: product.sku,
            id: product.id,
            label: product.nameEn,
        }))} title="Products included"/>
            <IncludedList emptyText={t("ui.no.specific.categories.selected")} icon={Tags} items={includedCategories.map((category) => ({
            caption: `${category.productCount} products`,
            id: category.id,
            label: category.nameEn,
        }))} title="Categories included"/>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Promotion simulation</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.example.discount.calculation.using.mock.prod")}</p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Item</th>
                    <th className="px-3 py-3 text-right">Qty</th>
                    <th className="px-3 py-3 text-right">Original</th>
                    <th className="px-3 py-3 text-right">Discount</th>
                    <th className="px-3 py-3 text-right">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.lineResults.map((line) => (<tr className="border-b border-border last:border-b-0" key={line.label}>
                      <td className="px-3 py-3 font-semibold">{line.label}</td>
                      <td className="px-3 py-3 text-right">{line.quantity}</td>
                      <td className="px-3 py-3 text-right">{formatLak(line.originalTotalLak)} LAK</td>
                      <td className="px-3 py-3 text-right text-danger">-{formatLak(line.discountLak)} LAK</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatLak(line.finalTotalLak)} LAK</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <ResultCard label="Example subtotal" value={`${formatLak(simulation.cartSubtotalLak)} LAK`}/>
              <ResultCard label="Example discount" value={`-${formatLak(simulation.discountLak)} LAK`}/>
              <ResultCard label="Example cart result" value={`${formatLak(simulation.finalTotalLak)} LAK`}/>
            </div>
          </section>
        </div>
      </section>
    </div>);
}
function Metric({ icon: Icon, label, value, }: {
    icon: typeof Gift;
    label: string;
    value: string;
}) {
    return (<div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 text-lg font-semibold">{value}</div>
        </div>
        <div className="grid size-11 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </div>);
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold capitalize">{value}</dd>
    </div>);
}
function IncludedList({ emptyText, icon: Icon, items, title, }: {
    emptyText: string;
    icon: typeof Package;
    items: Array<{
        caption: string;
        id: string;
        label: string;
    }>;
    title: string;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Icon className="text-primary" aria-hidden="true"/>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {items.map((item) => (<div className="rounded-md border border-border bg-background p-3" key={item.id}>
            <div className="font-semibold">{item.label}</div>
            <div className="mt-1 text-xs text-muted-foreground">{item.caption}</div>
          </div>))}
        {items.length === 0 ? (<p className="text-sm text-muted-foreground">{emptyText}</p>) : null}
      </div>
    </section>);
}
function ResultCard({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
    </div>);
}
