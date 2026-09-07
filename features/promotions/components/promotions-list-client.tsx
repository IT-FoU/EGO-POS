"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";
import {
  fillPromotionsCopy,
  localizePromotionError,
  promotionStatusLabel,
  tPromotions,
} from "@/lib/i18n/promotions-copy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BarChart3, CalendarDays, CheckCircle2, Copy, Download, Edit3, Eye, Gift, Import, Search, ShieldAlert, SlidersHorizontal, Trash2, XCircle, type LucideIcon, } from "lucide-react";
import { PromotionStatusBadge } from "@/features/promotions/components/promotion-status-badge";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import type { Promotion, PromotionStatus } from "@/features/promotions/types";
import { archivePromotionAction, createPromotionAction, updatePromotionAction } from "@/features/promotions/actions";
const statusOptions: Array<PromotionStatus | "all"> = ["all", "active", "scheduled", "inactive", "expired"];
const branchNames = ["Main Branch", "Branch Warehouse", "Mini Mart Counter"];
const createdByNames = ["Owner", "Manager", "Promotion Admin"];
const todayTime = new Date("2026-06-19T00:00:00").getTime();
type UtilityModalKind = "import" | "export" | "bulk" | "profit" | "approval" | "coupon" | "near_expiry" | "slow_moving" | "detail" | "duplicate" | "confirm" | "card";
type BaseUtilityModalKind = Exclude<UtilityModalKind, "detail" | "duplicate" | "confirm" | "card">;
type ConfirmAction = "activate" | "deactivate" | "archive" | "delete";
const baseModalKinds: BaseUtilityModalKind[] = ["import", "export", "bulk", "profit", "approval", "coupon", "near_expiry", "slow_moving"];
let activeLocale: SupportedLocale = "en";

function t(key: string) {
  return tPromotions(key, activeLocale);
}

