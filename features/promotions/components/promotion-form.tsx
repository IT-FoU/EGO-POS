"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, CheckCircle2, Gift, QrCode, Save, Search, ShieldAlert, SlidersHorizontal, Sparkles, XCircle, type LucideIcon, } from "lucide-react";
import type { MembershipLevel } from "@/features/customers/types";
import type { Category, Product } from "@/features/products/types";
import { formatLak, formatPromotionType } from "@/features/promotions/format";
import type { Promotion, PromotionType } from "@/features/promotions/types";
import { createPromotionAction, updatePromotionAction } from "@/features/promotions/actions";
const wizardSteps = [
    "Basic Info",
    "Discount Rules",
    "Targeting",
    "Protection",
    "Summary",
];
const templates = [
    { label: "Percentage Discount", type: "percentage", note: t("ui.reduce.selected.items.or.bill.by.a.percent") },
    { label: "Fixed Amount Discount", type: "fixed_amount", note: t("ui.take.a.fixed.lak.amount.off") },
    { label: "Buy 1 Get 1", type: "buy_x_get_y", note: t("ui.buy.one.item.and.get.one.free") },
    { label: "Buy 2 Get 1", type: "buy_x_get_y", note: t("ui.buy.two.items.and.get.one.free") },
    { label: "Bundle", type: "combo_set", note: t("ui.sell.selected.products.together.for.one.pric") },
    { label: t("ui.spend.save"), type: "fixed_amount", note: t("ui.spend.over.a.threshold.to.save") },
    { label: "Free Gift", type: "buy_x_get_y", note: t("ui.add.a.gift.product.after.rules.match") },
    { label: "Coupon Promotion", type: "fixed_amount", note: t("ui.manual.generated.or.qr.coupon") },
    { label: "Point Redemption", type: "member_discount", note: t("ui.redeem.loyalty.points.for.value") },
    { label: "Happy Hour", type: "percentage", note: t("ui.limited.hours.and.repeat.days") },
    { label: "Flash Sale", type: "percentage", note: t("ui.short.date.time.campaign.with.countdown") },
    { label: "Near Expiry Clearance", type: "percentage", note: t("ui.move.stock.before.expiry") },
    { label: "Slow Moving Clearance", type: "percentage", note: t("ui.clear.products.with.low.sales.velocity") },
    { label: t("ui.mix.match"), type: "combo_set", note: t("ui.buy.n.items.from.a.group.for.fixed.price") },
    { label: "Tiered Discount", type: "percentage", note: t("ui.more.spend.or.quantity.gets.more.savings") },
    { label: "Member Discount", type: "member_discount", note: t("ui.member.only.campaign") },
] satisfies Array<{
    label: string;
    type: PromotionType;
    note: string;
}>;
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
export function PromotionForm({ categories, initialPromotion, membershipLevels, products, }: {
    categories: Category[];
    initialPromotion?: Promotion;
    membershipLevels: MembershipLevel[];
    products: Product[];
}) {
    const router = useRouter();
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
    const [template, setTemplate] = useState(templates[0].label);
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
            issues.push({ level: "red", text: t("ui.missing.promotion.name") });
        if (!type)
            issues.push({ level: "red", text: t("ui.missing.promotion.type") });
        if (discount <= 0 && !["buy_x_get_y", "combo_set"].includes(type))
            issues.push({ level: "red", text: t("ui.missing.discount.value") });
        if (selectedProductIds.length === 0 && selectedCategoryIds.length === 0)
            issues.push({ level: "red", text: t("ui.missing.target") });
        if (!startDate || !endDate)
            issues.push({ level: "red", text: t("ui.missing.date") });
        if (hasProfitRisk)
            issues.push({ level: "red", text: t("ui.negative.profit.or.below.minimum.margin") });
        if (template.includes("Coupon") && !couponCode.trim())
            issues.push({ level: "red", text: t("ui.coupon.missing.code") });
        if (type === "buy_x_get_y" && (buyQty <= 0 || getQty <= 0))
            issues.push({ level: "red", text: t("ui.buy.x.get.y.missing.product.or.quantity") });
        if (approvalRequired || hasProfitRisk)
            issues.push({ level: "yellow", text: t("ui.approval.required.before.activation") });
        return issues;
    }, [approvalRequired, buyQty, couponCode, discount, endDate, getQty, hasProfitRisk, name, selectedCategoryIds.length, selectedProductIds.length, startDate, template, type]);
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
    function selectTemplate(label: string) {
        const selectedTemplate = templates.find((item) => item.label === label);
        if (!selectedTemplate)
            return;
        setTemplate(selectedTemplate.label);
        setType(selectedTemplate.type);
        if (selectedTemplate.label === "Buy 1 Get 1") {
            setBuyQty(1);
            setGetQty(1);
        }
        if (selectedTemplate.label === "Buy 2 Get 1") {
            setBuyQty(2);
            setGetQty(1);
        }
        if (selectedTemplate.label.includes("Coupon")) {
            setCouponCode("SAVE10");
        }
        setMessage(`${selectedTemplate.label} template applied.`);
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
                setMessage(result.error ?? "Promotion save failed.");
                return;
            }
            setMessage(mode === "draft"
                ? "Promotion draft saved."
                : mode === "approval"
                    ? "Promotion submitted for approval."
                    : "Promotion saved and activated.");
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
          Back to promotions
        </Link>
        <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Gift aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{initialPromotion ? "Edit Promotion" : "Create Promotion"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.five.step.wizard.for.campaign.setup.targetin")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton label="Save Draft" icon={Save} onClick={() => handleSave("draft")}/>
            <ActionButton label="Submit for Approval" icon={ShieldAlert} onClick={() => handleSave("approval")}/>
            <ActionButton label={t("ui.save.activate")} icon={CheckCircle2} primary onClick={() => handleSave("activate")} disabled={hasProfitRisk || isPending}/>
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
      {step === 0 ? (<WizardCard icon={Sparkles} title={t("ui.step.1.basic.info.template")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Promotion Code">
              <div className="flex gap-2">
                <select className="field-input w-32" value={codeMode} onChange={(event) => setCodeMode(event.target.value as "auto" | "manual")}>
                  <option value="auto">Auto</option>
                  <option value="manual">Manual</option>
                </select>
                <input className="field-input font-mono" value={code} onChange={(event) => setCode(event.target.value)} disabled={codeMode === "auto"}/>
              </div>
            </Field>
            <Field label="Promotion Name">
              <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="June drink campaign"/>
            </Field>
            <Field label="Status">
              <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                {["draft", "pending_approval", "approved", "rejected", "active", "inactive", "scheduled", "expired", "archived"].map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <input className="field-input" type="range" min="1" max="100" value={priority} onChange={(event) => setPriority(Number(event.target.value))}/>
              <div className="mt-2 rounded-md border border-border bg-background p-3">
                <div className="text-sm font-semibold">
                  Priority {priority} - {priorityInfo.label}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("ui.lower.numbers.apply.first.in.stack.rules")}</p>
                <p className="mt-2 text-xs text-muted-foreground" title={t("ui.low.normal.campaign.medium.common.discount.h")}>
                  {priorityInfo.tooltip}
                </p>
              </div>
            </Field>
            <div className="lg:col-span-2">
              <Field label="Description">
                <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={description} onChange={(event) => setDescription(event.target.value)}/>
              </Field>
            </div>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {templates.map((item) => (<button className={template === item.label ? "rounded-lg border border-primary bg-primary/10 p-4 text-left" : "rounded-lg border border-border bg-background p-4 text-left hover:border-primary"} key={item.label} type="button" onClick={() => selectTemplate(item.label)}>
                <div className="font-semibold">{item.label}</div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">{item.note}</div>
              </button>))}
          </div>
        </WizardCard>) : null}

      {step === 1 ? (<WizardCard icon={Gift} title={t("ui.step.2.promotion.type.discount.rules")}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Promotion Type">
              <select className="field-input" value={type} onChange={(event) => setType(event.target.value as PromotionType)}>
                <option value="percentage">Percentage Discount</option>
                <option value="fixed_amount">Fixed Amount Discount</option>
                <option value="buy_x_get_y">Buy X Get Y</option>
                <option value="combo_set">{t("ui.bundle.mix.match")}</option>
                <option value="member_discount">Member / Point Redemption</option>
              </select>
            </Field>
            {(type === "percentage" || type === "member_discount") ? (<>
                <NumberField label={t("ui.discount.2")} value={discountPercent} onChange={setDiscountPercent}/>
                <NumberField label="Max discount amount" value={discountAmount} onChange={setDiscountAmount}/>
              </>) : null}
            {type === "fixed_amount" ? <NumberField label="Discount amount LAK" value={discountAmount} onChange={setDiscountAmount}/> : null}
            {type === "buy_x_get_y" ? (<>
                <NumberField label="Buy quantity" value={buyQty} onChange={setBuyQty}/>
                <NumberField label="Get quantity" value={getQty} onChange={setGetQty}/>
                <button className="h-11 self-end rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSelector("products")}>Select free product</button>
              </>) : null}
            {type === "combo_set" ? (<>
                <NumberField label="Bundle price LAK" value={bundlePrice} onChange={setBundlePrice}/>
                <button className="h-11 self-end rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSelector("products")}>Select bundle products</button>
              </>) : null}
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Coupon rules">
              <div className="grid gap-3">
                <input className="field-input font-mono" value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Manual or generated code"/>
                <div className="flex flex-wrap gap-2">
                  {["Single use", "Multi use", "Member only", "Usage limit per customer", "Total usage limit"].map((rule) => <TogglePill key={rule} label={rule}/>)}
                  <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setShowQr(true)}>QR coupon preview</button>
                </div>
              </div>
            </Panel>
            <Panel title="Time-based rules">
              <div className="grid gap-3 md:grid-cols-2">
                <input className="field-input" type="time" defaultValue="08:00"/>
                <input className="field-input" type="time" defaultValue="18:00"/>
                <TogglePill label="Countdown display"/>
                <TogglePill label="Repeat weekdays"/>
              </div>
            </Panel>
          </div>
        </WizardCard>) : null}

      {step === 2 ? (<WizardCard icon={CalendarDays} title={t("ui.step.3.targeting.schedule")}>
          <div className="grid gap-4 xl:grid-cols-2">
            <Panel title="Apply To">
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                ["Entire Store", null],
                ["Selected Products", "products"],
                ["Selected Categories", "categories"],
                ["Selected Brands", "brands"],
                ["Selected Branches", "branches"],
                ["Selected Warehouses", "warehouses"],
            ].map(([label, kind]) => (<button className="rounded-md border border-border bg-background p-3 text-left text-sm font-semibold hover:border-primary" key={label} type="button" onClick={() => kind ? setSelector(kind as SelectorKind) : setMessage(t("ui.entire.store.target.selected"))}>{label}</button>))}
              </div>
            </Panel>
            <Panel title="Customer Target">
              <div className="grid gap-2 sm:grid-cols-2">
                {["Everyone", "Members Only", "Student Members", "Standard", "Silver", "Gold", "Platinum", "New Members", "VIP Members", "Custom Group"].map((target) => (<button className={customerTarget === target ? "rounded-md border border-primary bg-primary/10 p-3 text-left text-sm font-semibold" : "rounded-md border border-border bg-background p-3 text-left text-sm font-semibold hover:border-primary"} key={target} type="button" onClick={() => setCustomerTarget(target)}>{target}</button>))}
              </div>
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            <Field label="Start Date"><input className="field-input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)}/></Field>
            <Field label="End Date"><input className="field-input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)}/></Field>
            <Field label="Start Time"><input className="field-input" type="time" defaultValue="08:00" disabled={allDay}/></Field>
            <Field label="End Time"><input className="field-input" type="time" defaultValue="22:00" disabled={allDay}/></Field>
            <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold"><input className="size-5 accent-[var(--primary)]" type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)}/>All Day</label>
            {["Daily", "Weekly", "Monthly", "Custom weekdays"].map((repeat) => <TogglePill key={repeat} label={repeat}/>)}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {["Limit per customer", "Limit per day", "Limit per bill", "Total usage limit"].map((label) => <NumberField key={label} label={label} value={1} onChange={() => undefined}/>)}
          </div>
        </WizardCard>) : null}

      {step === 3 ? (<WizardCard icon={ShieldAlert} title={t("ui.step.4.stacking.approval.profit.protection")}>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Allow stack with">
              <div className="grid gap-2 sm:grid-cols-2">
                {stackOptions.map((option) => (<label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={option}>
                    <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={stacking.includes(option)} onChange={() => toggleStack(option)}/>
                    {option}
                  </label>))}
              </div>
            </Panel>
            <Panel title="Stack limits and exclusions">
              <div className="grid gap-3">
                <NumberField label={t("ui.max.discount.per.item")} value={20} onChange={() => undefined}/>
                <NumberField label="Max discount per bill LAK" value={150000} onChange={() => undefined}/>
                <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setMessage(t("ui.excluded.combination.added.in.demo.mode"))}>Add excluded combination</button>
              </div>
            </Panel>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Metric label="Cost" value={`${formatLak(estimatedCost)} LAK`}/>
            <Metric label="Original price" value={`${formatLak(subtotal)} LAK`}/>
            <Metric label="Discount amount" value={`-${formatLak(discount)} LAK`} danger/>
            <Metric label="Final price" value={`${formatLak(finalPrice)} LAK`}/>
            <Metric label="Estimated profit" value={`${formatLak(estimatedProfit)} LAK`} danger={estimatedProfit < 0}/>
            <Metric label="Profit margin" value={`${margin.toFixed(1)}%`} danger={margin < minimumMargin}/>
          </div>
          {hasProfitRisk ? (<div className="mt-5 rounded-md border border-danger/40 bg-danger/10 p-4 text-sm font-semibold text-danger">{t("ui.this.promotion.causes.negative.profit.please")}</div>) : null}
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Panel title="Auto Fix Suggestions">
              <div className="grid gap-2">
                {["Reduce discount amount", t("ui.reduce.discount"), "Disable lower-priority stacking", "Limit to selected products", "Limit to selected members", "Change priority", "Request owner/admin approval"].map((item) => (<button className="rounded-md border border-border bg-background p-3 text-left text-sm hover:border-primary" type="button" key={item} onClick={() => setMessage(`${item} suggestion selected.`)}>{item}</button>))}
              </div>
            </Panel>
            <Panel title="Approval">
              <label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold">
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)}/>
                Require approval
              </label>
              <textarea className="mt-3 min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm" placeholder="Approval notes"/>
              <p className="mt-3 text-sm text-muted-foreground">{t("ui.high.risk.promotions.automatically.require.o")}</p>
            </Panel>
          </div>
        </WizardCard>) : null}

      {step === 4 ? (<WizardCard icon={CheckCircle2} title={t("ui.step.5.final.summary.validation")}>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <DataSummary rows={[
                ["Promotion code", code],
                ["Promotion name", name || "-"],
                ["Type", formatPromotionType(type)],
                ["Template", template],
                ["Target products/categories", `${selectedProductIds.length} products / ${selectedCategoryIds.length} categories`],
                ["Branches/warehouses", "Main Branch / Main Warehouse"],
                ["Customer target", customerTarget],
                ["Schedule", `${startDate} to ${endDate}`],
                ["Stacking rules", stacking.join(", ")],
                ["Coupon rules", couponCode || "None"],
                ["Profit result", `${formatLak(estimatedProfit)} LAK / ${margin.toFixed(1)}%`],
                ["Approval", approvalRequired || hasProfitRisk ? "Required" : "Not required"],
            ]}/>
            </div>
            <aside className="rounded-lg border border-border bg-background p-5">
              <h3 className="text-lg font-semibold">Validation Panel</h3>
              <div className="mt-4 flex flex-col gap-3">
                {validationIssues.length === 0 ? (<div className="rounded-md border border-success/40 bg-success/10 p-3 text-sm font-semibold text-success">Green: Ready to save</div>) : validationIssues.map((issue) => (<div className={issue.level === "red" ? "rounded-md border border-danger/40 bg-danger/10 p-3 text-sm font-semibold text-danger" : "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm font-semibold text-warning"} key={issue.text}>
                    {issue.level === "red" ? "Red: Fix required - " : "Yellow: Approval required - "}{issue.text}
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
        <button className="h-11 rounded-md border border-border px-5 text-sm font-semibold disabled:opacity-40" type="button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Back</button>
        <div className="flex flex-wrap gap-2">
          <button className="h-11 rounded-md border border-border px-5 text-sm font-semibold" type="button" onClick={() => handleSave("draft")}>Save Draft</button>
          <button className="h-11 rounded-md border border-warning px-5 text-sm font-semibold text-warning" type="button" onClick={() => handleSave("approval")}>Submit for Approval</button>
          {step < wizardSteps.length - 1 ? (<button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setStep((current) => Math.min(wizardSteps.length - 1, current + 1))}>Next</button>) : (<button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="button" disabled={hasProfitRisk || isPending} onClick={() => handleSave("activate")}>{t("ui.save.activate")}</button>)}
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
        ? t("ui.blocked.this.promotion.causes.negative.profi") : belowMinimumMargin
        ? t("ui.approval.required.margin.below.configured.th") : t("ui.ready.promotion.keeps.profit.above.minimum.m");
    return (<section className={compact ? "min-w-0 rounded-lg border border-border bg-card p-4" : "min-w-0 rounded-lg border border-border bg-card p-5"}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Live POS Preview</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.updates.immediately.from.the.wizard.settings")}</p>
        </div>
        {!compact ? (<button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>) : null}
      </div>
      {!collapsed ? (<div className="mt-4 flex flex-col gap-4">
          {!compact ? (<div className="rounded-md border border-border bg-background p-3">
              <div className="text-sm font-semibold">Cart Items</div>
              <div className="mt-3 flex flex-col gap-3">
                {preview.items.map((item) => (<div className="rounded-md border border-border bg-card p-3 text-sm" key={item.sku}>
                    <div className="font-semibold">{item.name} / {item.sku}</div>
                    <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
                      <span>{t("ui.qty")}{item.quantity}</span>
                      <span>Original price: {formatLak(item.price)} LAK{item.quantity > 1 ? " each" : ""}</span>
                      <span>{t("ui.cost.2")}{formatLak(item.cost)} LAK{item.quantity > 1 ? " each" : ""}</span>
                    </div>
                  </div>))}
              </div>
            </div>) : null}

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm font-semibold">Cart Summary</div>
            <dl className="mt-3 grid gap-2 text-sm">
              {[
                ["Subtotal", preview.subtotal],
                ["Product discount", -preview.productDiscount],
                ["Bill discount", -preview.billDiscount],
                ["Coupon discount", -preview.couponDiscount],
                ["Member discount", -preview.memberDiscount],
                ["Point redemption", -preview.pointRedemption],
                ["Free gift value", -preview.freeGiftValue],
                ["Final total", preview.finalTotal],
                ["Estimated profit", preview.estimatedProfit],
            ].map(([label, value]) => (<div className="flex items-center justify-between gap-3" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className={Number(value) < 0 ? "font-semibold text-danger" : "font-semibold"}>{formatLak(Number(value))} LAK</dd>
                </div>))}
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Profit margin</dt>
                <dd className="font-semibold">{preview.margin.toFixed(1)}%</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-md border border-border bg-background p-3">
            <div className="text-sm font-semibold">Applied Promotions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {preview.appliedPromotions.map((promotion) => (<span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary" key={promotion}>{promotion}</span>))}
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
          <h3 className="text-lg font-semibold">Promotion Impact Forecast</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.mock.forecast.for.planning.before.backend.an")}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskClass}`}>
          {forecast.riskLevel} Risk
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Metric label="Customers reached" value={formatLak(forecast.customersReached)}/>
        <Metric label="Usage count" value={formatLak(forecast.usageCount)}/>
        <Metric label="Revenue generated" value={`${formatLak(forecast.revenueGenerated)} LAK`}/>
        <Metric label="Discount given" value={`${formatLak(forecast.discountGiven)} LAK`}/>
        <Metric label="Gross profit" value={`${formatLak(forecast.grossProfit)} LAK`} danger={forecast.grossProfit < 0}/>
        <Metric label="Margin impact" value={`${forecast.marginImpact.toFixed(1)}%`} danger={forecast.marginImpact < -8}/>
        <Metric label="Stock movement" value={`${formatLak(forecast.stockMovement)} units`}/>
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
    const title = `${kind[0].toUpperCase()}${kind.slice(1)} Selector`;
    const placeholderItems = kind === "brands" ? ["Coca-Cola", "Pepsi", "Lao Brewery", "Local Brand"] : kind === "branches" ? ["Main Branch", "Morning Market Branch"] : kind === "warehouses" ? ["Main Warehouse", "Cold Storage", "Branch Warehouse"] : membershipLevels.map((level) => level.name);
    const filteredProducts = products.filter((product) => [product.nameEn, product.sku, product.barcode].join(" ").toLowerCase().includes(query.toLowerCase()));
    const filteredCategories = categories.filter((category) => category.nameEn.toLowerCase().includes(query.toLowerCase()));
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{t("ui.search.select.apply.or.cancel")}</p></div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
        </div>
        <div className="p-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
            <input className="field-input pl-10" placeholder={`Search ${kind}`} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <div className="mt-5 grid max-h-[46vh] gap-3 overflow-y-auto md:grid-cols-2">
            {kind === "products" ? filteredProducts.map((product) => (<label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={product.id}>
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={productIds.includes(product.id)} onChange={() => setProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])}/>
                <span><span className="font-semibold">{product.nameEn}</span><span className="block text-xs text-muted-foreground">{product.sku}</span></span>
              </label>)) : null}
            {kind === "categories" ? filteredCategories.map((category) => (<label className="flex items-center gap-3 rounded-md border border-border bg-background p-3 text-sm" key={category.id}>
                <input className="size-5 accent-[var(--primary)]" type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => setCategoryIds((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])}/>
                <span>{category.nameEn}</span>
              </label>)) : null}
            {!["products", "categories"].includes(kind) ? placeholderItems.map((item) => <TogglePill key={item} label={item}/>) : null}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
            <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => { onSelectProducts(productIds); onSelectCategories(categoryIds); onClose(); }}>Apply Selection</button>
          </div>
        </div>
      </div>
    </div>);
}
function QrPreviewModal({ couponCode, onClose }: {
    couponCode: string;
    onClose: () => void;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-center shadow-2xl">
        <h2 className="text-xl font-semibold">Coupon QR Preview</h2>
        <div className="mx-auto mt-5 grid size-48 place-items-center rounded-lg border border-border bg-background">
          <QrCode className="size-28 text-primary" aria-hidden="true"/>
        </div>
        <p className="mt-4 font-mono text-lg font-semibold">{couponCode || "COUPON-CODE"}</p>
        <button className="mt-5 h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
      </div>
    </div>);
}
function ValidationErrorModal({ issues, onClose }: {
    issues: Array<{
        level: "red" | "yellow";
        text: string;
    }>;
    onClose: () => void;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-2xl">
        <h2 className="text-xl font-semibold">Validation Result</h2>
        <div className="mt-4 flex flex-col gap-3">
          {issues.length === 0 ? <div className="rounded-md border border-success/40 bg-success/10 p-3 text-success">{t("ui.ready.to.save")}</div> : issues.map((issue) => (<div className={issue.level === "red" ? "rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger" : "rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning"} key={issue.text}>
              {issue.text}
            </div>))}
        </div>
        <button className="mt-5 h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
      </div>
    </div>);
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
            label: "Low Priority",
            tooltip: t("ui.low.priority.normal.campaign"),
        };
    }
    if (priority <= 60) {
        return {
            label: "Medium Priority",
            tooltip: t("ui.medium.priority.common.discount"),
        };
    }
    return {
        label: "High Priority",
        tooltip: t("ui.high.priority.important.campaign.clearance.e"),
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
