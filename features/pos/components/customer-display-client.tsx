"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useState } from "react";
import { CreditCard, Gift, QrCode, ReceiptText, Sparkles, Trophy } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { formatLak } from "@/features/pos/format";
import type { PosDisplayState } from "@/features/pos/types";
import { CUSTOMER_DISPLAY_TEMPLATES, DEFAULT_CUSTOMER_DISPLAY_SETTINGS, readCustomerDisplaySettingsFromStorage, type CustomerDisplayMedia, type CustomerDisplaySettings, type CustomerDisplayTemplate, } from "@/features/pos/customer-display-settings";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage } from "@/lib/demo/storage";
const POS_DISPLAY_KEY = DemoStorageKeys.customerDisplayState;
const emptyState: PosDisplayState = {
    appliedPromotions: [],
    customer: null,
    displayMode: "advertising",
    items: [],
    membershipDiscountLak: 0,
    membershipPoints: 0,
    membershipStatus: "Guest",
    pointsEarned: 0,
    promotionDiscountLak: 0,
    selectedQrBank: null,
    storeLogoUrl: null,
    subtotalLak: 0,
    totalLak: 0,
};
const demoCheckoutState: PosDisplayState = {
    appliedPromotions: [t("ui.10.student.member.discount"), "Buy 2 Get 1 on selected drinks"],
    customer: {
        customerCode: "CUS-001",
        discountPercent: 10,
        id: "cus-demo",
        membershipExpiry: "2026-12-31",
        membershipNumber: "MEM-001",
        membershipStatus: "Active",
        membershipType: "Yearly",
        name: "Somchai Phouthavong",
        phone: "02055551234",
        pointsBalance: 1280,
    },
    displayMode: "checkout",
    items: [
        demoCartItem("p1", "Drinking Water 500ml", "DRK-WAT-BTL-500", 2, 6000),
        demoCartItem("p2", "Pepsi Can", "DRK-PEP-CAN-001", 1, 8000),
        demoCartItem("p3", "Instant Noodles Cup", "FD-NDL-CUP-001", 3, 9000),
        demoCartItem("p4", "Sandwich Bread", "BKY-BRD-001", 1, 12000),
    ],
    membershipDiscountLak: 800,
    membershipPoints: 1280,
    membershipStatus: "Yearly Active",
    pointsEarned: 4,
    promotionDiscountLak: 3000,
    selectedQrBank: {
        accountName: "GO BOX",
        accountNumber: "010-12-00-12345678",
        bankName: "BCEL",
        id: "qr-bcel",
    },
    storeLogoUrl: null,
    subtotalLak: 74000,
    totalLak: 70200,
};
export function CustomerDisplayClient() {
    const [displayState, setDisplayState] = useState<PosDisplayState>(emptyState);
    const [settings, setSettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    const [slideIndex, setSlideIndex] = useState(0);
    useEffect(() => {
        function readState() {
            setSettings(readCustomerDisplaySettingsFromStorage());
            const storedState = readJsonFromStorage<PosDisplayState | null>(POS_DISPLAY_KEY, null);
            if (!storedState) {
                setDisplayState(emptyState);
                return;
            }
            setDisplayState({ ...emptyState, ...storedState });
        }
        readState();
        const interval = window.setInterval(readState, 1000);
        window.addEventListener("storage", readState);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("storage", readState);
        };
    }, []);
    useEffect(() => {
        const interval = window.setInterval(() => setSlideIndex((current) => current + 1), 5000);
        return () => window.clearInterval(interval);
    }, []);
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const searchTemplate = params?.get("template") ?? null;
    const demoMode = process.env.NEXT_PUBLIC_DEV_DEBUG === "true" && params?.get("demo") === "checkout";
    const template = CUSTOMER_DISPLAY_TEMPLATES.some((item) => item.id === searchTemplate)
        ? searchTemplate as CustomerDisplayTemplate
        : settings.template;
    const effectiveDisplayState = demoMode ? demoCheckoutState : displayState;
    const effectiveSettings = demoMode ? { ...settings, template } : settings;
    const hasActiveSale = effectiveDisplayState.items.length > 0 && effectiveDisplayState.displayMode !== "advertising";
    const showThankYou = effectiveDisplayState.displayMode === "thank_you";
    if (showThankYou) {
        return <ThankYouScreen displayState={effectiveDisplayState} settings={effectiveSettings}/>;
    }
    if (!hasActiveSale) {
        return <AdvertisingMode settings={effectiveSettings} slideIndex={slideIndex} template={template}/>;
    }
    if (template === "vip_membership") {
        return <VipMembershipTemplate displayState={effectiveDisplayState} settings={effectiveSettings} slideIndex={slideIndex}/>;
    }
    if (template === "qr_focus") {
        return <CheckoutTemplate displayState={effectiveDisplayState} qrFocus settings={effectiveSettings} slideIndex={slideIndex} template={template}/>;
    }
    if (template === "ads_checkout") {
        return <CheckoutTemplate adsFocus displayState={effectiveDisplayState} settings={effectiveSettings} slideIndex={slideIndex} template={template}/>;
    }
    return <CheckoutTemplate displayState={effectiveDisplayState} settings={effectiveSettings} slideIndex={slideIndex} template={template}/>;
}
function AdvertisingMode({ settings, slideIndex, template, }: {
    settings: CustomerDisplaySettings;
    slideIndex: number;
    template: CustomerDisplayTemplate;
}) {
    const slide = getActiveSlide(settings, slideIndex);
    const isFullPromotion = template === "fullscreen_promotion";
    return (<main className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#071014] text-white">
      <div className={cn("grid h-full min-h-0", isFullPromotion ? "place-items-center p-4" : "grid-rows-[auto_minmax(0,1fr)_auto] gap-4 p-4")}>
        {!isFullPromotion ? (<header className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <LogoContainer logoUrl={null} size={64}/>
              <div>
                <div className="text-3xl font-black tracking-normal">EGO POS</div>
                <div className="text-base text-white">{t("ui.simple.smart.fast.for.every.business")}</div>
              </div>
            </div>
            <div className="rounded-full border border-cyan-300/50 px-4 py-2 text-base font-semibold text-cyan-100">
              Customer Display
            </div>
          </header>) : null}

        <section className="mx-auto grid min-h-0 w-full max-w-7xl place-items-center overflow-hidden">
          <SlideContent slide={slide} large/>
        </section>

        {!isFullPromotion ? (<footer className="grid gap-3 md:grid-cols-3">
            {settings.promotionMessages.slice(0, 3).map((message) => (<div className="rounded-2xl border border-green-300/30 bg-green-400/15 p-4 text-lg font-black text-green-100 backdrop-blur" key={message}>
                {message}
              </div>))}
          </footer>) : null}
      </div>
    </main>);
}
function CheckoutTemplate({ adsFocus = false, displayState, qrFocus = false, settings, slideIndex, template, }: {
    adsFocus?: boolean;
    displayState: PosDisplayState;
    qrFocus?: boolean;
    settings: CustomerDisplaySettings;
    slideIndex: number;
    template: CustomerDisplayTemplate;
}) {
    return (<main className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#071014] p-3 text-white">
      <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(340px,0.9fr)_minmax(500px,1.1fr)]">
        <section className={cn("grid min-h-0 gap-3", qrFocus ? t("ui.grid.rows.minmax.0.1.2fr.minmax.0.0.8fr") : t("ui.grid.rows.minmax.0.1.15fr.minmax.0.0.85fr"))}>
          <QrDisplay displayState={displayState} qrFocus={qrFocus}/>
          <PromotionPanel adsFocus={adsFocus || template === "fullscreen_promotion"} settings={settings} slideIndex={slideIndex}/>
        </section>

        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,0.88fr)] gap-3">
          <ItemsPanel displayState={displayState}/>
          <TotalsPanel displayState={displayState}/>
        </section>
      </div>
    </main>);
}
function VipMembershipTemplate({ displayState, settings, slideIndex, }: {
    displayState: PosDisplayState;
    settings: CustomerDisplaySettings;
    slideIndex: number;
}) {
    return (<main className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#080b18] p-3 text-white">
      <div className="grid h-full min-h-0 gap-3 lg:grid-cols-[minmax(340px,0.8fr)_minmax(500px,1.2fr)]">
        <section className="grid min-h-0 grid-rows-[minmax(0,1.35fr)_minmax(0,0.65fr)] gap-3">
          <div className="min-h-0 overflow-hidden rounded-3xl border border-purple-300/30 bg-purple-400/10 p-4 shadow-2xl">
            <div className="flex items-center gap-3 text-purple-100">
              <Trophy className="size-9" aria-hidden="true"/>
              <div>
                <div className="text-base font-semibold text-cyan-100">Member</div>
                <div className="text-[clamp(1.5rem,2.4vw,2.5rem)] font-black leading-tight">{displayState.customer?.name ?? "Guest"}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <CustomerMetric label="Membership Type" value={displayState.customer?.membershipType ?? "Guest"}/>
              <CustomerMetric label="Status" value={displayState.membershipStatus}/>
              <CustomerMetric label="Points Balance" value={String(displayState.membershipPoints)}/>
              <CustomerMetric label="Points Earned Today" value={`+${displayState.pointsEarned ?? 0}`}/>
              <CustomerMetric label="Discount Received" value={`${formatLak((displayState.membershipDiscountLak ?? 0) + (displayState.promotionDiscountLak ?? 0))} LAK`}/>
            </div>
          </div>
          <PromotionPanel settings={settings} slideIndex={slideIndex}/>
        </section>
        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,0.88fr)] gap-3">
          <ItemsPanel displayState={displayState}/>
          <TotalsPanel displayState={displayState}/>
        </section>
      </div>
    </main>);
}
function QrDisplay({ displayState, qrFocus }: {
    displayState: PosDisplayState;
    qrFocus?: boolean;
}) {
    const qrBank = displayState.selectedQrBank;
    return (<section className="min-h-0 overflow-hidden rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4 shadow-2xl">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CreditCard className="size-8 text-cyan-200" aria-hidden="true"/>
          <div>
            <h1 className="text-[clamp(1.5rem,2.2vw,2rem)] font-black">Scan to Pay</h1>
            <p className="text-base text-cyan-100">{qrBank ? `${qrBank.bankName} selected by cashier` : "Cashier will select QR payment"}</p>
          </div>
        </div>
        <QrCode className="size-9 text-cyan-100" aria-hidden="true"/>
      </div>

      <div className="mt-3 grid place-items-center">
        {qrBank?.qrImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={cn("aspect-square rounded-3xl bg-white object-contain p-4", qrFocus ? t("ui.w.min.34vh.340px") : t("ui.w.min.31vh.320px"))} src={qrBank.qrImageUrl} alt={`${qrBank.bankName} QR`}/>) : (<div className={cn("grid aspect-square place-items-center rounded-3xl border-4 border-dashed border-cyan-200/50 bg-white/10 text-center", qrFocus ? t("ui.w.min.34vh.340px") : t("ui.w.min.31vh.320px"))}>
            <div>
              <QrCode className="mx-auto size-16 text-cyan-100" aria-hidden="true"/>
              <div className="mt-3 text-3xl font-black">{qrBank?.bankName ?? "QR"}</div>
            </div>
          </div>)}
      </div>
      {qrBank ? (<div className="mt-3 text-center">
          <div className="text-2xl font-black text-white">{qrBank.bankName}</div>
          <div className="text-base text-cyan-100">{qrBank.accountName}</div>
        </div>) : null}
    </section>);
}
function PromotionPanel({ adsFocus, settings, slideIndex, }: {
    adsFocus?: boolean;
    settings: CustomerDisplaySettings;
    slideIndex: number;
}) {
    const slide = getActiveSlide(settings, slideIndex);
    return (<section className={cn("min-h-0 overflow-hidden rounded-3xl border border-green-300/20 bg-green-400/10 shadow-2xl", adsFocus && t("ui.border.green.300.35"))}>
      <SlideContent slide={slide}/>
    </section>);
}
function ItemsPanel({ displayState }: {
    displayState: PosDisplayState;
}) {
    const visibleItems = displayState.items.slice(0, 4);
    const hiddenItemCount = Math.max(displayState.items.length - visibleItems.length, 0);
    return (<section className="min-h-0 overflow-hidden rounded-3xl border border-white/15 bg-white/[0.08] p-4 shadow-2xl">
      <div className="mb-2 flex items-center gap-3">
        <ReceiptText className="size-7 text-cyan-100" aria-hidden="true"/>
        <h2 className="text-[clamp(1.4rem,2vw,2rem)] font-black">Purchased Items</h2>
      </div>
      <div className="overflow-hidden">
        <div className="divide-y divide-white/10">
          {visibleItems.map((item) => (<div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5" key={item.id}>
              <div className="min-w-0">
                <div className="truncate text-[clamp(1.1rem,1.7vw,1.65rem)] font-bold text-white">{item.nameEn}</div>
                <div className="text-base text-white">{formatLak(item.priceLak)} LAK each</div>
              </div>
              <div className="text-[clamp(1.4rem,2vw,2rem)] font-black text-white">x{item.quantity}</div>
              <div className="min-w-32 text-right text-[clamp(1.4rem,2vw,2rem)] font-black text-white">{formatLak(item.priceLak * item.quantity)}</div>
            </div>))}
        </div>
        {hiddenItemCount > 0 ? (<div className="mt-2 rounded-2xl border border-orange-300/30 bg-orange-400/15 px-4 py-2 text-center text-lg font-black text-orange-100">
            +{hiddenItemCount} more items
          </div>) : null}
      </div>
    </section>);
}
function TotalsPanel({ displayState }: {
    displayState: PosDisplayState;
}) {
    const subtotal = displayState.subtotalLak ?? displayState.items.reduce((total, item) => total + item.priceLak * item.quantity, 0);
    const promotionDiscount = displayState.promotionDiscountLak ?? 0;
    const membershipDiscount = displayState.membershipDiscountLak ?? 0;
    const pointsEarned = displayState.pointsEarned ?? Math.floor(displayState.totalLak / 10000);
    return (<section className="min-h-0 overflow-hidden rounded-3xl border border-cyan-300/30 bg-[#0c2026] p-4 shadow-2xl">
      <div className="grid gap-1.5 text-[clamp(0.95rem,1.4vw,1.2rem)]">
        <TotalLine label="Subtotal" value={`${formatLak(subtotal)} LAK`}/>
        <TotalLine label="Promotion Discount" value={`-${formatLak(promotionDiscount)} LAK`}/>
        <TotalLine label="Membership Discount" value={`-${formatLak(membershipDiscount)} LAK`}/>
        <TotalLine label="Points Earned" value={`+${pointsEarned}`}/>
      </div>
      <div className="mt-2.5 rounded-3xl bg-[#FFD700] p-3 text-[#071014] shadow-[0_0_42px_rgba(255,215,0,0.28)]">
        <div className="text-[clamp(0.95rem,1.4vw,1.25rem)] font-black uppercase">Grand Total</div>
        <div className="mt-1 text-[clamp(2.4rem,4.6vw,4.4rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
      </div>
    </section>);
}
function ThankYouScreen({ displayState, settings }: {
    displayState: PosDisplayState;
    settings: CustomerDisplaySettings;
}) {
    return (<main className="fixed inset-0 grid h-screen w-screen place-items-center overflow-hidden bg-[#071014] p-6 text-center text-white">
      <div className="w-full max-w-4xl rounded-[2rem] border border-cyan-300/30 bg-white/10 p-8 shadow-2xl">
        <Sparkles className="mx-auto size-16 text-cyan-200" aria-hidden="true"/>
        <h1 className="mt-4 text-[clamp(4rem,8vw,7rem)] font-black leading-none">Thank You</h1>
        <p className="mt-4 text-3xl text-white">{t("ui.your.purchase.is.complete")}</p>
        <div className="mx-auto mt-6 max-w-xl rounded-3xl bg-[#FFD700] p-5 text-[#071014]">
          <div className="text-xl font-bold">Grand Total</div>
          <div className="text-[clamp(3rem,5vw,5rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
        </div>
        <p className="mt-6 text-lg text-white">
          Returning to promotions in {settings.autoReturnSeconds}{t("ui.seconds")}</p>
      </div>
    </main>);
}
type CustomerDisplaySlide = CustomerDisplayMedia | {
    message: string;
    type: "message";
};
function SlideContent({ large = false, slide }: {
    large?: boolean;
    slide: CustomerDisplaySlide;
}) {
    if (slide.type === "video") {
        return (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video autoPlay className="h-full min-h-0 w-full object-cover" loop muted playsInline src={slide.url}/>);
    }
    if (slide.type === "image") {
        return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="h-full min-h-0 w-full object-cover" src={slide.url} alt={slide.name}/>);
    }
    if ("message" in slide) {
        return (<div className="grid h-full min-h-0 w-full place-items-center bg-gradient-to-br from-green-500/30 via-cyan-500/20 to-yellow-400/20 p-5 text-center">
      <div>
        <Gift className={cn("mx-auto text-green-100", large ? "size-16" : "size-12")} aria-hidden="true"/>
        <div className={cn("mt-3 font-black leading-tight text-white", large ? t("ui.text.clamp.3rem.6vw.6rem") : t("ui.text.clamp.1.8rem.3.2vw.3.2rem"))}>{slide.message}</div>
        <div className="mx-auto mt-3 max-w-2xl text-[clamp(1rem,1.7vw,1.55rem)] font-semibold text-green-100">{t("ui.promotions.new.products.and.store.announceme")}</div>
      </div>
    </div>);
    }
    return null;
}
function CustomerMetric({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-2.5">
      <div className="text-sm text-cyan-100">{label}</div>
      <div className="mt-0.5 text-[clamp(1.1rem,2vw,1.55rem)] font-black text-white">{value}</div>
    </div>);
}
function TotalLine({ label, value }: {
    label: string;
    value: string;
}) {
    const isPromotion = label.toLowerCase().includes("promotion");
    const isMembership = label.toLowerCase().includes("membership") || label.toLowerCase().includes("points");
    return (<div className="flex items-center justify-between gap-4">
      <span className={cn("font-semibold", isPromotion ? "text-green-100" : isMembership ? "text-cyan-100" : "text-white")}>{label}</span>
      <span className={cn("font-black", isPromotion ? "text-green-100" : isMembership ? "text-cyan-100" : "text-white")}>{value}</span>
    </div>);
}
function getActiveSlide(settings: CustomerDisplaySettings, slideIndex: number) {
    if (settings.media.length > 0) {
        return settings.media[slideIndex % settings.media.length];
    }
    const messages = settings.promotionMessages.length > 0
        ? settings.promotionMessages
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages;
    return {
        message: messages[slideIndex % messages.length],
        type: "message" as const,
    };
}
function demoCartItem(id: string, nameEn: string, sku: string, quantity: number, priceLak: number) {
    return {
        barcode: sku,
        categoryName: "Demo",
        id,
        imageKey: "demo",
        nameEn,
        nameLo: nameEn,
        priceLak,
        quantity,
        retailPriceLak: priceLak,
        sku,
        stockQty: 100,
        unitName: "Unit",
    };
}