export function PromotionsListClient({
  locale: localeProp,
  promotions,
}: {
  locale?: SupportedLocale;
  promotions: Promotion[];
}) {
    const router = useRouter();
    const [locale, setLocale] = useState<SupportedLocale>(localeProp ?? readClientLocale());

    useEffect(() => {
      if (localeProp) setLocale(localeProp);
    }, [localeProp]);

    useEffect(() => {
      function handleLocaleChange(event: Event) {
        const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
        if (isSupportedLocale(detail?.locale)) setLocale(detail.locale);
      }
      window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
      return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    }, []);

    activeLocale = locale;
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<PromotionStatus | "all">("all");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [modal, setModal] = useState<null | UtilityModalKind>(null);
    const [activePromotion, setActivePromotion] = useState<Promotion | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction>("activate");
    const [cardContext, setCardContext] = useState(t("promotions"));
    const [openMoreId, setOpenMoreId] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const filteredPromotions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return promotions.filter((promotion) => {
            const matchesQuery = normalizedQuery.length === 0 ||
                [promotion.promotionCode, promotion.promotionName, promotion.description, promotion.type].join(" ").toLowerCase().includes(normalizedQuery);
            const matchesStatus = status === "all" || promotion.status === status;
            return matchesQuery && matchesStatus;
        });
    }, [promotions, query, status]);
    const activeCount = promotions.filter((promotion) => promotion.status === "active").length;
    const scheduledCount = promotions.filter((promotion) => promotion.status === "scheduled").length;
    const expiredCount = promotions.filter((promotion) => promotion.status === "expired").length;
    const expiringSoonCount = promotions.filter((promotion) => daysUntil(promotion.endDate) <= 7 && daysUntil(promotion.endDate) >= 0).length;
    const totalDiscount = promotions.reduce((total, promotion) => total + promotion.totalDiscountLak, 0);
    const totalUsage = promotions.reduce((total, promotion) => total + promotion.usageCount, 0);
    const totalRevenue = promotions.reduce((total, promotion) => total + promotion.totalSalesLak, 0);
    function toggleSelected(id: string) {
        setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    }
    function toggleAllVisible() {
        const visibleIds = filteredPromotions.map((promotion) => promotion.id);
        setSelectedIds((current) => visibleIds.every((id) => current.includes(id)) ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
    }
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {modal && baseModalKinds.includes(modal as BaseUtilityModalKind) ? <UtilityModal kind={modal as BaseUtilityModalKind} promotions={promotions} onClose={() => setModal(null)}/> : null}
      {modal === "detail" && activePromotion ? <PromotionDetailModal promotion={activePromotion} onClose={() => setModal(null)}/> : null}
      {modal === "duplicate" && activePromotion ? <DuplicatePromotionModal isPending={isPending} promotion={activePromotion} onClose={() => setModal(null)} onSave={(code, name) => {
                startTransition(async () => {
                    const result = await createPromotionAction({
                        applicableCategoryIds: activePromotion.applicableCategoryIds,
                        applicableProductIds: activePromotion.applicableProductIds,
                        buyQuantity: activePromotion.buyQuantity,
                        comboPriceLak: activePromotion.comboPriceLak,
                        description: activePromotion.description,
                        discountAmountLak: activePromotion.discountAmountLak,
                        discountPercent: activePromotion.discountPercent,
                        endDate: activePromotion.endDate,
                        getQuantity: activePromotion.getQuantity,
                        priority: activePromotion.priority,
                        promotionCode: code,
                        promotionName: name,
                        promotionType: activePromotion.type,
                        startDate: activePromotion.startDate,
                        status: "scheduled",
                    });
                    if (!result.ok) {
                        setNotice(localizePromotionError(result.error, locale));
                        return;
                    }
                    setNotice(fillPromotionsCopy(t("duplicateCreated"), { code, name }));
                    setModal(null);
                    router.refresh();
                });
            }}/> : null}
      {modal === "confirm" && activePromotion ? <ConfirmPromotionModal action={confirmAction} isPending={isPending} promotion={activePromotion} onClose={() => setModal(null)} onConfirm={() => {
                startTransition(async () => {
                    const result = confirmAction === "delete" || confirmAction === "archive"
                        ? await archivePromotionAction(activePromotion.id)
                        : await updatePromotionAction(activePromotion.id, {
                            status: confirmAction === "activate" ? "active" : "inactive",
                            isActive: confirmAction === "activate",
                        });
                    if (!result.ok) {
                        setNotice(localizePromotionError(result.error, locale));
                        return;
                    }
                    setNotice(fillPromotionsCopy(confirmCompletedKey(confirmAction), { name: activePromotion.promotionName }));
                    setModal(null);
                    router.refresh();
                });
            }}/> : null}
      {modal === "card" ? <CardDetailModal title={cardContext} promotions={promotions} onClose={() => setModal(null)}/> : null}
      {notice ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{notice}</div>) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{t("promotionManagement")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("promotions")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <HeaderButton href="/promotions/new" icon={Gift} label={t("createPromotion")} primary/>
            <HeaderButton icon={Import} label={t("import")} onClick={() => setModal("import")}/>
            <HeaderButton icon={Download} label={t("export")} onClick={() => setModal("export")}/>
            <HeaderButton href="/promotions/calendar" icon={CalendarDays} label={t("promotionCalendar")}/>
            <HeaderButton href="/promotions/analytics" icon={BarChart3} label={t("analytics")}/>
            <HeaderButton href="/promotions/stack-rules" icon={SlidersHorizontal} label={t("stackRules")}/>
            <HeaderButton href="/promotions/integration-map" icon={BarChart3} label={t("integrationMap")}/>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Gift} label={t("activePromotions")} value={String(activeCount)} onClick={() => openCard(t("activePromotions"))}/>
        <Metric icon={CalendarDays} label={t("scheduledPromotions")} value={String(scheduledCount)} onClick={() => openCard(t("scheduledPromotions"))}/>
        <Metric icon={ShieldAlert} label={t("expiringSoon")} value={String(expiringSoonCount)} tone="warning" onClick={() => setModal("near_expiry")}/>
        <Metric icon={XCircle} label={t("expiredPromotions")} value={String(expiredCount)} tone="danger" onClick={() => openCard(t("expiredPromotions"))}/>
        <Metric icon={SlidersHorizontal} label={t("totalUsage")} value={formatLak(totalUsage)} onClick={() => openCard(t("totalUsage"))}/>
        <Metric icon={Eye} label={t("discountGiven")} value={`${formatLak(totalDiscount)} LAK`} onClick={() => openCard(t("discountGiven"))}/>
        <Metric icon={BarChart3} label={t("revenueGenerated")} value={`${formatLak(totalRevenue)} LAK`} onClick={() => openCard(t("revenueGenerated"))}/>
        <Metric icon={BarChart3} label={t("estimatedProfit")} value={`${formatLak(Math.max(totalRevenue * 0.18 - totalDiscount, 0))} LAK`} onClick={() => setModal("profit")}/>
        <Metric icon={ShieldAlert} label={t("marginImpact")} value="-4.8%" tone="warning" onClick={() => setModal("profit")}/>
        <Metric icon={ShieldAlert} label={t("riskWarnings")} value="2" tone="danger" onClick={() => setModal("profit")}/>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
              <input className="field-input pl-10" placeholder={t("searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)}/>
            </label>
            <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value as PromotionStatus | "all")} aria-label={t("filterByStatus")}>
              {statusOptions.map((option) => <option value={option} key={option}>{option === "all" ? t("allStatuses") : promotionStatusLabel(option, locale)}</option>)}
            </select>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold disabled:opacity-50" type="button" onClick={() => setModal("bulk")} disabled={selectedIds.length === 0}>{t("bulkActions")} ({selectedIds.length})
            </button>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setModal("profit")}>{t("profitProtection")}</button>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setModal("approval")}>{t("approvalQueue")}</button>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setModal("coupon")}>{t("coupons")}</button>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setModal("near_expiry")}>{t("nearExpiry")}</button>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setModal("slow_moving")}>{t("slowMoving")}</button>
          </div>
        </div>
        <section className="rounded-lg border border-warning/40 bg-warning/10 p-5">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true"/>
            <div>
              <h2 className="font-semibold text-warning">{t("profitProtection")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("negativeProfit")}</p>
            </div>
          </div>
        </section>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3"><input type="checkbox" checked={filteredPromotions.length > 0 && filteredPromotions.every((promotion) => selectedIds.includes(promotion.id))} onChange={toggleAllVisible} aria-label="Select visible promotions"/></th>
                <th className="px-3 py-3 font-semibold">{t("promotionCode")}</th>
                <th className="px-3 py-3 font-semibold">{t("promotionName")}</th>
                <th className="px-3 py-3 font-semibold">{t("type")}</th>
                <th className="px-3 py-3 font-semibold">{t("target")}</th>
                <th className="px-3 py-3 font-semibold">{t("branch")}</th>
                <th className="px-3 py-3 font-semibold">{t("dateRange")}</th>
                <th className="px-3 py-3 font-semibold">{t("status")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("usage")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("usage")}</th>
                <th className="px-3 py-3 font-semibold">{t("healthScore")}</th>
                <th className="px-3 py-3 font-semibold">{t("createdBy")}</th>
                <th className="px-3 py-3 font-semibold">{t("lastModified")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredPromotions.map((promotion, index) => (<tr className="border-b border-border last:border-b-0" key={promotion.id}>
                  <td className="px-3 py-4"><input type="checkbox" checked={selectedIds.includes(promotion.id)} onChange={() => toggleSelected(promotion.id)} aria-label={`Select ${promotion.promotionName}`}/></td>
                  <td className="px-3 py-4 font-mono text-xs">{promotion.promotionCode}</td>
                  <td className="px-3 py-4">
                    <div className="max-w-[240px] truncate font-semibold" title={promotion.promotionName}>{promotion.promotionName}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{promotion.description}</div>
                  </td>
                  <td className="px-3 py-4"><TypeBadge promotion={promotion} index={index}/></td>
                  <td className="px-3 py-4">{promotionTarget(promotion)}</td>
                  <td className="px-3 py-4">{branchNames[index % branchNames.length]}</td>
                  <td className="px-3 py-4">{promotion.startDate} → {promotion.endDate}</td>
                  <td className="px-3 py-4"><PromotionStatusBadge locale={locale} status={promotion.status}/></td>
                  <td className="px-3 py-4 text-right font-semibold">{formatLak(promotion.usageCount)}</td>
                  <td className="px-3 py-4 text-right">{usagePercent(promotion)}%</td>
                  <td className="px-3 py-4"><HealthScore promotion={promotion} index={index}/></td>
                  <td className="px-3 py-4">{createdByNames[index % createdByNames.length]}</td>
                  <td className="px-3 py-4">{promotion.endDate}</td>
                  <td className="px-3 py-4 text-right">
                    <div className="relative flex justify-end gap-1">
                      <ActionButton icon={Eye} label={t("view")} onClick={() => { setActivePromotion(promotion); setModal("detail"); }}/>
                      <ActionLink href={`/promotions/${promotion.id}/edit`} icon={Edit3} label={t("edit")}/>
                      <button className="grid size-9 place-items-center rounded-md border border-border text-xs font-semibold text-muted-foreground transition hover:text-foreground" type="button" onClick={() => setOpenMoreId(openMoreId === promotion.id ? null : promotion.id)} title={t("moreActions")}>{t("moreActions")}</button>
                      {openMoreId === promotion.id ? (<div className="absolute right-0 top-10 z-20 w-44 rounded-md border border-border bg-card p-1 text-left shadow-xl">
                          <MoreButton label={t("duplicate")} icon={Copy} onClick={() => { setActivePromotion(promotion); setModal("duplicate"); setOpenMoreId(null); }}/>
                          <MoreButton label={t("activate")} icon={CheckCircle2} onClick={() => openConfirm(promotion, "activate")}/>
                          <MoreButton label={t("deactivate")} icon={XCircle} onClick={() => openConfirm(promotion, "deactivate")}/>
                          <MoreButton label={t("archive")} icon={Archive} onClick={() => openConfirm(promotion, "archive")}/>
                          <MoreButton label={t("delete")} icon={Trash2} danger onClick={() => openConfirm(promotion, "delete")}/>
                        </div>) : null}
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {filteredPromotions.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t("noPromotionsMatch")}</div> : null}
      </section>
    </div>);
    function openCard(title: string) {
        setCardContext(title);
        setModal("card");
    }
    function openConfirm(promotion: Promotion, action: ConfirmAction) {
        setActivePromotion(promotion);
        setConfirmAction(action);
        setOpenMoreId(null);
        setModal("confirm");
    }
}
function UtilityModal({ kind, onClose, promotions }: {
    kind: BaseUtilityModalKind;
    onClose: () => void;
    promotions: Promotion[];
}) {
    const title = modalTitle(kind);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {kind === "profit" ? <ProfitProtectionPanel /> : null}
          {kind === "approval" ? <ApprovalPanel promotions={promotions}/> : null}
          {kind === "coupon" ? <CouponPanel /> : null}
          {kind === "near_expiry" ? <NearExpiryPanel /> : null}
          {kind === "slow_moving" ? <SlowMovingPanel /> : null}
          {["import", "export", "bulk"].includes(kind) ? <PlaceholderPanel title={title}>{t("subtitle")}</PlaceholderPanel> : null}
        </div>
      </div>
    </div>);
}
function ProfitProtectionPanel() {
    const rows = [
        { cost: 8500, discount: 2500, final: 9500, margin: "10.5%", price: 12000, product: "Pepsi Can", profit: 1000 },
        { cost: 9000, discount: 5000, final: 7000, margin: "-28.6%", price: 12000, product: "Dish Soap", profit: -2000 },
    ];
    return (<div className="flex flex-col gap-4">
      <PlaceholderPanel title={t("profitProtection")}>{t("negativeProfit")}</PlaceholderPanel>
      <DataTable headers={[t("selectedProducts"), t("discount"), t("discountValue"), t("discountGiven"), t("estimatedProfit"), t("marginImpact")]}>
        {rows.map((row) => (<tr className="border-b border-border last:border-b-0" key={row.product}>
            <td className="px-3 py-3 font-semibold">{row.product}</td>
            <td className="px-3 py-3 text-right">{formatLak(row.cost)} LAK</td>
            <td className="px-3 py-3 text-right">{formatLak(row.price)} LAK</td>
            <td className="px-3 py-3 text-right text-danger">-{formatLak(row.discount)} LAK</td>
            <td className="px-3 py-3 text-right">{formatLak(row.final)} LAK</td>
            <td className={row.profit < 0 ? "px-3 py-3 text-right font-semibold text-danger" : "px-3 py-3 text-right font-semibold text-success"}>{formatLak(row.profit)} LAK</td>
            <td className="px-3 py-3 text-right">{row.margin}</td>
          </tr>))}
      </DataTable>
      <PlaceholderPanel title={t("profitProtection")}>{t("discount")}</PlaceholderPanel>
    </div>);
}
function ApprovalPanel({ promotions }: {
    promotions: Promotion[];
}) {
    return (<DataTable headers={[t("promotions"), t("riskWarnings"), t("status"), t("approvalHistory"), t("action")]}>
      {promotions.slice(0, 5).map((promotion, index) => (<tr className="border-b border-border last:border-b-0" key={promotion.id}>
          <td className="px-3 py-3 font-semibold">{promotion.promotionName}</td>
          <td className="px-3 py-3">{index % 2 === 0 ? t("marginImpact") : t("stackRules")}</td>
          <td className="px-3 py-3">{index % 2 === 0 ? t("approval") : t("draft")}</td>
          <td className="px-3 py-3 text-muted-foreground">{t("approvalRequired")}</td>
          <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{t("review")}</button></td>
        </tr>))}
    </DataTable>);
}
function CouponPanel() {
    const rows = [
        { code: "SAVE10", kind: t("manual"), rule: t("limitPerBill"), use: t("limitPerCustomer"), member: t("inactive") },
        { code: "QR-GOLD-0626", kind: t("qrCoupon"), rule: t("usageLimit"), use: t("totalUsage"), member: t("active") },
        { code: "AUTO-EXP-15", kind: t("couponCode"), rule: t("limitPerBill"), use: t("totalUsage"), member: t("inactive") },
    ];
    return (<DataTable headers={[t("coupon"), t("type"), t("stackRules"), t("usageLimit"), t("memberOnly"), t("dateRange")]}>
      {rows.map((row) => (<tr className="border-b border-border last:border-b-0" key={row.code}>
          <td className="px-3 py-3 font-mono">{row.code}</td>
          <td className="px-3 py-3">{row.kind}</td>
          <td className="px-3 py-3">{row.rule}</td>
          <td className="px-3 py-3">{row.use}</td>
          <td className="px-3 py-3">{row.member}</td>
          <td className="px-3 py-3">19 Jun 2026 → 30 Jun 2026</td>
        </tr>))}
    </DataTable>);
}
function NearExpiryPanel() {
    const rows = [
        { action: t("createPromotion"), discount: "20%", expiry: "26 Jun 2026", product: "Yogurt Drink", profit: t("estimatedProfit"), stock: "48 Bottle" },
        { action: t("autoApply"), discount: "15%", expiry: "28 Jun 2026", product: "Milk 1L", profit: t("approvalRequired"), stock: "24 Carton" },
    ];
    return (<DataTable headers={[t("selectedProducts"), t("endDate"), t("scope"), t("discountPercent"), t("estimatedProfit"), t("action")]}>
      {rows.map((row) => (<tr className="border-b border-border last:border-b-0" key={row.product}>
          <td className="px-3 py-3 font-semibold">{row.product}</td>
          <td className="px-3 py-3">{row.expiry}</td>
          <td className="px-3 py-3">{row.stock}</td>
          <td className="px-3 py-3">{row.discount}</td>
          <td className="px-3 py-3">{row.profit}</td>
          <td className="px-3 py-3"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{row.action}</button></td>
        </tr>))}
    </DataTable>);
}
function SlowMovingPanel() {
    return (<DataTable headers={[t("selectedProducts"), t("scope"), t("scope"), t("usage"), t("discountPercent"), t("action")]}>
      {["Dishwashing Liquid", "Imported Cookies", "Canned Coffee"].map((product, index) => (<tr className="border-b border-border last:border-b-0" key={product}>
          <td className="px-3 py-3 font-semibold">{product}</td>
          <td className="px-3 py-3">{90 + index * 20} days</td>
          <td className="px-3 py-3">{24 + index * 8} units</td>
          <td className="px-3 py-3">{t("slowMoving")}</td>
          <td className="px-3 py-3">{10 + index * 5}%</td>
          <td className="px-3 py-3"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{t("createPromotion")}</button></td>
        </tr>))}
    </DataTable>);
}
function PromotionDetailModal({ onClose, promotion }: {
    onClose: () => void;
    promotion: Promotion;
}) {
    const auditEvents = ["Created", "Edited", "Duplicated", "Activated", "Used in sale", "Profit protection warning triggered"];
    const forecast = buildPromotionForecast(promotion);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{promotion.promotionName}</h2>
            <p className="mt-1 font-mono text-sm text-muted-foreground">{promotion.promotionCode}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="grid max-h-[70vh] gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <DataTable headers={[t("summary"), t("summary")]}>
              {[
            [t("type"), formatPromotionType(promotion.type, activeLocale)],
            [t("target"), promotionTarget(promotion)],
            [t("dateRange"), `${promotion.startDate} to ${promotion.endDate}`],
            [t("status"), promotionStatusLabel(promotion.status, activeLocale)],
            [t("usage"), formatLak(promotion.usageCount)],
            [t("discountGiven"), `${formatLak(promotion.totalDiscountLak)} LAK`],
            [t("revenueGenerated"), `${formatLak(promotion.totalSalesLak)} LAK`],
        ].map(([label, value]) => (<tr className="border-b border-border last:border-b-0" key={label}>
                  <td className="px-3 py-3 font-semibold">{label}</td>
                  <td className="px-3 py-3">{value}</td>
                </tr>))}
            </DataTable>
          </div>
          <aside className="rounded-md border border-border bg-background p-4">
            <h3 className="font-semibold">{t("approvalHistory")}</h3>
            <div className="mt-4 flex flex-col gap-3 text-sm">
              {auditEvents.map((event, index) => (<div className="rounded-md border border-border bg-card p-3" key={event}>
                  <div className="font-medium">{event}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{promotion.endDate} {String(9 + index).padStart(2, "0")}:15 - {t("createdBy")}</div>
                </div>))}
            </div>
            <div className="mt-5 rounded-md border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{t("promotionImpactForecast")}</h3>
                <span className={forecast.risk === "High" ? "rounded-full border border-danger/40 bg-danger/10 px-2 py-1 text-xs font-semibold text-danger" : forecast.risk === "Medium" ? "rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-semibold text-warning" : "rounded-full border border-success/40 bg-success/10 px-2 py-1 text-xs font-semibold text-success"}>{forecast.risk}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("members")}</dt><dd className="font-semibold">{formatLak(forecast.customers)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("usage")}</dt><dd className="font-semibold">{formatLak(forecast.usage)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("revenueGenerated")}</dt><dd className="font-semibold">{formatLak(forecast.revenue)} LAK</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("discountGiven")}</dt><dd className="font-semibold text-danger">-{formatLak(forecast.discount)} LAK</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("estimatedProfit")}</dt><dd className="font-semibold">{formatLak(forecast.profit)} LAK</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("scope")}</dt><dd className="font-semibold">{formatLak(forecast.stock)} units</dd></div>
              </dl>
            </div>
          </aside>
        </div>
      </div>
    </div>);
}
function DuplicatePromotionModal({ isPending, onClose, onSave, promotion }: {
    isPending: boolean;
    onClose: () => void;
    onSave: (code: string, name: string) => void;
    promotion: Promotion;
}) {
    const [name, setName] = useState(`${promotion.promotionName} Copy`);
    const [code, setCode] = useState(`${promotion.promotionCode}-COPY`);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-2xl">
        <h2 className="text-xl font-semibold">{t("duplicatePromotion")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-5 grid gap-4">
          <label className="text-sm font-medium">{t("newPromotionCode")}<input className="field-input mt-2 font-mono" value={code} onChange={(event) => setCode(event.target.value)}/></label>
          <label className="text-sm font-medium">{t("newPromotionName")}<input className="field-input mt-2" value={name} onChange={(event) => setName(event.target.value)}/></label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => onSave(code, name)} disabled={!code.trim() || !name.trim() || isPending}>{t("duplicate")}</button>
        </div>
      </div>
    </div>);
}
function ConfirmPromotionModal({ action, isPending, onClose, onConfirm, promotion }: {
    action: ConfirmAction;
    isPending: boolean;
    onClose: () => void;
    onConfirm: () => void;
    promotion: Promotion;
}) {
    const danger = action === "delete";
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl">
        <h2 className="text-xl font-semibold">{confirmActionLabel(action)} {t("promotions")}</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t("confirm")} {confirmActionLabel(action).toLowerCase()} - <span className="font-semibold text-foreground">{promotion.promotionName}</span>.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
          <button className={danger ? "h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50" : "h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"} type="button" onClick={onConfirm} disabled={isPending}>
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>);
}
function CardDetailModal({ onClose, promotions, title }: {
    onClose: () => void;
    promotions: Promotion[];
    title: string;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          <DataTable headers={[t("promotions"), t("status"), t("usage"), t("revenueGenerated"), t("discountGiven")]}>
            {promotions.map((promotion) => (<tr className="border-b border-border last:border-b-0" key={promotion.id}>
                <td className="px-3 py-3 font-semibold">{promotion.promotionName}</td>
                <td className="px-3 py-3">{promotionStatusLabel(promotion.status, activeLocale)}</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.usageCount)}</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.totalSalesLak)} LAK</td>
                <td className="px-3 py-3 text-right">{formatLak(promotion.totalDiscountLak)} LAK</td>
              </tr>))}
          </DataTable>
        </div>
      </div>
    </div>);
}
function PlaceholderPanel({ children, title }: {
    children: React.ReactNode;
    title: string;
}) {
    return <div className="rounded-md border border-dashed border-border bg-background p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p></div>;
}
function DataTable({ children, headers }: {
    children: React.ReactNode;
    headers: string[];
}) {
    return (<div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground"><tr>{headers.map((header) => <th className="px-3 py-3" key={header}>{header}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>);
}
function HeaderButton({ href, icon: Icon, label, onClick, primary = false }: {
    href?: string;
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    primary?: boolean;
}) {
    const className = primary
        ? "inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        : "inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary";
    if (href)
        return <Link className={className} href={href}><Icon className="size-4" aria-hidden="true"/>{label}</Link>;
    return <button className={className} type="button" onClick={onClick}><Icon className="size-4" aria-hidden="true"/>{label}</button>;
}
function Metric({ icon: Icon, label, onClick, tone = "default", value }: {
    icon: LucideIcon;
    label: string;
    onClick?: () => void;
    tone?: "default" | "warning" | "danger";
    value: string;
}) {
    const toneClass = tone === "danger" ? "bg-danger/10 text-danger" : tone === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary";
    const content = (<div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 whitespace-nowrap text-xl font-semibold">{value}</div>
        </div>
        <div className={`grid size-11 shrink-0 place-items-center rounded-md ${toneClass}`}><Icon aria-hidden="true"/></div>
      </div>);
    if (onClick) {
        return <button className="rounded-lg border border-border bg-card p-5 text-left transition hover:border-primary" type="button" onClick={onClick}>{content}</button>;
    }
    return <div className="rounded-lg border border-border bg-card p-5">{content}</div>;
}
function ActionLink({ href, icon: Icon, label }: {
    href: string;
    icon: LucideIcon;
    label: string;
}) {
    return <Link className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:text-foreground" href={href} title={label}><Icon className="size-4" aria-hidden="true"/></Link>;
}
function ActionButton({ icon: Icon, label, onClick }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:text-foreground" type="button" onClick={onClick} title={label}><Icon className="size-4" aria-hidden="true"/></button>;
}
function MoreButton({ danger = false, icon: Icon, label, onClick }: {
    danger?: boolean;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return (<button className={danger ? "flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-danger hover:bg-danger/10" : "flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-background"} type="button" onClick={onClick}>
      <Icon className="size-4" aria-hidden="true"/>
      {label}
    </button>);
}
function TypeBadge({ index, promotion }: {
    index: number;
    promotion: Promotion;
}) {
    const variants = [
        [t("percentageDiscount"), "bg-blue-500/10 text-blue-400 border-blue-500/30"],
        [t("fixedAmount"), "bg-green-500/10 text-green-400 border-green-500/30"],
        [t("buyXGetY"), "bg-orange-500/10 text-orange-400 border-orange-500/30"],
        [t("comboSet"), "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"],
        [t("billDiscount"), "bg-teal-500/10 text-teal-400 border-teal-500/30"],
        [t("freeGift"), "bg-pink-500/10 text-pink-400 border-pink-500/30"],
        [t("coupon"), "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"],
        [t("memberDiscount"), "bg-purple-500/10 text-purple-400 border-purple-500/30"],
        [t("happyHour"), "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"],
        [t("flashSale"), "bg-red-500/10 text-red-400 border-red-500/30"],
        [t("comboSet"), "bg-violet-500/10 text-violet-400 border-violet-500/30"],
        [t("percentageDiscount"), "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"],
    ];
    const fallbackLabel = formatPromotionType(promotion.type, activeLocale);
    const [label, className] = variants[index % variants.length] ?? [fallbackLabel, "bg-primary/10 text-primary border-primary/30"];
    return <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}
function HealthScore({ index, promotion }: {
    index: number;
    promotion: Promotion;
}) {
    const score = Math.max(42, 96 - index * 9 - Math.round(promotion.totalDiscountLak / Math.max(promotion.totalSalesLak, 1) * 100));
    const tone = score < 60 ? "text-danger bg-danger/10 border-danger/30" : score < 78 ? "text-warning bg-warning/10 border-warning/30" : "text-success bg-success/10 border-success/30";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{score}/100</span>;
}
function promotionTarget(promotion: Promotion) {
    if (promotion.applicableProductIds.length > 0)
        return `${promotion.applicableProductIds.length} products`;
    if (promotion.applicableCategoryIds.length > 0)
        return `${promotion.applicableCategoryIds.length} categories`;
    return "Whole bill";
}
function daysUntil(dateValue: string) {
    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime()))
        return 999;
    return Math.ceil((date.getTime() - todayTime) / 86400000);
}
function usagePercent(promotion: Promotion) {
    return Math.min(100, Math.round((promotion.usageCount / 100) * 100));
}
function confirmActionLabel(action: ConfirmAction) {
    const labels: Record<ConfirmAction, string> = {
        activate: t("activate"),
        archive: t("archive"),
        deactivate: t("deactivate"),
        delete: t("delete"),
    };
    return labels[action];
}

