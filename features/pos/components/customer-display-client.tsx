"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Gift, Maximize2, Minimize2, QrCode, ReceiptText, Sparkles, Store, Trophy } from "lucide-react";
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
import {
  customerDisplayTemplateChrome,
  customerDisplayTemplateTokens,
  parseCustomerDisplayTemplate,
  type CustomerDisplayChrome,
  type CustomerDisplayThemeTokens,
} from "@/features/pos/customer-display-templates";
import { customerDisplayQrStyleTokens } from "@/features/pos/customer-display-qr-style";
import { maskAccountReference } from "@/features/pos/customer-display-qr";
import {
  customerDisplayWelcomeMessage,
  resolveCustomerDisplayStoreName,
} from "@/features/pos/customer-display-copy";
import { localizedProductName } from "@/features/pos/product-display-name";
import { LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";
import type { SupportedLocale } from "@/lib/constants";
import { t } from "@/lib/i18n/ui";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage } from "@/lib/demo/storage";
import { readCompanyLogoUrl } from "@/features/brand/company-logo";

const POS_DISPLAY_KEY = DemoStorageKeys.customerDisplayState;
const ThemeContext = createContext<CustomerDisplayThemeTokens>(customerDisplayTemplateTokens("ocean-blue"));
const ChromeContext = createContext<CustomerDisplayChrome>(customerDisplayTemplateChrome("ocean-blue"));
const LocaleContext = createContext<SupportedLocale>("en");

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
  storeName: "",
  subtotalLak: 0,
  totalLak: 0,
};

function useTheme() {
  return useContext(ThemeContext);
}

function useChrome() {
  return useContext(ChromeContext);
}

function useDisplayLocale() {
  return useContext(LocaleContext);
}

export function CustomerDisplayClient() {
  const [displayState, setDisplayState] = useState<PosDisplayState>(emptyState);
  const [settings, setSettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
  const [slideIndex, setSlideIndex] = useState(0);
  const [logoUrl, setLogoUrl] = useState("");
  const [locale, setLocale] = useState<SupportedLocale>("en");

  useEffect(() => {
    function readState() {
      setSettings(readCustomerDisplaySettingsFromStorage());
      setLogoUrl(readCompanyLogoUrl());
      setLocale(readClientLocale());
      const storedState = readJsonFromStorage<PosDisplayState | null>(POS_DISPLAY_KEY, null);
      setDisplayState(storedState ? { ...emptyState, ...storedState } : emptyState);
    }
    readState();
    const interval = window.setInterval(readState, 800);
    window.addEventListener("storage", readState);
    window.addEventListener(LOCALE_CHANGE_EVENT, readState);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", readState);
      window.removeEventListener(LOCALE_CHANGE_EVENT, readState);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setSlideIndex((current) => current + 1), 5000);
    return () => window.clearInterval(interval);
  }, []);

  const template = parseCustomerDisplayTemplate(settings.template);
  const tokens = useMemo(() => customerDisplayTemplateTokens(template), [template]);
  const chrome = useMemo(() => customerDisplayTemplateChrome(template), [template]);
  const showThankYou = displayState.displayMode === "thank_you";
  const hasActiveSale = displayState.items.length > 0 && displayState.displayMode !== "advertising" && !showThankYou;
  const showQr = Boolean(displayState.showQr && displayState.selectedQrBank);
  const storeName = resolveCustomerDisplayStoreName(displayState.storeName, settings.promotionMessages);
  const resolvedLogo = displayState.storeLogoUrl || logoUrl;
  const mode: TemplateMode = showThankYou ? "thank_you" : hasActiveSale ? "cart" : "idle";

  return (
    <ThemeContext.Provider value={tokens}>
      <ChromeContext.Provider value={chrome}>
        <LocaleContext.Provider value={locale}>
          <main
            className="fixed inset-0 h-[100dvh] w-screen overflow-hidden"
            data-cd-mode={mode}
            data-cd-template={template}
            data-cd-viewport="fill"
            style={{ backgroundColor: tokens.background, color: tokens.text }}
          >
            <SelectedTemplate
              displayState={displayState}
              logoUrl={resolvedLogo}
              mode={mode}
              settings={settings}
              slideIndex={slideIndex}
              storeName={storeName}
              template={template}
            />
            {showQr && displayState.selectedQrBank ? (
              <QrOverlay amountLak={displayState.totalLak} bank={displayState.selectedQrBank} styleId={settings.qrDisplayStyle} />
            ) : null}
            <FullscreenControl />
          </main>
        </LocaleContext.Provider>
      </ChromeContext.Provider>
    </ThemeContext.Provider>
  );
}

