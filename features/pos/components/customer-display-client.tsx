"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Gift, QrCode, ReceiptText, Sparkles, Store, Trophy } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { formatLak } from "@/features/pos/format";
import type { PosDisplayState } from "@/features/pos/types";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  readCustomerDisplaySettingsFromStorage,
  type CustomerDisplayMedia,
  type CustomerDisplaySettings,
  type CustomerDisplayTemplate,
} from "@/features/pos/customer-display-settings";
import { customerDisplayTemplateTokens, parseCustomerDisplayTemplate, type CustomerDisplayThemeTokens } from "@/features/pos/customer-display-templates";
import { customerDisplayQrStyleTokens } from "@/features/pos/customer-display-qr-style";
import { maskAccountReference } from "@/features/pos/customer-display-qr";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage } from "@/lib/demo/storage";
import { readCompanyLogoUrl } from "@/features/brand/company-logo";

const POS_DISPLAY_KEY = DemoStorageKeys.customerDisplayState;
const ThemeContext = createContext<CustomerDisplayThemeTokens>(customerDisplayTemplateTokens("ocean-blue"));

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
  showQr: false,
  storeLogoUrl: null,
  storeName: "EGO POS",
  subtotalLak: 0,
  totalLak: 0,
};

function useTheme() {
  return useContext(ThemeContext);
}

export function CustomerDisplayClient() {
  const [displayState, setDisplayState] = useState<PosDisplayState>(emptyState);
  const [settings, setSettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
  const [slideIndex, setSlideIndex] = useState(0);
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    function readState() {
      setSettings(readCustomerDisplaySettingsFromStorage());
      setLogoUrl(readCompanyLogoUrl());
      const storedState = readJsonFromStorage<PosDisplayState | null>(POS_DISPLAY_KEY, null);
      setDisplayState(storedState ? { ...emptyState, ...storedState } : emptyState);
    }
    readState();
    const interval = window.setInterval(readState, 800);
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

  useEffect(() => {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      void root.requestFullscreen().catch(() => undefined);
    }
  }, []);

  const template = parseCustomerDisplayTemplate(settings.template);
  const tokens = useMemo(() => customerDisplayTemplateTokens(template), [template]);
  const showThankYou = displayState.displayMode === "thank_you";
  const hasActiveSale = displayState.items.length > 0 && displayState.displayMode !== "advertising" && !showThankYou;
  const showQr = Boolean(displayState.showQr && displayState.selectedQrBank);
  const storeName = displayState.storeName || "EGO POS";
  const resolvedLogo = displayState.storeLogoUrl || logoUrl;

  return (
    <ThemeContext.Provider value={tokens}>
      <main className="fixed inset-0 h-[100dvh] w-screen overflow-hidden" data-cd-template={template} style={{ backgroundColor: tokens.background, color: tokens.text }}>
        {showThankYou ? (
          <ThankYouState displayState={displayState} logoUrl={resolvedLogo} settings={settings} storeName={storeName} />
        ) : hasActiveSale ? (
          <ActiveTemplate displayState={displayState} logoUrl={resolvedLogo} settings={settings} slideIndex={slideIndex} storeName={storeName} template={template} />
        ) : (
          <IdleState logoUrl={resolvedLogo} settings={settings} slideIndex={slideIndex} storeName={storeName} template={template} />
        )}
        {showQr && displayState.selectedQrBank ? (
          <QrOverlay amountLak={displayState.totalLak} bank={displayState.selectedQrBank} styleId={settings.qrDisplayStyle} />
        ) : null}
      </main>
    </ThemeContext.Provider>
  );
}

function StoreMark({ logoUrl, size, storeName }: { logoUrl?: string | null; size: number; storeName: string }) {
  return <LogoContainer alt={storeName} className="border-0 bg-transparent shadow-none" fallbackName={storeName} logoUrl={logoUrl} size={size} variant="customer" />;
}

