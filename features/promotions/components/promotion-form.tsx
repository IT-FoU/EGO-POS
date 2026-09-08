"use client";

import { useMemo, useState, useTransition } from "react";
import type { SupportedLocale } from "@/lib/constants";
import {
  PROMOTION_UI_STATUS_VALUES,
  fillPromotionsCopy,
  localizePromotionError,
  promotionRiskLabel,
  promotionStatusLabel,
  tPromotions,
} from "@/lib/i18n/promotions-copy";
import { usePromotionsLocale } from "@/features/promotions/use-promotions-locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Gift, QrCode, Save, Search, ShieldAlert, SlidersHorizontal, Sparkles, XCircle, type LucideIcon, } from "lucide-react";
import type { MembershipLevel } from "@/features/customers/types";
import type { Category, Product } from "@/features/products/types";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import { PROMOTION_TEMPLATES } from "@/features/promotions/promotion-templates";
import type { Promotion, PromotionType } from "@/features/promotions/types";
import { createPromotionAction, updatePromotionAction } from "@/features/promotions/actions";
import { AppSmallModal } from "@/components/ui/app-small-modal";

let activeLocale: SupportedLocale = "en";

function t(key: string) {
  return tPromotions(key, activeLocale);
}

function memberTargetLabel(target: string) {
  if (target === "Everyone") return t("everyone");
  if (target === "Members Only") return t("membersOnly");
  if (target === "Student Members") return t("studentMembers");
  if (target === "New Members") return t("newMembers");
  if (target === "VIP Members") return t("vipMembers");
  if (target === "Custom Group") return t("customGroup");
  return target;
}

function stackOptionLabel(option: string) {
  if (option === "Product discount") return t("productDiscount");
  if (option === "Bill discount") return t("billDiscount");
  if (option === "Coupon") return t("coupon");
  if (option === "QR coupon") return t("qrCoupon");
  if (option === "Member discount") return t("memberDiscount");
  if (option === "Point redemption") return t("pointRedemption");
  if (option === "Buy X Get Y") return t("buyXGetY");
  if (option === "Free gift") return t("freeGift");
  return option;
}

function previewPromotionLabel(item: string) {
  if (item === "Current promotion being created") return t("currentPromotionPreview");
  if (item === "Existing stackable mock promotion") return t("existingStackablePreview");
  if (item === "Coupon / QR coupon") return t("couponQrPreview");
  if (item === "Point redemption") return t("pointRedemption");
  if (item === "Free gift") return t("freeGift");
  if (item === "Minimum margin review") return t("minimumMarginReview");
  if (item.endsWith(" member discount")) {
    const target = item.slice(0, -" member discount".length);
    return `${memberTargetLabel(target)} ${t("memberDiscount")}`;
  }
  return item;
}