function StoreMark({ logoUrl, size, storeName }: { logoUrl?: string | null; size: number; storeName: string }) {
  return (
    <LogoContainer
      alt={storeName}
      className="border-0 bg-transparent shadow-none"
      fallbackName={storeName}
      logoUrl={logoUrl}
      size={size}
      variant="customer"
    />
  );
}

type TemplateMode = "cart" | "idle" | "thank_you";

function SelectedTemplate({ displayState, logoUrl, mode, settings, slideIndex, storeName, template }: {
  displayState: PosDisplayState;
  logoUrl: string;
  mode: TemplateMode;
  settings: CustomerDisplaySettings;
  slideIndex: number;
  storeName: string;
  template: CustomerDisplayTemplate;
}) {
  const theme = useTheme();
  const common = { displayState, logoUrl, mode, settings, slideIndex, storeName, theme };
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
  mode: TemplateMode;
  settings: CustomerDisplaySettings;
  slideIndex: number;
  storeName: string;
  theme: CustomerDisplayThemeTokens;
};

function chromeClass(kind: string) {
  switch (kind) {
    case "flat":
      return "overflow-hidden";
    case "thin":
      return "overflow-hidden rounded-none border";
    case "square":
      return "overflow-hidden rounded-sm border-2";
    case "outlined":
      return "overflow-hidden rounded-none border-2";
    case "banner":
    case "full-width":
      return "overflow-hidden rounded-none";
    case "rail":
      return "overflow-hidden rounded-none border-l-4 border-y-0 border-r-0";
    default:
      return "overflow-hidden rounded-2xl border-2";
  }
}

function OceanBlueLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full place-items-center p-4 text-center" data-cd-thankyou="ocean-blue">
        <div className="w-full max-w-xl">
          <StoreMark logoUrl={logoUrl} size={48} storeName={storeName} />
          <div className="mt-3 text-[clamp(2rem,6vw,4rem)] font-black">Thank You</div>
          <div className="mx-auto mt-4 max-w-sm border px-4 py-3" style={{ borderColor: theme.border }}>
            <div className="text-xs font-black uppercase" style={{ color: theme.secondaryText }}>Total</div>
            <div className="text-[clamp(2rem,5vw,3.4rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>Returning in {settings.autoReturnSeconds}s</p>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[1.1fr_0.9fr] grid-rows-[auto_minmax(0,1fr)]" data-cd-idle="ocean-blue">
        <header className="col-span-2 flex items-center gap-2 px-2 py-1" data-cd-header="compact" style={{ backgroundColor: theme.surface, borderBottom: `3px solid ${theme.primary}` }}>
          <StoreMark logoUrl={logoUrl} size={40} storeName={storeName} />
          <div className="min-w-0 truncate text-[clamp(1rem,2vw,1.45rem)] font-black">{storeName}</div>
        </header>
        <WelcomePanel fill message={welcomeCopy(settings)} title="Welcome" />
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2 p-2">
          <PromoPanel settings={settings} slideIndex={slideIndex} />
          <ServiceNote message={promoCopy(settings, 1)} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[1.15fr_0.85fr] grid-rows-[auto_minmax(0,1fr)]">
      <header className="col-span-2 flex items-center gap-2 px-2 py-1" data-cd-header="cart" style={{ borderBottom: `2px solid ${theme.border}` }}>
        <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
        <div className="min-w-0 truncate text-[clamp(0.95rem,1.8vw,1.3rem)] font-black">{storeName}</div>
      </header>
      <div className="min-h-0 overflow-hidden p-2">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2">
        <GuestOrMember displayState={displayState} />
        <PromoPanel settings={settings} slideIndex={slideIndex} />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function BoldGreenLayout({ displayState, logoUrl, mode, settings, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" data-cd-thankyou="bold-green">
        <div className="px-4 py-5 text-center text-[clamp(2rem,6vw,4rem)] font-black" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
          Payment confirmed
        </div>
        <div className="grid place-items-center p-4 text-center">
          <StoreMark logoUrl={logoUrl} size={48} storeName={storeName} />
          <p className="mt-3 text-sm font-semibold">Returning in {settings.autoReturnSeconds}s</p>
        </div>
        <div className="px-4 py-4 text-center" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          <div className="text-xs font-black uppercase">Grand Total</div>
          <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" data-cd-idle="bold-green">
        <header className="flex items-center gap-2 px-2 py-1" data-cd-header="compact" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
          <StoreMark logoUrl={logoUrl} size={40} storeName={storeName} />
          <div className="min-w-0">
            <div className="truncate text-[clamp(1.05rem,2.2vw,1.5rem)] font-black">{storeName}</div>
            <div className="text-xs font-semibold">Welcome</div>
          </div>
        </header>
        <WelcomePanel fill message={welcomeCopy(settings)} title="Ready to serve" />
        <div className="px-3 py-3 text-[clamp(1.1rem,2.2vw,1.6rem)] font-black" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          {promoCopy(settings, 0)}
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-center justify-between px-2 py-1" data-cd-header="cart" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
        <div className="flex items-center gap-2">
          <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
          <div className="truncate text-[clamp(1rem,2vw,1.35rem)] font-black">{storeName}</div>
        </div>
        <GuestOrMember displayState={displayState} light />
      </header>
      <div className="min-h-0 overflow-hidden p-2">
        <ItemsList displayState={displayState} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function SkyBlueLayout({ displayState, logoUrl, mode, settings, storeName }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4" data-cd-thankyou="sky-blue">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <div className="grid min-h-0 place-items-center">
          <div className="grid w-full max-w-3xl grid-cols-3 gap-3">
            <MetricBox label="Status" value="Thank you" />
            <MetricBox label="Grand Total" value={`${formatLak(displayState.totalLak)} LAK`} />
            <MetricBox label="Next" value={`${settings.autoReturnSeconds}s`} />
          </div>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 p-2" data-cd-idle="sky-blue">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <div className="grid grid-cols-3 gap-2">
          <MetricBox label="Welcome" value="Guest" />
          <MetricBox label="Store" value={storeName} />
          <MetricBox label="Today" value={promoCopy(settings, 0)} />
        </div>
        <WelcomePanel fill message={welcomeCopy(settings)} title="Hello" />
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 p-2">
      <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      <div className="grid grid-cols-3 gap-2">
        <MetricBox label="Items" value={String(displayState.items.reduce((total, item) => total + item.quantity, 0))} />
        <MetricBox label="Subtotal" value={`${formatLak(displayState.subtotalLak ?? 0)} LAK`} />
        <GuestOrMember displayState={displayState} />
      </div>
      <ItemsList displayState={displayState} />
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function SunnyYellowLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" data-cd-thankyou="sunny-yellow">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <div className="grid place-items-center p-4 text-center">
          <Sparkles className="size-10" style={{ color: theme.primary }} />
          <div className="mt-2 text-[clamp(2rem,6vw,4rem)] font-black">See you again</div>
          <p className="mt-2 text-lg font-semibold">{promoCopy(settings, 2)}</p>
        </div>
        <div className="px-4 py-3 text-center text-[clamp(2.1rem,6vw,4.2rem)] font-black" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          {formatLak(displayState.totalLak)} LAK
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.42fr)_minmax(0,1fr)]" data-cd-idle="sunny-yellow">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <PromoPanel large settings={settings} slideIndex={slideIndex} />
        <WelcomePanel fill message={welcomeCopy(settings)} title="Today's offers" />
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.28fr)_minmax(0,1fr)_auto]">
      <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      <PromoPanel settings={settings} slideIndex={slideIndex} />
      <div className="min-h-0 overflow-hidden p-2">
        <ItemsList displayState={displayState} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function PremiumDarkLayout({ displayState, logoUrl, mode, settings, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[0.9fr_1.1fr] gap-3 p-3" data-cd-thankyou="premium-dark">
        <section className="grid place-items-center border-2 p-4" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
          <div className="text-center">
            <StoreMark logoUrl={logoUrl} size={52} storeName={storeName} />
            <div className="mt-3 text-[clamp(1.6rem,3vw,2.4rem)] font-black">Confirmed</div>
          </div>
        </section>
        <section className="grid place-content-center p-4" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          <div className="text-xs font-black uppercase tracking-[0.18em]">Grand Total</div>
          <div className="mt-2 text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
          <p className="mt-3 text-sm font-semibold">Returning in {settings.autoReturnSeconds}s</p>
        </section>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[0.85fr_1.15fr] gap-2 p-2" data-cd-idle="premium-dark">
        <section className="grid min-h-0 place-items-center rounded-2xl border-2 p-3" style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
          <div className="text-center">
            <StoreMark logoUrl={logoUrl} size={52} storeName={storeName} />
            <div className="mt-3 text-[clamp(1.3rem,2.6vw,2rem)] font-black">{storeName}</div>
          </div>
        </section>
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
          <WelcomePanel fill message={welcomeCopy(settings)} title="Good evening" />
          <ServiceNote message={promoCopy(settings, 0)} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[0.9fr_1.1fr] grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
      <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      <div className="row-span-2 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
        <TotalsBlock displayState={displayState} />
        <GuestOrMember displayState={displayState} />
      </div>
      <ItemsList displayState={displayState} />
    </div>
  );
}

function EmeraldDreamLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-3" data-cd-thankyou="emerald-dream">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <div className="grid min-h-0 grid-cols-2 gap-2">
          <section className={cn("grid place-items-center p-4", chromeClass("card"))} style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
            <div className="text-center">
              <Trophy className="mx-auto size-8" style={{ color: theme.accent }} />
              <div className="mt-2 text-[clamp(1.8rem,4vw,3rem)] font-black">Thank you</div>
              <p className="mt-2 text-sm font-semibold">Returning in {settings.autoReturnSeconds}s</p>
            </div>
          </section>
          <section className={cn("grid place-items-center p-4", chromeClass("card"))} style={{ borderColor: theme.border, backgroundColor: theme.totalBackground, color: theme.totalText }}>
            <div className="text-center">
              <div className="text-xs font-black uppercase">Grand Total</div>
              <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
              {displayState.customer ? <GuestOrMember displayState={displayState} /> : null}
            </div>
          </section>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2" data-cd-idle="emerald-dream">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <div className="grid min-h-0 grid-cols-2 grid-rows-2 gap-2">
          <WelcomePanel fill message={welcomeCopy(settings)} title="Members welcome" />
          <PromoPanel settings={settings} slideIndex={slideIndex} />
          <ServiceNote message={promoCopy(settings, 0)} />
          <ServiceNote message={promoCopy(settings, 1)} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,0.36fr)_minmax(0,1fr)_auto] gap-2 p-2">
      <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      <div className="grid min-h-0 grid-cols-2 gap-2">
        <GuestOrMember displayState={displayState} />
        <PromoPanel settings={settings} slideIndex={slideIndex} />
      </div>
      <ItemsList displayState={displayState} />
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function CoralMinimalLayout({ displayState, logoUrl, mode, settings, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full place-items-center p-6 text-center" data-cd-thankyou="coral-minimal">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: theme.secondaryText }}>Thank you</div>
          <div className="mt-2 text-[clamp(2.2rem,7vw,4.4rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
          <p className="mt-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>Returning in {settings.autoReturnSeconds}s</p>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" data-cd-idle="coral-minimal">
        <header className="flex items-center gap-2 px-2 py-1" data-cd-header="compact" style={{ borderBottom: `2px solid ${theme.border}` }}>
          <StoreMark logoUrl={logoUrl} size={40} storeName={storeName} />
          <div className="min-w-0 truncate text-[clamp(1rem,2vw,1.45rem)] font-black">{storeName}</div>
        </header>
        <WelcomePanel fill message={welcomeCopy(settings)} title="Welcome" />
        <ServiceNote message={promoCopy(settings, 0)} />
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      <div className="min-h-0 overflow-hidden px-3 py-2">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_1.4fr] gap-2 px-3 pb-3">
        <GuestOrMember displayState={displayState} />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function PremiumDarkGreenLayout({ displayState, logoUrl, mode, settings, storeName, theme }: LayoutProps) {
  const savings = (displayState.membershipDiscountLak ?? 0) + (displayState.promotionDiscountLak ?? 0);
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" data-cd-thankyou="premium-dark-green">
        <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
        <section className="grid place-items-center p-4" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          <div className="text-center">
            <div className="text-xs font-black uppercase tracking-[0.18em]">Grand Total</div>
            <div className="mt-2 text-[clamp(2.4rem,8vw,5rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
            <p className="mt-3 text-sm font-semibold">Returning in {settings.autoReturnSeconds}s</p>
          </div>
        </section>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-cols-[1fr_0.72fr] grid-rows-[auto_minmax(0,1fr)] gap-2 p-2" data-cd-idle="premium-dark-green">
        <BrandRow logoUrl={logoUrl} storeName={storeName} />
        <section className="row-span-2 grid min-h-0 place-items-center rounded-2xl p-3" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
          <div className="text-center">
            <div className="text-xs font-black uppercase tracking-[0.18em]">Welcome</div>
            <div className="mt-2 text-[clamp(1.6rem,4vw,2.8rem)] font-black leading-none">{storeName}</div>
          </div>
        </section>
        <WelcomePanel fill message={welcomeCopy(settings)} title="Thank you for visiting" />
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_0.7fr] grid-rows-[auto_minmax(0,1fr)_auto] gap-2 p-2">
      <header className="col-span-2">
        <BrandRow compact logoUrl={logoUrl} storeName={storeName} />
      </header>
      <ItemsList displayState={displayState} />
      <div className="grid min-h-0 gap-2">
        <GuestOrMember displayState={displayState} />
        {savings > 0 ? <MetricBox label="Savings" value={`${formatLak(savings)} LAK`} /> : null}
      </div>
      <div className="col-span-2">
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function MinimalRedLayout({ displayState, logoUrl, mode, settings, storeName }: LayoutProps) {
  const theme = useTheme();
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]" data-cd-thankyou="minimal-premium-red">
        <header className="border-b-4 px-4 py-2" style={{ borderColor: theme.primary }}>
          <div className="text-[10px] font-black uppercase tracking-[0.16em]">Thank you</div>
          <div className="truncate text-[clamp(1.2rem,2.4vw,1.8rem)] font-black">{storeName}</div>
        </header>
        <div className="grid place-items-center p-6 text-center">
          <div className="text-[clamp(2.2rem,7vw,4.6rem)] font-black leading-none" style={{ color: theme.primary }}>Paid</div>
          <p className="mt-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>Returning in {settings.autoReturnSeconds}s</p>
        </div>
        <div className="border-t-4 px-4 py-3" style={{ borderColor: theme.primary }}>
          <div className="text-xs font-black uppercase">Grand Total</div>
          <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]" data-cd-idle="minimal-premium-red">
        <header className="flex items-end justify-between border-b-4 px-2 py-1" data-cd-header="compact" style={{ borderColor: theme.primary }}>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em]">Store</div>
            <div className="truncate text-[clamp(1.1rem,2.2vw,1.6rem)] font-black">{storeName}</div>
          </div>
          <StoreMark logoUrl={logoUrl} size={40} storeName={storeName} />
        </header>
        <div className="px-2 pt-1 text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: theme.secondaryText }}>Welcome</div>
        <WelcomePanel fill message={welcomeCopy(settings)} title="" />
        <div className="px-3 py-2 text-sm font-semibold" style={{ color: theme.secondaryText }}>{promoCopy(settings, 0)}</div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
      <header className="flex items-end justify-between border-b-4 px-2 py-1" data-cd-header="cart" style={{ borderColor: theme.primary }}>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em]">Store</div>
          <div className="truncate text-[clamp(1rem,2vw,1.4rem)] font-black">{storeName}</div>
        </div>
        <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
      </header>
      <div className="min-h-0 overflow-hidden p-3">
        <ItemsList displayState={displayState} />
      </div>
      <div className="grid grid-cols-[0.7fr_1.3fr] gap-2 p-3">
        <GuestOrMember displayState={displayState} />
        <TotalsBlock displayState={displayState} />
      </div>
    </div>
  );
}

function MinimalPurpleLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  if (mode === "thank_you") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]" data-cd-thankyou="minimal-premium-purple">
        <div className="px-4 py-3 text-center text-[clamp(1.4rem,3vw,2.2rem)] font-black" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
          Thank you for visiting
        </div>
        <div className="grid place-items-center bg-white p-6 text-center">
          <StoreMark logoUrl={logoUrl} size={44} storeName={storeName} />
          <div className="mt-3 text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none" style={{ color: theme.primary }}>
            {formatLak(displayState.totalLak)} LAK
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>Returning in {settings.autoReturnSeconds}s</p>
        </div>
      </div>
    );
  }
  if (mode === "idle") {
    return (
      <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]" data-cd-idle="minimal-premium-purple">
        <div className="px-2 py-1 text-center text-[clamp(1rem,2vw,1.4rem)] font-black" data-cd-header="compact" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
          {storeName}
        </div>
        <div className="flex items-center justify-between px-2 py-1">
          <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
          <ServiceNote message="Welcome" />
        </div>
        <div className="grid min-h-0 grid-cols-[1.15fr_0.85fr] gap-2 px-3 pb-3">
          <WelcomePanel fill message={welcomeCopy(settings)} title="A pleasure to serve you" />
          <PromoPanel settings={settings} slideIndex={slideIndex} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto]">
      <div className="px-2 py-1 text-center text-[clamp(1rem,2vw,1.35rem)] font-black" data-cd-header="cart" style={{ backgroundColor: theme.primary, color: theme.totalText }}>
        {storeName}
      </div>
      <div className="flex items-center justify-between px-2 py-1">
        <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
        <GuestOrMember displayState={displayState} />
      </div>
      <div className="grid min-h-0 grid-cols-[1.2fr_0.8fr] gap-2 px-3 pb-2">
        <ItemsList displayState={displayState} />
        <PromoPanel settings={settings} slideIndex={slideIndex} />
      </div>
      <TotalsBlock displayState={displayState} />
    </div>
  );
}