function IdleState({ logoUrl, settings, slideIndex, storeName, template }: {
  logoUrl: string;
  settings: CustomerDisplaySettings;
  slideIndex: number;
  storeName: string;
  template: CustomerDisplayTemplate;
}) {
  const theme = useTheme();
  const slide = getActiveSlide(settings, slideIndex);
  const promoHeavy = template === "sunny-yellow" || template === "coral-minimal" || template === "bold-green";
  return (
    <div className={cn("grid h-full min-h-0", promoHeavy ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]")} style={{ gap: promoHeavy ? 0 : 8 }}>
      <header className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: theme.surface, borderBottom: `3px solid ${theme.primary}` }}>
        <StoreMark logoUrl={logoUrl} size={56} storeName={storeName} />
        <div className="min-w-0">
          <div className="truncate text-[clamp(1.4rem,3vw,2.2rem)] font-black">{storeName}</div>
          <div className="text-sm font-semibold" style={{ color: theme.secondaryText }}>Welcome</div>
        </div>
      </header>
      <section className="min-h-0 overflow-hidden">
        <SlideContent large slide={slide} />
      </section>
      {promoHeavy ? null : (
        <footer className="grid gap-2 px-3 pb-3 md:grid-cols-3">
          {settings.promotionMessages.slice(0, 3).map((message) => (
            <div className="rounded-xl px-3 py-2 text-sm font-black" key={message} style={{ backgroundColor: theme.soft, color: theme.text, border: `2px solid ${theme.border}` }}>
              {message}
            </div>
          ))}
        </footer>
      )}
    </div>
  );
}

function ActiveTemplate({ displayState, logoUrl, settings, slideIndex, storeName, template }: {
  displayState: PosDisplayState;
  logoUrl: string;
  settings: CustomerDisplaySettings;
  slideIndex: number;
  storeName: string;
  template: CustomerDisplayTemplate;
}) {
  const theme = useTheme();
  const common = { displayState, logoUrl, settings, slideIndex, storeName, theme };
  switch (template) {
    case "bold-green":
      return <BoldGreenLayout {...common} />;
    case "sky-blue":
      return <SkyBlueLayout {...common} />;
    case "sunny-yellow":
      return <SunnyYellowLayout {...common} />;
    case "premium-dark":
      return <PremiumDarkLayout {...common} />;
    case "emerald-dream":
      return <EmeraldDreamLayout {...common} />;
    case "coral-minimal":
      return <CoralMinimalLayout {...common} />;
    case "premium-dark-green":
      return <PremiumDarkGreenLayout {...common} />;
    case "minimal-premium-red":
      return <MinimalRedLayout {...common} />;
    case "minimal-premium-purple":
      return <MinimalPurpleLayout {...common} />;
    case "ocean-blue":
    default:
      return <OceanBlueLayout {...common} />;
  }
}

type LayoutProps = {
  displayState: PosDisplayState;
  logoUrl: string;
  settings: CustomerDisplaySettings;
  slideIndex: number;
  storeName: string;
  theme: CustomerDisplayThemeTokens;
};