const stackOptions = [
    "Product discount",
    "Bill discount",
    "Coupon",
    "QR coupon",
    "Member discount",
    "Point redemption",
    "Buy X Get Y",
    "Free gift",
];
const previewCartItems = [
    {
        cost: 5500,
        name: "Pepsi Can",
        price: 8000,
        quantity: 1,
        sku: "DRK-PEP-CAN-001",
    },
    {
        cost: 3000,
        name: "Drinking Water 500ml",
        price: 5000,
        quantity: 2,
        sku: "DRK-WAT-BTL-500",
    },
];
type SelectorKind = "products" | "categories" | "brands" | "branches" | "warehouses" | "members";
type SaveMode = "draft" | "approval" | "activate";
export function PromotionForm({
  categories,
  initialPromotion,
  locale: localeProp,
  membershipLevels,
  products,
}: {
    categories: Category[];
    initialPromotion?: Promotion;
    locale?: SupportedLocale;
    membershipLevels: MembershipLevel[];
    products: Product[];
}) {
    const router = useRouter();
    const locale = usePromotionsLocale(localeProp);
    activeLocale = locale;

    const wizardSteps = useMemo(() => [
      t("basicInfo"),
      t("discountRules"),
      t("targeting"),
      t("protection"),
      t("summary"),
    ], [locale]);

    const templates = useMemo(() => PROMOTION_TEMPLATES.map((item) => ({
      ...item,
      label: t(item.labelKey),
      note: t("subtitle"),
    })), [locale]);
    const [isPending, startTransition] = useTransition();
    const [step, setStep] = useState(0);
    const [selector, setSelector] = useState<SelectorKind | null>(null);
    const [showQr, setShowQr] = useState(false);
    const [showValidation, setShowValidation] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [codeMode, setCodeMode] = useState<"auto" | "manual">(initialPromotion?.promotionCode ? "manual" : "auto");
    const [code, setCode] = useState(initialPromotion?.promotionCode ?? "");
    const [name, setName] = useState(initialPromotion?.promotionName ?? "");
    const [description, setDescription] = useState(initialPromotion?.description ?? "");
    const [type, setType] = useState<PromotionType>(initialPromotion?.type ?? "percentage");
    const [template, setTemplate] = useState("percentage");
    const [status, setStatus] = useState<string>(initialPromotion?.status ?? "scheduled");
    const [priority, setPriority] = useState(initialPromotion?.priority ?? 10);
    const [discountPercent, setDiscountPercent] = useState(initialPromotion?.discountPercent ?? 10);
    const [discountAmount, setDiscountAmount] = useState(initialPromotion?.discountAmountLak ?? 5000);
    const [buyQty, setBuyQty] = useState(initialPromotion?.buyQuantity ?? 2);
    const [getQty, setGetQty] = useState(initialPromotion?.getQuantity ?? 1);
    const [bundlePrice, setBundlePrice] = useState(initialPromotion?.comboPriceLak ?? 15000);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>(initialPromotion?.applicableProductIds ?? products.slice(0, 2).map((product) => product.id));
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(initialPromotion?.applicableCategoryIds ?? []);
    const [customerTarget, setCustomerTarget] = useState("Everyone");
    const [startDate, setStartDate] = useState(initialPromotion?.startDate ?? defaultPromotionStartDate());
    const [endDate, setEndDate] = useState(initialPromotion?.endDate ?? defaultPromotionEndDate());
    const [allDay, setAllDay] = useState(true);
    const [approvalRequired, setApprovalRequired] = useState(false);
    const [couponCode, setCouponCode] = useState("SAVE10");
    const [stacking, setStacking] = useState<string[]>(["Product discount", "Coupon", "Member discount"]);
    const selectedProducts = products.filter((product) => selectedProductIds.includes(product.id));
    const subtotal = selectedProducts.reduce((total, product) => total + product.sellingPriceLak, 0);
    const estimatedCost = selectedProducts.reduce((total, product) => total + product.costPriceLak, 0);
    const discount = calculateDiscount();
    const finalPrice = Math.max(subtotal - discount, 0);
    const estimatedProfit = finalPrice - estimatedCost;
    const margin = finalPrice > 0 ? (estimatedProfit / finalPrice) * 100 : 0;
    const minimumMargin = 8;
    const priorityInfo = priorityLabel(priority);
    const scheduleDays = daysBetween(startDate, endDate);
    const livePreview = buildLivePosPreview({
        couponEnabled: couponCode.trim().length > 0 && stacking.includes("Coupon"),
        customerTarget,
        discountAmount,
        discountPercent,
        freeGiftEnabled: stacking.includes("Free gift"),
        getQty,
        memberEnabled: customerTarget !== "Everyone" || stacking.includes("Member discount"),
        minimumMargin,
        pointEnabled: stacking.includes("Point redemption"),
        type,
    });
    const forecast = buildImpactForecast({
        customerTarget,
        discount,
        discountPercent,
        margin: livePreview.margin,
        scheduleDays,
        selectedTargetCount: selectedProductIds.length + selectedCategoryIds.length,
        stackingCount: stacking.length,
        type,
    });
    const hasProfitRisk = selectedProducts.length > 0 && (estimatedProfit < 0 || margin < minimumMargin || livePreview.estimatedProfit < 0);
    const hasMarginWarning = livePreview.estimatedProfit >= 0 && livePreview.margin < minimumMargin;
    const validationIssues = useMemo(() => {
        const issues: Array<{
            level: "red" | "yellow";
            text: string;
        }> = [];
        if (!name.trim())
            issues.push({ level: "red", text: t("missingName") });
        if (!type)
            issues.push({ level: "red", text: t("missingType") });
        if (discount <= 0 && !["buy_x_get_y", "combo_set"].includes(type))
            issues.push({ level: "red", text: t("missingDiscountValue") });
        if (selectedProductIds.length === 0 && selectedCategoryIds.length === 0)
            issues.push({ level: "red", text: t("missingTarget") });
        if (!startDate || !endDate)
            issues.push({ level: "red", text: t("missingDate") });
        if (hasProfitRisk)
            issues.push({ level: "red", text: t("negativeProfit") });
        if (template === "coupon" && !couponCode.trim())
            issues.push({ level: "red", text: t("couponMissingCode") });
        if (type === "buy_x_get_y" && (buyQty <= 0 || getQty <= 0))
            issues.push({ level: "red", text: t("missingTarget") });
        if (approvalRequired || hasProfitRisk)
            issues.push({ level: "yellow", text: t("approvalRequiredBeforeActivation") });
        return issues;
    }, [approvalRequired, buyQty, couponCode, discount, endDate, getQty, hasProfitRisk, locale, name, selectedCategoryIds.length, selectedProductIds.length, startDate, template, type]);
    const blockingIssues = validationIssues.filter((issue) => issue.level === "red");
    function calculateDiscount() {
        if (type === "percentage" || type === "member_discount")
            return Math.round(subtotal * (discountPercent / 100));
        if (type === "fixed_amount")
            return Math.min(subtotal, discountAmount);
        if (type === "buy_x_get_y")
            return (selectedProducts[0]?.sellingPriceLak ?? 0) * getQty;
        if (type === "combo_set")
            return Math.max(subtotal - bundlePrice, 0);
        return 0;
    }
    function selectTemplate(templateKey: string) {
        const selectedTemplate = templates.find((item) => item.key === templateKey);
        if (!selectedTemplate)
            return;
        setTemplate(selectedTemplate.key);
        setType(selectedTemplate.type);
        if (selectedTemplate.defaults?.buyQuantity != null) {
            setBuyQty(selectedTemplate.defaults.buyQuantity);
        }
        if (selectedTemplate.defaults?.getQuantity != null) {
            setGetQty(selectedTemplate.defaults.getQuantity);
        }
        if (selectedTemplate.defaults?.couponCode) {
            setCouponCode(selectedTemplate.defaults.couponCode);
        }
        setMessage(fillPromotionsCopy(t("templateApplied"), { name: selectedTemplate.label }));
    }
    function toggleStack(option: string) {
        setStacking((current) => current.includes(option) ? current.filter((item) => item !== option) : [...current, option]);
    }
    function handleSave(mode: SaveMode) {
        if ((mode === "activate" || mode === "approval") && blockingIssues.length > 0) {
            setShowValidation(true);
            return;
        }
        startTransition(async () => {
            const payload = {
                applicableCategoryIds: selectedCategoryIds,
                applicableProductIds: selectedProductIds,
                buyQuantity: buyQty,
                comboPriceLak: bundlePrice,
                description,
                discountAmountLak: discountAmount,
                discountPercent,
                endDate,
                getQuantity: getQty,
                membershipLevelIds: type === "member_discount" || customerTarget !== "Everyone"
                    ? membershipLevels.map((level) => level.id)
                    : [],
                priority,
                promotionCode: codeMode === "auto" ? null : code.trim() || null,
                promotionName: name.trim(),
                promotionType: type,
                startDate,
                status: mode === "activate" ? "active" as const : mode === "approval" ? "scheduled" as const : "scheduled" as const,
            };
            const result = initialPromotion
                ? await updatePromotionAction(initialPromotion.id, payload)
                : await createPromotionAction(payload);
            if (!result.ok) {
                setMessage(localizePromotionError(result.error, locale));
                return;
            }
            setMessage(mode === "draft"
                ? t("savedDraft")
                : mode === "approval"
                    ? t("promotionSubmitted")
                    : t("promotionSavedActivated"));
            router.refresh();
            router.push("/promotions");
        });
    }
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {selector ? <SelectorModal kind={selector} categories={categories} membershipLevels={membershipLevels} products={products} selectedCategoryIds={selectedCategoryIds} selectedProductIds={selectedProductIds} onClose={() => setSelector(null)} onSelectCategories={setSelectedCategoryIds} onSelectProducts={setSelectedProductIds}/> : null}
      {showQr ? <QrPreviewModal couponCode={couponCode} onClose={() => setShowQr(false)}/> : null}
      {showValidation ? <ValidationErrorModal issues={validationIssues} onClose={() => setShowValidation(false)}/> : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/promotions">
          <ArrowLeft aria-hidden="true"/>
          {t("backToPromotions")}
        </Link>
        <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Gift aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{initialPromotion ? t("editPromotion") : t("createPromotion")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton label={t("saveDraft")} icon={Save} onClick={() => handleSave("draft")}/>
            <ActionButton label={t("submitForApproval")} icon={ShieldAlert} onClick={() => handleSave("approval")}/>
            <ActionButton label={t("saveActivate")} icon={CheckCircle2} primary onClick={() => handleSave("activate")} disabled={hasProfitRisk || isPending}/>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div> : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-2 md:grid-cols-5">
          {wizardSteps.map((label, index) => (<button className={index === step ? "rounded-md bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground" : "rounded-md border border-border px-3 py-3 text-sm font-semibold hover:border-primary"} key={label} type="button" onClick={() => setStep(index)}>
              <span className="mr-2">{index + 1}</span>
              {label}
            </button>))}
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0">
      {step === 0 ? (<WizardCard icon={Sparkles} title={t("basicInfo")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={t("promotionCode")}>
              <div className="flex gap-2">
                <select className="field-input w-32" value={codeMode} onChange={(event) => setCodeMode(event.target.value as "auto" | "manual")}>
                  <option value="auto">{t("auto")}</option>
                  <option value="manual">{t("manual")}</option>
                </select>
                <input className="field-input font-mono" value={code} onChange={(event) => setCode(event.target.value)} disabled={codeMode === "auto"}/>
              </div>
            </Field>
            <Field label={t("promotionName")}>
              <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("promotionName")}/>
            </Field>
            <Field label={t("status")}>
              <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                {PROMOTION_UI_STATUS_VALUES.map((option) => <option key={option} value={option}>{promotionStatusLabel(option, locale)}</option>)}
              </select>
            </Field>
            <Field label={t("priority")}>
              <input className="field-input" type="range" min="1" max="100" value={priority} onChange={(event) => setPriority(Number(event.target.value))}/>
              <div className="mt-2 rounded-md border border-border bg-background p-3">
                <div className="text-sm font-semibold">
                  {t("priority")} {priority} - {priorityInfo.label}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("stackRules")}</p>
                <p className="mt-2 text-xs text-muted-foreground" title={priorityInfo.tooltip}>
                  {priorityInfo.tooltip}
                </p>
              </div>
            </Field>
            <div className="lg:col-span-2">
              <Field label={t("description")}>
                <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={description} onChange={(event) => setDescription(event.target.value)}/>
              </Field>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {templates.map((item) => (<button className={template === item.key ? "rounded-lg border border-primary bg-primary/10 p-4 text-left" : "rounded-lg border border-border bg-background p-4 text-left hover:border-primary"} key={item.key} type="button" onClick={() => selectTemplate(item.key)}>
                <div className="font-semibold">{item.label}</div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.note}</div>
              </button>))}
          </div>
        </WizardCard>) : null}

      {step === 1 ? (<WizardCard icon={Gift} title={t("discountRules")}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label={t("promotionType")}>
              <select className="field-input" value={type} onChange={(event) => setType(event.target.value as PromotionType)}>
                <option value="percentage">{t("percentageDiscount")}</option>
                <option value="fixed_amount">{t("fixedAmount")}</option>
                <option value="buy_x_get_y">{t("buyXGetY")}</option>
                <option value="combo_set">{t("comboSet")}</option>
                <option value="member_discount">{t("memberDiscount")}</option>
              </select>
            </Field>
            {(type === "percentage" || type === "member_discount") ? (<>
                <NumberField label={t("discountPercent")} value={discountPercent} onChange={setDiscountPercent}/>
                <NumberField label={t("maxDiscountAmount")} value={discountAmount} onChange={setDiscountAmount}/>
              </>) : null}
            {type === "fixed_amount" ? <NumberField label={t("discountAmountLak")} value={discountAmount} onChange={setDiscountAmount}/> : null}
            {type === "buy_x_get_y" ? (<>
                <NumberField label={t("buyQuantity")} value={buyQty} onChange={setBuyQty}/>
                <NumberField label={t("getQuantity")} value={getQty} onChange={setGetQty}/>
                <button className="h-11 self-end rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSelector("products")}>{t("selectedProducts")}</button>
              </>) : null}
            {type === "combo_set" ? (<>
                <NumberField label={t("discountAmountLak")} value={bundlePrice} onChange={setBundlePrice}/>
                <button className="h-11 self-end rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSelector("products")}>{t("selectedProducts")}</button>
              </>) : null}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title={t("couponRules")}>
              <div className="grid gap-3">
                <input className="field-input font-mono" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder={t("couponCode")}/>
                <div className="flex flex-wrap gap-2">
                  {[t("limitPerBill"), t("usageLimit"), t("memberOnly"), t("limitPerCustomer"), t("totalUsage")].map((rule) => <TogglePill key={rule} label={rule}/>)}
                  <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setShowQr(true)}>{t("qrCoupon")}</button>
                </div>
              </div>
            </Panel>
            <Panel title={t("dateRange")}>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="field-input" type="time" defaultValue="08:00"/>
                <input className="field-input" type="time" defaultValue="18:00"/>
                <TogglePill label={t("flashSale")}/>
                <TogglePill label={t("weekly")}/>
              </div>
            </Panel>
          </div>
        </WizardCard>) : null}

      {step === 2 ? (<WizardCard icon={CalendarDays} title={t("targeting")}>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title={t("scope")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                [t("entireStore"), null],
                [t("selectedProducts"), "products"],
                [t("selectedCategories"), "categories"],
                [t("categories"), "brands"],
                [t("branch"), "branches"],
                [t("scope"), "warehouses"],
            ].map(([label, kind]) => (<button className="rounded-md border border-border bg-background p-3 text-left text-sm font-semibold hover:border-primary" key={label} type="button" onClick={() => kind ? setSelector(kind as SelectorKind) : setMessage(t("entireStore"))}>{label}</button>))}
              </div>
            </Panel>
            <Panel title={t("memberScope")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {["Everyone", "Members Only", "Student Members", "Standard", "Silver", "Gold", "Platinum", "New Members", "VIP Members", "Custom Group"].map((target) => (<button className={customerTarget === target ? "rounded-md border border-primary bg-primary/10 p-3 text-left text-sm font-semibold" : "rounded-md border border-border bg-background p-3 text-left text-sm font-semibold hover:border-primary"} key={target} type="button" onClick={() => setCustomerTarget(target)}>{memberTargetLabel(target)}</button>))}
              </div>
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <Field label={t("startDate")}><input className="field-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}/></Field>
            <Field label={t("endDate")}><input className="field-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}/></Field>
            <Field label={t("startTime")}><input className="field-input" type="time" defaultValue="08:00" disabled={allDay}/></Field>
            <Field label={t("endTime")}><input className="field-input" type="time" defaultValue="22:00" disabled={allDay}/></Field>
            <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold"><input className="size-5 accent-[var(--primary)]" type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)}/>{t("allDay")}</label>
            {[t("daily"), t("weekly"), t("monthly"), t("dateRange")].map((repeat) => <TogglePill key={repeat} label={repeat}/>)}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[t("limitPerCustomer"), t("limitPerDay"), t("limitPerBill"), t("usageLimit")].map((label) => <NumberField key={label} label={label} value={1} onChange={() => undefined}/>)}
          </div>
        </WizardCard>) : null}

      {step === 3 ? (<WizardCard icon={ShieldAlert} title={t("profitProtection")}>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title={t("stackRules")}>
              <div className="grid gap-2 sm:grid-cols-2">
                {stackOptions.map((option) => (<label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={option}>
                    <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={stacking.includes(option)} onChange={() => toggleStack(option)}/>
                    {stackOptionLabel(option)}
                  </label>))}
              </div>
            </Panel>
            <Panel title={t("stackRules")}>
              <div className="grid gap-3">
                <NumberField label={t("maxDiscountPerItem")} value={20} onChange={() => undefined}/>
                <NumberField label={t("maxDiscountPerBill")} value={150000} onChange={() => undefined}/>
                <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setMessage(t("addExcludedCombination"))}>{t("addExcludedCombination")}</button>
              </div>
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Metric label={t("discount")} value={`${formatLak(estimatedCost)} LAK`}/>
            <Metric label={t("discountValue")} value={`${formatLak(subtotal)} LAK`}/>
            <Metric label={t("discountAmountLak")} value={`-${formatLak(discount)} LAK`} danger/>
            <Metric label={t("discount")} value={`${formatLak(finalPrice)} LAK`}/>
            <Metric label={t("estimatedProfit")} value={`${formatLak(estimatedProfit)} LAK`} danger={estimatedProfit < 0}/>
            <Metric label={t("marginImpact")} value={`${margin.toFixed(1)}%`} danger={margin < minimumMargin}/>
          </div>
          {hasProfitRisk ? (<div className="mt-5 rounded-md border border-danger/40 bg-danger/10 p-4 text-sm font-semibold text-danger">{t("negativeProfit")}</div>) : null}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title={t("profitProtection")}>
              <div className="grid gap-2">
                {[t("discount"), t("discountPercent"), t("stackRules"), t("selectedProducts"), t("members"), t("priority"), t("requireApproval")].map((item) => (<button className="rounded-md border border-border bg-background p-3 text-left text-sm hover:border-primary" type="button" key={item} onClick={() => setMessage(`${item} suggestion selected.`)}>{item}</button>))}
              </div>
            </Panel>
            <Panel title={t("approval")}>
              <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold">
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)}/>
                {t("requireApproval")}
              </label>
              <textarea className="mt-3 min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm" placeholder={t("approval")}/>
              <p className="mt-3 text-sm text-muted-foreground">{t("approvalRequiredBeforeActivation")}</p>
            </Panel>
          </div>
        </WizardCard>) : null}

      {step === 4 ? (<WizardCard icon={CheckCircle2} title={t("summary")}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <DataSummary rows={[
                [t("promotionCode"), code],
                [t("promotionName"), name || "-"],
                [t("type"), formatPromotionType(type, locale)],
                [t("promotionType"), templates.find((item) => item.key === template)?.label ?? template],
                [t("target"), `${selectedProductIds.length} products / ${selectedCategoryIds.length} categories`],
                [t("branch"), t("scope")],
                [t("memberScope"), customerTarget],
                [t("dateRange"), `${startDate} to ${endDate}`],
                [t("stackRules"), stacking.join(", ")],
                [t("couponRules"), couponCode || "-"],
                [t("estimatedProfit"), `${formatLak(estimatedProfit)} LAK / ${margin.toFixed(1)}%`],
                [t("approval"), approvalRequired || hasProfitRisk ? t("requireApproval") : t("auto")],
            ]}/>
            </div>
            <aside className="rounded-lg border border-border bg-background p-5">
              <h3 className="text-lg font-semibold">{t("validationPanel")}</h3>
              <div className="mt-4 flex flex-col gap-3">
                {validationIssues.length === 0 ? (<div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm font-semibold text-success">{t("save")}</div>) : validationIssues.map((issue) => (<div className={issue.level === "red" ? "rounded-md border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger" : "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm font-semibold text-warning"} key={issue.text}>
                    {issue.text}
                  </div>))}
              </div>
            </aside>
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <LivePosPreviewPanel compact preview={livePreview}/>
            <ForecastPanel forecast={forecast}/>
          </div>
        </WizardCard>) : null}
        </div>

        <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <LivePosPreviewPanel belowMinimumMargin={hasMarginWarning} preview={livePreview}/>
        </aside>
      </section>

      <section className="flex flex-wrap justify-between gap-3">
        <button className="h-11 rounded-md border border-border px-5 text-sm font-semibold disabled:opacity-40" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>{t("back")}</button>
        <div className="flex flex-wrap gap-2">
          <button className="h-11 rounded-md border border-border px-5 text-sm font-semibold" type="button" onClick={() => handleSave("draft")}>{t("saveDraft")}</button>
          <button className="h-11 rounded-md border border-warning px-5 text-sm font-semibold text-warning" type="button" onClick={() => handleSave("approval")}>{t("submitForApproval")}</button>
          {step < wizardSteps.length - 1 ? (<button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setStep((current) => Math.min(wizardSteps.length - 1, current + 1))}>{t("next")}</button>) : (<button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="button" disabled={hasProfitRisk || isPending} onClick={() => handleSave("activate")}>{t("saveActivate")}</button>)}
        </div>
      </section>
    </div>);
}
type LivePreview = ReturnType<typeof buildLivePosPreview>;
type ImpactForecast = ReturnType<typeof buildImpactForecast>;
function LivePosPreviewPanel({ belowMinimumMargin = false, compact = false, preview, }: {
    belowMinimumMargin?: boolean;
    compact?: boolean;
    preview: LivePreview;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const statusClass = preview.estimatedProfit < 0
        ? "border-danger/40 bg-danger/10 text-danger"
        : belowMinimumMargin
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-success/40 bg-success/10 text-success";
    const statusText = preview.estimatedProfit < 0
        ? t("negativeProfit") : belowMinimumMargin
        ? t("approvalRequiredBeforeActivation") : t("savedDraft");
    return (<section className={compact ? "min-w-0 rounded-lg border border-border bg-card p-4" : "min-w-0 rounded-lg border border-border bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t("livePosPreview")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        {!compact ? (<button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? t("expand") : t("collapse")}
          </button>) : null}
      </div>
      {!collapsed ? (<div className="mt-4 flex flex-col gap-4">
          {!compact ? (<div className="rounded-md border border-border bg-background p-3">
              <div className="text-sm font-semibold">{t("selectedProducts")}</div>
              <div className="mt-3 flex flex-col gap-3">
                {preview.items.map((item) => (<div className="rounded-md border border-border bg-card p-3 text-sm" key={item.sku}>
                    <div className="font-semibold">{item.name} / {item.sku}</div>
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                      <span>{t("usage")}: {item.quantity}</span>
                      <span>{t("discountValue")}: {formatLak(item.price)} LAK{item.quantity > 1 ? " each" : ""}</span>
                      <span>{t("discount")}: {formatLak(item.cost)} LAK{item.quantity > 1 ? " each" : ""}</span>
                    </div>
                  </div>))}
              </div>
            </div>) : null}

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm font-semibold">{t("summary")}</div>
            <dl className="mt-3 grid gap-2 text-sm">
              {[
                [t("summary"), preview.subtotal],
                [t("productDiscount"), -preview.productDiscount],
                [t("billDiscount"), -preview.billDiscount],
                [t("coupon"), -preview.couponDiscount],
                [t("memberDiscount"), -preview.memberDiscount],
                [t("buyXGetY"), -preview.pointRedemption],
                [t("freeGift"), -preview.freeGiftValue],
                [t("summary"), preview.finalTotal],
                [t("estimatedProfit"), preview.estimatedProfit],
            ].map(([label, value]) => (<div className="flex items-center justify-between gap-3" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={Number(value) < 0 ? "font-semibold text-danger" : "font-semibold"}>{formatLak(Number(value))} LAK</dd>
                </div>))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t("marginImpact")}</dt>
                <dd className="font-semibold">{preview.margin.toFixed(1)}%</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm font-semibold">{t("promotions")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.appliedPromotions.map((promotion) => (<span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" key={promotion}>{previewPromotionLabel(promotion)}</span>))}
            </div>
          </div>

          <div className={`rounded-md border p-3 text-sm font-semibold ${statusClass}`}>
            {statusText}
          </div>
        </div>) : null}
    </section>);
}
function ForecastPanel({ forecast }: {
    forecast: ImpactForecast;
}) {
    const riskClass = forecast.riskLevel === "High"
        ? "border-danger/40 bg-danger/10 text-danger"
        : forecast.riskLevel === "Medium"
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-success/40 bg-success/10 text-success";
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{t("promotionImpactForecast")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskClass}`}>
          {promotionRiskLabel(forecast.riskLevel, activeLocale)} {t("riskWarnings")}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label={t("members")} value={formatLak(forecast.customersReached)}/>
        <Metric label={t("usage")} value={formatLak(forecast.usageCount)}/>
        <Metric label={t("revenueGenerated")} value={`${formatLak(forecast.revenueGenerated)} LAK`}/>
        <Metric label={t("discountGiven")} value={`${formatLak(forecast.discountGiven)} LAK`}/>
        <Metric label={t("estimatedProfit")} value={`${formatLak(forecast.grossProfit)} LAK`} danger={forecast.grossProfit < 0}/>
        <Metric label={t("marginImpact")} value={`${forecast.marginImpact.toFixed(1)}%`} danger={forecast.marginImpact < -8}/>
        <Metric label={t("scope")} value={fillPromotionsCopy(t("unitsCount"), { count: formatLak(forecast.stockMovement) })}/>
      </div>
    </section>);
}
function Field({ children, label }: {
    children: React.ReactNode;
    label: string;
}) {
    return <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">{label}{children}</label>;
}
function NumberField({ label, onChange, value }: {
    label: string;
    onChange: (value: number) => void;
    value: number;
}) {
    const [text, setText] = useState(String(value));
    return (<Field label={label}>
      <input className="field-input" inputMode="numeric" value={text} onFocus={() => text === "0" && setText("")} onBlur={() => {
            const next = text.trim() === "" ? 0 : Number(text.replaceAll(",", ""));
            setText(formatLak(next));
            onChange(next);
        }} onChange={(event) => {
            const raw = event.target.value.replace(/[^0-9]/g, "");
            setText(raw.replace(/^0+(?=\d)/, ""));
        }}/>
    </Field>);
}
function WizardCard({ children, icon: Icon, title }: {
    children: React.ReactNode;
    icon: LucideIcon;
    title: string;
}) {
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon aria-hidden="true"/></div>
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="mt-6">{children}</div>
    </section>);
}
function Panel({ children, title }: {
    children: React.ReactNode;
    title: string;
}) {
    return <section className="min-w-0 rounded-lg border border-border bg-card/60 p-4"><h3 className="font-semibold">{title}</h3><div className="mt-4">{children}</div></section>;
}
function TogglePill({ label }: {
    label: string;
}) {
    const [checked, setChecked] = useState(false);
    return <button className={checked ? "h-9 rounded-md border border-primary bg-primary/10 px-3 text-xs font-semibold text-primary" : "h-9 rounded-md border border-border px-3 text-xs font-semibold"} type="button" onClick={() => setChecked((value) => !value)}>{label}</button>;
}
function ActionButton({ disabled = false, icon: Icon, label, onClick, primary = false }: {
    disabled?: boolean;
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    primary?: boolean;
}) {
    return (<button className={primary ? "inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" : "inline-flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-semibold disabled:opacity-50"} disabled={disabled} type="button" onClick={onClick}>
      <Icon className="size-4" aria-hidden="true"/>
      {label}
    </button>);
}
function Metric({ danger = false, label, value }: {
    danger?: boolean;
    label: string;
    value: string;
}) {
    return <div className="rounded-md border border-border bg-background p-4"><div className="text-xs uppercase text-muted-foreground">{label}</div><div className={danger ? "mt-1 text-xl font-semibold text-danger" : "mt-1 text-xl font-semibold"}>{value}</div></div>;
}
function DataSummary({ rows }: {
    rows: Array<[
        string,
        string
    ]>;
}) {
    return (<div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <tbody>
          {rows.map(([label, value]) => (<tr className="border-b border-border last:border-b-0" key={label}>
              <td className="w-56 bg-background px-4 py-3 font-semibold">{label}</td>
              <td className="px-4 py-3 text-muted-foreground">{value}</td>
            </tr>))}
        </tbody>
      </table>
    </div>);
}
function SelectorModal({ categories, kind, membershipLevels, onClose, onSelectCategories, onSelectProducts, products, selectedCategoryIds, selectedProductIds, }: {
    categories: Category[];
    kind: SelectorKind;
    membershipLevels: MembershipLevel[];
    onClose: () => void;
    onSelectCategories: (ids: string[]) => void;
    onSelectProducts: (ids: string[]) => void;
    products: Product[];
    selectedCategoryIds: string[];
    selectedProductIds: string[];
}) {
    const [query, setQuery] = useState("");
    const [productIds, setProductIds] = useState(selectedProductIds);
    const [categoryIds, setCategoryIds] = useState(selectedCategoryIds);
    const title = `${t("categoriesSelector")} - ${kind}`;
    const placeholderItems = kind === "brands" ? ["Coca-Cola", "Pepsi", "Lao Brewery", "Local Brand"] : kind === "branches" ? ["Main Branch", "Morning Market Branch"] : kind === "warehouses" ? ["Main Warehouse", "Cold Storage", "Branch Warehouse"] : membershipLevels.map((level) => level.name);
    const filteredProducts = products.filter((product) => [product.nameEn, product.sku, product.barcode].join(" ").toLowerCase().includes(query.toLowerCase()));
    const filteredCategories = categories.filter((category) => category.nameEn.toLowerCase().includes(query.toLowerCase()));
    return (<div className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72">
      <section className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4 lg:px-8">
          <div className="min-w-0"><h2 className="truncate text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{t("searchPlaceholder")}</p></div>
          <button className="h-9 shrink-0 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 lg:px-8">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
            <input className="field-input pl-10" placeholder={`Search ${kind}`} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {kind === "products" ? filteredProducts.map((product) => (<label className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={product.id}>
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={productIds.includes(product.id)} onChange={() => setProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}/>
                <span className="min-w-0"><span className="font-semibold">{product.nameEn}</span><span className="block text-xs text-muted-foreground">{product.sku}</span></span>
              </label>)) : null}
            {kind === "categories" ? filteredCategories.map((category) => (<label className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={category.id}>
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])}/>
                <span className="min-w-0">{category.nameEn}</span>
              </label>)) : null}
            {!["products", "categories"].includes(kind) ? placeholderItems.map((item) => <TogglePill key={item} label={item}/>) : null}
          </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card px-6 py-4 lg:px-8">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => { onSelectProducts(productIds); onSelectCategories(categoryIds); onClose(); }}>{t("applySelection")}</button>
        </footer>
      </section>
    </div>);
}
function QrPreviewModal({ couponCode, onClose }: {
    couponCode: string;
    onClose: () => void;
}) {
    return (<AppSmallModal closeAriaLabel={t("close")} closeOnBackdrop={true} closeOnEscape={true} footer={<div className="flex justify-end">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        </div>} onClose={onClose} size="sm" title={t("qrCoupon")}>
        <div className="text-center">
          <div className="mx-auto grid size-48 place-items-center rounded-lg border border-border bg-background">
            <QrCode className="size-28 text-primary" aria-hidden="true"/>
          </div>
          <p className="mt-4 font-mono text-lg font-semibold">{couponCode || "COUPON-CODE"}</p>
        </div>
      </AppSmallModal>);
}
function ValidationErrorModal({ issues, onClose }: {
    issues: Array<{
        level: "red" | "yellow";
        text: string;
    }>;
    onClose: () => void;
}) {
    return (<AppSmallModal closeAriaLabel={t("close")} closeOnBackdrop={true} closeOnEscape={true} footer={<div className="flex justify-end">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        </div>} onClose={onClose} size="md" title={t("validationPanel")}>
        <div className="flex flex-col gap-3">
          {issues.length === 0 ? <div className="rounded-md border border-success/40 bg-success/10 p-3 text-success">{t("save")}</div> : issues.map((issue) => (<div className={issue.level === "red" ? "rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger" : "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning"} key={issue.text}>
              {issue.text}
            </div>))}
        </div>
      </AppSmallModal>);
}
function buildLivePosPreview({ couponEnabled, customerTarget, discountAmount, discountPercent, freeGiftEnabled, getQty, memberEnabled, minimumMargin, pointEnabled, type, }: {
    couponEnabled: boolean;
    customerTarget: string;
    discountAmount: number;
    discountPercent: number;
    freeGiftEnabled: boolean;
    getQty: number;
    memberEnabled: boolean;
    minimumMargin: number;
    pointEnabled: boolean;
    type: PromotionType;
}) {
    const subtotal = previewCartItems.reduce((total, item) => total + item.price * item.quantity, 0);
    const cost = previewCartItems.reduce((total, item) => total + item.cost * item.quantity, 0);
    const productDiscount = type === "percentage" || type === "member_discount"
        ? Math.round(subtotal * (discountPercent / 100))
        : type === "buy_x_get_y"
            ? Math.min(previewCartItems[1]?.price ?? 0, (previewCartItems[1]?.price ?? 0) * getQty)
            : 0;
    const billDiscount = type === "fixed_amount" ? Math.min(subtotal, discountAmount) : 0;
    const couponDiscount = couponEnabled ? 3000 : 0;
    const memberDiscount = memberEnabled ? Math.round(subtotal * 0.03) : 0;
    const pointRedemption = pointEnabled ? 5000 : 0;
    const freeGiftValue = freeGiftEnabled ? 5000 : 0;
    const totalDiscount = productDiscount + billDiscount + couponDiscount + memberDiscount + pointRedemption + freeGiftValue;
    const finalTotal = Math.max(subtotal - totalDiscount, 0);
    const estimatedProfit = finalTotal - cost;
    const margin = finalTotal > 0 ? (estimatedProfit / finalTotal) * 100 : -100;
    const appliedPromotions = [
        "Current promotion being created",
        "Existing stackable mock promotion",
        memberEnabled ? `${customerTarget} member discount` : "",
        couponEnabled ? "Coupon / QR coupon" : "",
        pointEnabled ? "Point redemption" : "",
        freeGiftEnabled ? "Free gift" : "",
        margin < minimumMargin ? "Minimum margin review" : "",
    ].filter(Boolean);
    return {
        appliedPromotions,
        billDiscount,
        cost,
        couponDiscount,
        estimatedProfit,
        finalTotal,
        freeGiftValue,
        items: previewCartItems,
        margin,
        memberDiscount,
        pointRedemption,
        productDiscount,
        subtotal,
        totalDiscount,
    };
}
function buildImpactForecast({ customerTarget, discount, discountPercent, margin, scheduleDays, selectedTargetCount, stackingCount, type, }: {
    customerTarget: string;
    discount: number;
    discountPercent: number;
    margin: number;
    scheduleDays: number;
    selectedTargetCount: number;
    stackingCount: number;
    type: PromotionType;
}) {
    const typeMultiplier = type === "buy_x_get_y" ? 1.35 : type === "combo_set" ? 1.2 : type === "fixed_amount" ? 1.1 : 1;
    const memberMultiplier = customerTarget === "Everyone" ? 1 : 0.68;
    const reach = Math.max(80, Math.round(220 * memberMultiplier + selectedTargetCount * 35 + scheduleDays * 8));
    const usageCount = Math.max(20, Math.round(reach * 0.42 * typeMultiplier));
    const averageBasket = 24000;
    const revenueGenerated = usageCount * averageBasket;
    const discountGiven = Math.max(discount * usageCount, Math.round(revenueGenerated * (discountPercent / 100) * 0.28));
    const grossProfit = Math.round(revenueGenerated * 0.28 - discountGiven);
    const marginImpact = Math.max(-35, Math.min(8, margin - 18 - stackingCount * 0.8));
    const stockMovement = Math.round(usageCount * (type === "buy_x_get_y" ? 2.2 : 1.2));
    const riskLevel = grossProfit < 0 || margin < 5 ? "High" : margin < 12 || stackingCount > 5 ? "Medium" : "Low";
    return {
        customersReached: reach,
        discountGiven,
        grossProfit,
        marginImpact,
        revenueGenerated,
        riskLevel,
        stockMovement,
        usageCount,
    };
}
function priorityLabel(priority: number) {
    if (priority <= 20) {
        return {
            label: t("priority"),
            tooltip: t("subtitle"),
        };
    }
    if (priority <= 60) {
        return {
            label: t("priority"),
            tooltip: t("subtitle"),
        };
    }
    return {
        label: t("priority"),
        tooltip: t("subtitle"),
    };
}
function localIsoDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function defaultPromotionStartDate() {
    return localIsoDate(new Date());
}
function defaultPromotionEndDate() {
    const end = new Date();
    end.setDate(end.getDate() + 30);
    return localIsoDate(end);
}
function daysBetween(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00`).getTime();
    const end = new Date(`${endDate}T00:00:00`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end))
        return 1;
    return Math.max(1, Math.ceil((end - start) / 86400000) + 1);
}