function confirmCompletedKey(action: ConfirmAction) {
    const keys: Record<ConfirmAction, string> = {
        activate: "activateCompleted",
        archive: "archiveCompleted",
        deactivate: "deactivateCompleted",
        delete: "deleteCompleted",
    };
    return t(keys[action]);
}

function modalTitle(kind: BaseUtilityModalKind) {
    const titles: Record<BaseUtilityModalKind, string> = {
        approval: t("approval"),
        bulk: t("bulkActions"),
        coupon: t("coupons"),
        export: t("export"),
        import: t("import"),
        near_expiry: t("nearExpiry"),
        profit: t("profitProtection"),
        slow_moving: t("slowMoving"),
    };
    return titles[kind];
}

function buildPromotionForecast(promotion: Promotion) {
    const discountRatio = promotion.totalSalesLak > 0 ? promotion.totalDiscountLak / promotion.totalSalesLak : 0.08;
    const customers = Math.max(80, Math.round(promotion.usageCount * 4.8 + promotion.applicableProductIds.length * 28 + promotion.applicableCategoryIds.length * 42));
    const usage = Math.max(25, Math.round(customers * 0.46));
    const revenue = Math.max(promotion.totalSalesLak, usage * 23000);
    const discount = Math.max(promotion.totalDiscountLak, Math.round(revenue * discountRatio));
    const profit = Math.round(revenue * 0.26 - discount);
    const stock = Math.round(usage * (promotion.type === "buy_x_get_y" ? 2.2 : 1.3));
    const risk = profit < 0 || discountRatio > 0.3 ? "High" : discountRatio > 0.15 ? "Medium" : "Low";
    return {
        customers,
        discount,
        profit,
        revenue,
        risk,
        stock,
        usage,
    };
}