function OceanBlueLayout({ displayState, logoUrl, settings, slideIndex, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-0 lg:grid-cols-[1.15fr_0.85fr]">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <div className="min-h-0 overflow-hidden p-2 lg:col-span-1 lg:row-start-2">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2 lg:row-span-2">
        <GuestOrMember displayState={displayState} compact />
        <MessageCard settings={settings} slideIndex={slideIndex} />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function BoldGreenLayout({ displayState, logoUrl, storeName, theme }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
        <div className="flex items-center gap-3">
          <StoreMark logoUrl={logoUrl} size={48} storeName={storeName} />
          <div className="text-[clamp(1.4rem,3vw,2rem)] font-black">{storeName}</div>
        </div>
        <GuestOrMember displayState={displayState} compact light />
      </header>
      <div className="min-h-0 overflow-hidden p-2">
        <ItemsList displayState={displayState} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function SkyBlueLayout({ displayState, logoUrl, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 p-2">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <div className="grid gap-2 md:grid-cols-3">
        <MetricBox label="Items" value={String(displayState.items.reduce((total, item) => total + item.quantity, 0))} />
        <MetricBox label="Subtotal" value={`${formatLak(displayState.subtotalLak ?? 0)} LAK`} />
        <GuestOrMember displayState={displayState} compact />
      </div>
      <ItemsList displayState={displayState} />
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function SunnyYellowLayout({ displayState, logoUrl, settings, slideIndex, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.28fr)_minmax(0,1fr)_auto]">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <MessageCard settings={settings} slideIndex={slideIndex} />
      <div className="min-h-0 overflow-hidden p-2">
        <ItemsList displayState={displayState} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function PremiumDarkLayout({ displayState, logoUrl, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 gap-2 p-2 lg:grid-cols-[0.9fr_1.1fr] lg:grid-rows-[auto_minmax(0,1fr)]">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <div className="min-h-0 lg:row-span-2">
        <TotalsBlock displayState={displayState} />
        <div className="mt-2">
          <GuestOrMember displayState={displayState} />
        </div>
      </div>
      <ItemsList displayState={displayState} />
    </div>
  );
}

function EmeraldDreamLayout({ displayState, logoUrl, settings, slideIndex, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.42fr)_minmax(0,1fr)_auto] gap-2 p-2">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <div className="grid min-h-0 gap-2 md:grid-cols-2">
        <GuestOrMember displayState={displayState} />
        <MessageCard settings={settings} slideIndex={slideIndex} />
      </div>
      <ItemsList displayState={displayState} />
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function CoralMinimalLayout({ displayState, logoUrl, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <div className="min-h-0 overflow-hidden px-3 py-2">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid gap-2 px-3 pb-3 md:grid-cols-[minmax(0,1fr)_1.4fr]">
        <GuestOrMember displayState={displayState} compact />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function PremiumDarkGreenLayout({ displayState, logoUrl, storeName }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2 p-2 lg:grid-cols-[1fr_0.7fr] lg:grid-rows-[auto_minmax(0,1fr)_auto]">
      <HeaderBar logoUrl={logoUrl} storeName={storeName} />
      <ItemsList displayState={displayState} />
      <div className="grid gap-2 lg:row-span-2">
        <GuestOrMember displayState={displayState} />
        <MetricBox label="Savings" value={`${formatLak((displayState.membershipDiscountLak ?? 0) + (displayState.promotionDiscountLak ?? 0))} LAK`} />
      </div>
      <div className="lg:col-span-2">
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function MinimalRedLayout({ displayState, logoUrl, storeName }: LayoutProps) {
  const theme = useTheme();
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-end justify-between border-b-4 px-3 py-2" style={{ borderColor: theme.primary }}>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em]">Store</div>
          <div className="text-[clamp(1.6rem,3vw,2.4rem)] font-black">{storeName}</div>
        </div>
        <StoreMark logoUrl={logoUrl} size={52} storeName={storeName} />
      </header>
      <div className="min-h-0 overflow-hidden p-3">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid gap-2 p-3 md:grid-cols-[0.7fr_1.3fr]">
        <GuestOrMember displayState={displayState} compact />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function MinimalPurpleLayout({ displayState, logoUrl, settings, slideIndex, storeName, theme }: LayoutProps) {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
      <div className="px-3 py-3 text-center text-[clamp(1.3rem,2.5vw,2rem)] font-black" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
        {storeName}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <StoreMark logoUrl={logoUrl} size={48} storeName={storeName} />
        <GuestOrMember displayState={displayState} compact />
      </div>
      <div className="grid min-h-0 gap-2 px-3 pb-2 lg:grid-cols-[1.2fr_0.8fr]">
        <ItemsList displayState={displayState} />
        <MessageCard settings={settings} slideIndex={slideIndex} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function HeaderBar({ logoUrl, storeName }: { logoUrl: string; storeName: string }) {
  const theme = useTheme();
  return (
    <header className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: `2px solid ${theme.border}` }}>
      <StoreMark logoUrl={logoUrl} size={48} storeName={storeName} />
      <div className="min-w-0 truncate text-[clamp(1.2rem,2.4vw,1.8rem)] font-black">{storeName}</div>
    </header>
  );
}

function ItemsList({ displayState }: { displayState: PosDisplayState }) {
  const theme = useTheme();
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border-2 p-2" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="mb-1 flex items-center gap-2 font-black">
        <ReceiptText className="size-5" style={{ color: theme.primary }} />
        Items
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {displayState.items.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b py-1.5" key={item.cartLineId ?? `${item.id}-${item.unitId ?? "default"}`} style={{ borderColor: theme.border }}>
            <div className="min-w-0">
              <div className="truncate text-[clamp(1rem,1.8vw,1.35rem)] font-bold">{item.nameEn}</div>
              <div className="text-xs font-semibold" style={{ color: theme.secondaryText }}>{formatLak(item.priceLak)} LAK</div>
            </div>
            <div className="text-[clamp(1.1rem,2vw,1.5rem)] font-black">x{item.quantity}</div>
            <div className="text-right text-[clamp(1.1rem,2vw,1.5rem)] font-black">{formatLak(item.priceLak * item.quantity)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TotalsBlock({ displayState }: { displayState: PosDisplayState }) {
  const theme = useTheme();
  const subtotal = displayState.subtotalLak ?? displayState.items.reduce((total, item) => total + item.priceLak * item.quantity, 0);
  return (
    <section className="rounded-2xl border-2 p-2" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="grid gap-0.5 text-[clamp(0.85rem,1.4vw,1.05rem)] font-semibold" style={{ color: theme.secondaryText }}>
        <div className="flex justify-between"><span>Subtotal</span><span>{formatLak(subtotal)} LAK</span></div>
        <div className="flex justify-between"><span>Promotion</span><span>-{formatLak(displayState.promotionDiscountLak ?? 0)} LAK</span></div>
        <div className="flex justify-between"><span>Member</span><span>-{formatLak(displayState.membershipDiscountLak ?? 0)} LAK</span></div>
        <div className="flex justify-between"><span>Points</span><span>+{displayState.pointsEarned ?? 0}</span></div>
      </div>
      <div className="mt-2 rounded-xl px-3 py-2" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
        <div className="text-xs font-black uppercase tracking-wide">Grand Total</div>
        <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
      </div>
    </section>
  );
}

function GuestOrMember({ compact = false, displayState, light = false }: { compact?: boolean; displayState: PosDisplayState; light?: boolean }) {
  const theme = useTheme();
  const member = displayState.customer;
  const isGuest = !member;
  return (
    <section className="rounded-2xl border-2 p-2" style={{ borderColor: theme.border, backgroundColor: light ? "transparent" : theme.soft, color: light ? "inherit" : theme.text }}>
      <div className="flex items-center gap-2 font-black">
        {isGuest ? <Store className="size-5" /> : <Trophy className="size-5" />}
        {isGuest ? "Guest" : member.name}
      </div>
      {isGuest || compact ? null : (
        <div className="mt-1 grid grid-cols-2 gap-1 text-sm font-semibold">
          <span>{displayState.membershipStatus}</span>
          <span>Points {displayState.membershipPoints}</span>
          <span>+{displayState.pointsEarned ?? 0} now</span>
          <span>Save {formatLak((displayState.membershipDiscountLak ?? 0) + (displayState.promotionDiscountLak ?? 0))}</span>
        </div>
      )}
    </section>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <div className="rounded-2xl border-2 px-3 py-2" style={{ borderColor: theme.border, backgroundColor: theme.soft }}>
      <div className="text-xs font-bold uppercase" style={{ color: theme.secondaryText }}>{label}</div>
      <div className="text-[clamp(1.1rem,2vw,1.6rem)] font-black">{value}</div>
    </div>
  );
}

function MessageCard({ settings, slideIndex }: { settings: CustomerDisplaySettings; slideIndex: number }) {
  const theme = useTheme();
  const slide = getActiveSlide(settings, slideIndex);
  return (
    <section className="min-h-0 overflow-hidden rounded-2xl border-2" style={{ borderColor: theme.border, backgroundColor: theme.soft }}>
      <SlideContent slide={slide} />
    </section>
  );
}

function ThankYouState({ displayState, logoUrl, settings, storeName }: {
  displayState: PosDisplayState;
  logoUrl: string;
  settings: CustomerDisplaySettings;
  storeName: string;
}) {
  const theme = useTheme();
  return (
    <div className="grid h-full place-items-center p-4 text-center">
      <div className="w-full max-w-3xl">
        <StoreMark logoUrl={logoUrl} size={72} storeName={storeName} />
        <Sparkles className="mx-auto mt-3 size-12" style={{ color: theme.primary }} />
        <div className="mt-2 text-[clamp(2.4rem,8vw,5rem)] font-black">Thank You</div>
        <div className="mt-4 rounded-2xl px-4 py-3" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          <div className="text-sm font-black uppercase">Grand Total</div>
          <div className="text-[clamp(2.4rem,7vw,4.6rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
        </div>
        <p className="mt-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>Returning in {settings.autoReturnSeconds}s</p>
      </div>
    </div>
  );
}

function QrOverlay({ amountLak, bank, styleId }: {
  amountLak: number;
  bank: NonNullable<PosDisplayState["selectedQrBank"]>;
  styleId: CustomerDisplaySettings["qrDisplayStyle"];
}) {
  const tokens = customerDisplayQrStyleTokens(styleId);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center p-3" style={{ backgroundColor: tokens.background, color: tokens.text }}>
      <div className="grid w-full max-w-xl gap-3 rounded-3xl border-4 p-4 text-center" style={{ borderColor: tokens.border, backgroundColor: tokens.panel }}>
        <div className="text-sm font-black uppercase" style={{ color: tokens.primary }}>Scan to Pay</div>
        <div className="text-[clamp(1.4rem,3vw,2rem)] font-black">{bank.displayLabel || bank.bankName}</div>
        {bank.qrImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${bank.bankName} QR`} className="mx-auto max-h-[46vh] w-auto max-w-full rounded-2xl bg-white object-contain p-3" src={bank.qrImageUrl} />
        ) : (
          <div className="mx-auto grid max-h-[46vh] min-h-40 w-56 place-items-center rounded-2xl border-4 border-dashed">
            <QrCode className="size-16" />
          </div>
        )}
        <div className="text-[clamp(2rem,6vw,3.6rem)] font-black leading-none">{formatLak(amountLak)} LAK</div>
        <div className="text-sm font-semibold" style={{ color: tokens.secondaryText }}>
          {bank.accountName}{bank.accountNumber ? ` · ${maskAccountReference(bank.accountNumber)}` : ""}
        </div>
      </div>
    </div>
  );
}

type CustomerDisplaySlide = CustomerDisplayMedia | { message: string; type: "message" };

function SlideContent({ large = false, slide }: { large?: boolean; slide: CustomerDisplaySlide }) {
  const theme = useTheme();
  if (slide.type === "video") {
    return <video autoPlay className="h-full min-h-0 w-full object-cover" loop muted playsInline src={slide.url} />;
  }
  if (slide.type === "image") {
    return <img alt={slide.name} className="h-full min-h-0 w-full object-cover" src={slide.url} />;
  }
  return (
    <div className="grid h-full min-h-0 place-items-center p-4 text-center">
      <div>
        <Gift className={cn("mx-auto", large ? "size-14" : "size-8")} style={{ color: theme.primary }} />
        <div className={cn("mt-2 font-black", large ? "text-[clamp(1.8rem,5vw,3.4rem)]" : "text-[clamp(1.1rem,2.4vw,1.8rem)]")}>{slide.type === "message" ? slide.message : ""}</div>
      </div>
    </div>
  );
}

function getActiveSlide(settings: CustomerDisplaySettings, slideIndex: number): CustomerDisplaySlide {
  if (settings.media.length > 0) {
    return settings.media[slideIndex % settings.media.length];
  }
  const messages = settings.promotionMessages.length > 0
    ? settings.promotionMessages
    : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages;
  return { message: messages[slideIndex % messages.length], type: "message" };
}