function BrandRow({ compact = false, logoUrl, storeName }: { compact?: boolean; logoUrl: string; storeName: string }) {
  const theme = useTheme();
  return (
    <header className={cn("flex items-center gap-2 px-2", compact ? "py-0.5" : "py-1")} data-cd-header={compact ? "cart" : "compact"} style={{ borderBottom: `2px solid ${theme.border}` }}>
      <StoreMark logoUrl={logoUrl} size={compact ? 36 : 40} storeName={storeName} />
      <div className="min-w-0 truncate text-[clamp(0.95rem,1.9vw,1.4rem)] font-black">{storeName}</div>
    </header>
  );
}

function welcomeCopy(settings: CustomerDisplaySettings) {
  return customerDisplayWelcomeMessage(settings.promotionMessages);
}

function promoCopy(settings: CustomerDisplaySettings, index: number) {
  const message = settings.promotionMessages[index]?.trim() || settings.promotionMessages[0]?.trim() || "Thank you";
  return customerDisplayWelcomeMessage([message]);
}

function WelcomePanel({ fill = false, message, title }: { fill?: boolean; message: string; title: string }) {
  const theme = useTheme();
  const chrome = useChrome();
  return (
    <section
      className={cn("flex min-h-0 flex-col justify-start overflow-hidden p-3", fill && "h-full", chromeClass(chrome.panel))}
      data-cd-chrome={chrome.panel}
      data-cd-welcome="start"
      style={{ backgroundColor: theme.soft, color: theme.text, borderColor: theme.border }}
    >
      {title ? <div className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: theme.secondaryText }}>{title}</div> : null}
      <div className="mt-2 text-[clamp(1.4rem,3.4vw,2.6rem)] font-black leading-tight">{message}</div>
    </section>
  );
}

function ServiceNote({ message }: { message: string }) {
  const theme = useTheme();
  const chrome = useChrome();
  return (
    <div className={cn("px-3 py-2 text-sm font-black", chromeClass(chrome.panel))} style={{ borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }}>
      {message}
    </div>
  );
}

function PromoPanel({ large = false, settings, slideIndex }: { large?: boolean; settings: CustomerDisplaySettings; slideIndex: number }) {
  const theme = useTheme();
  const chrome = useChrome();
  const slide = getActiveSlide(settings, slideIndex);
  return (
    <section className={cn("min-h-0", chromeClass(chrome.panel), large && "h-full")} data-cd-chrome={chrome.panel} style={{ borderColor: theme.border, backgroundColor: theme.soft }}>
      <SlideContent slide={slide} />
    </section>
  );
}

function ItemsList({ displayState }: { displayState: PosDisplayState }) {
  const theme = useTheme();
  const chrome = useChrome();
  const locale = useDisplayLocale();
  return (
    <section className={cn("flex h-full min-h-0 flex-col p-2", chromeClass(chrome.items))} data-cd-chrome={chrome.items} style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="mb-1 flex items-center gap-2 font-black">
        <ReceiptText className="size-5" style={{ color: theme.primary }} />
        Items
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {displayState.items.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b py-1.5" key={item.cartLineId ?? `${item.id}-${item.unitId ?? "default"}`} style={{ borderColor: theme.border }}>
            <div className="min-w-0">
              <div className="truncate text-[clamp(1rem,1.8vw,1.35rem)] font-bold">{localizedProductName(item, locale)}</div>
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

function meaningfulAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function TotalsBlock({ displayState }: { displayState: PosDisplayState }) {
  const theme = useTheme();
  const chrome = useChrome();
  const member = Boolean(displayState.customer);
  const subtotal = displayState.subtotalLak ?? displayState.items.reduce((total, item) => total + item.priceLak * item.quantity, 0);
  const promotion = displayState.promotionDiscountLak ?? 0;
  const memberDiscount = displayState.membershipDiscountLak ?? 0;
  const pointsEarned = displayState.pointsEarned ?? 0;
  return (
    <section className={cn("p-2", chromeClass(chrome.totals))} data-cd-chrome={chrome.totals} style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="grid gap-0.5 text-[clamp(0.85rem,1.4vw,1.05rem)] font-semibold" style={{ color: theme.secondaryText }}>
        <div className="flex justify-between"><span>Subtotal</span><span>{formatLak(subtotal)} LAK</span></div>
        {meaningfulAmount(promotion) ? <div className="flex justify-between" data-cd-total-row="promotion"><span>Promotion</span><span>-{formatLak(promotion)} LAK</span></div> : null}
        {member && meaningfulAmount(memberDiscount) ? <div className="flex justify-between" data-cd-total-row="member"><span>Member</span><span>-{formatLak(memberDiscount)} LAK</span></div> : null}
        {member && meaningfulAmount(pointsEarned) ? <div className="flex justify-between" data-cd-total-row="points"><span>Points</span><span>+{pointsEarned}</span></div> : null}
      </div>
      <div className={cn("mt-2 px-3 py-2", chrome.totals === "outlined" ? "border-2" : chrome.totals === "full-width" ? "" : "rounded-xl")} style={{ backgroundColor: theme.totalBackground, color: theme.totalText, borderColor: theme.border }}>
        <div className="text-xs font-black uppercase tracking-wide">Grand Total</div>
        <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
      </div>
    </section>
  );
}

function GuestOrMember({ displayState, light = false }: { displayState: PosDisplayState; light?: boolean }) {
  const theme = useTheme();
  const chrome = useChrome();
  const member = displayState.customer;
  if (!member) {
    return (
      <div
        className="inline-flex h-fit items-center gap-1 px-2 py-1 text-xs font-black uppercase tracking-wide"
        data-cd-guest="minimal"
        style={{ color: light ? "inherit" : theme.secondaryText }}
      >
        <Store className="size-3.5" />
        Guest
      </div>
    );
  }
  const pointsEarned = displayState.pointsEarned ?? 0;
  const memberDiscount = displayState.membershipDiscountLak ?? 0;
  const savings = memberDiscount + (displayState.promotionDiscountLak ?? 0);
  const status = [member.membershipType, displayState.membershipStatus].filter((value, index, all) => value && all.indexOf(value) === index).join(" · ");
  return (
    <section
      className={cn("p-2", chromeClass(chrome.member))}
      data-cd-member="detail"
      style={{ borderColor: theme.border, backgroundColor: light ? "transparent" : theme.soft, color: light ? "inherit" : theme.text }}
    >
      <div className="flex items-center gap-2 font-black">
        <Trophy className="size-5" />
        <span data-cd-member-field="name">{member.name}</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1 text-sm font-semibold">
        {status ? <span data-cd-member-field="status">{status}</span> : null}
        {meaningfulAmount(displayState.membershipPoints) || displayState.membershipPoints === 0 ? (
          <span data-cd-member-field="points">Points {displayState.membershipPoints}</span>
        ) : null}
        {meaningfulAmount(pointsEarned) ? <span data-cd-member-field="earned">+{pointsEarned} now</span> : null}
        {meaningfulAmount(memberDiscount) ? <span data-cd-member-field="discount">Member {formatLak(memberDiscount)}</span> : null}
        {meaningfulAmount(savings) ? <span data-cd-member-field="savings">Save {formatLak(savings)}</span> : null}
      </div>
    </section>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const chrome = useChrome();
  return (
    <div className={cn("min-w-0 px-3 py-2", chromeClass(chrome.panel))} style={{ borderColor: theme.border, backgroundColor: theme.soft }}>
      <div className="text-xs font-bold uppercase" style={{ color: theme.secondaryText }}>{label}</div>
      <div className="truncate text-[clamp(1rem,1.8vw,1.4rem)] font-black">{value}</div>
    </div>
  );
}

function isStandaloneDisplay() {
  return typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

function FullscreenControl() {
  const [active, setActive] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    function sync() {
      setActive(Boolean(document.fullscreenElement) || isStandaloneDisplay());
    }
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
      setDenied(false);
    } catch {
      setDenied(true);
    }
  }

  return (
    <button
      aria-label={active ? t("ui.exit.fullscreen") : t("ui.enter.fullscreen")}
      className="absolute right-2 top-2 z-30 inline-flex size-8 items-center justify-center rounded-md border border-white/20 bg-black/35 text-white"
      data-cd-fullscreen="control"
      data-cd-fullscreen-state={active ? "active" : denied ? "denied" : "idle"}
      title={denied ? t("ui.customer.display.browser.limitation") : t("ui.customer.display.fullscreen.denied")}
      type="button"
      onClick={() => {
        void toggleFullscreen();
      }}
    >
      {active ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
    </button>
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

function SlideContent({ slide }: { slide: CustomerDisplaySlide }) {
  const theme = useTheme();
  if (slide.type === "video") {
    return <video autoPlay className="h-full min-h-0 w-full object-cover" loop muted playsInline src={slide.url} />;
  }
  if (slide.type === "image") {
    return <img alt={slide.name} className="h-full min-h-0 w-full object-cover" src={slide.url} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-start p-3">
      <Gift className="size-7" style={{ color: theme.primary }} />
      <div className="mt-2 text-[clamp(1.1rem,2.2vw,1.7rem)] font-black leading-tight">{slide.type === "message" ? slide.message : ""}</div>
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
