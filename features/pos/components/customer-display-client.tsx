"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Gift, Maximize2, Minimize2, Package, QrCode, ReceiptText, Sparkles, Trophy } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { formatLak } from "@/features/pos/format";
import { resolveCustomerDisplayProductImage } from "@/features/pos/customer-display-product-image";
import {
  customerDisplayMemberName,
  customerDisplayShouldShowDiscountRows,
  customerDisplayShouldShowPromotionInfo,
  customerDisplayShouldShowSubtotal,
  resolveCustomerDisplayIdleSlide,
  resolveCustomerDisplayMode,
  type CustomerDisplayMode,
} from "@/features/pos/customer-display-rules";
import type { PosCartItem, PosDisplayState } from "@/features/pos/types";
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
  fillCustomerDisplayCopy,
  resolveCustomerDisplayStoreName,
  tCd,
} from "@/features/pos/customer-display-copy";
import { localizedProductName } from "@/features/pos/product-display-name";
import { LOCALE_CHANGE_EVENT } from "@/lib/i18n/locale";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import type { SupportedLocale } from "@/lib/constants";
import { t } from "@/lib/i18n/ui";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage } from "@/lib/demo/storage";

const POS_DISPLAY_KEY = DemoStorageKeys.customerDisplayState;
const ThemeContext = createContext<CustomerDisplayThemeTokens>(customerDisplayTemplateTokens("ocean-blue"));
const ChromeContext = createContext<CustomerDisplayChrome>(customerDisplayTemplateChrome("ocean-blue"));
const LocaleContext = createContext<SupportedLocale>("en");
const ModeContext = createContext<CustomerDisplayMode>("idle");

const emptyState: PosDisplayState = {
  appliedPromotions: [],
  customer: null,
  displayMode: "advertising",
  items: [],
  loyaltyRedeemLak: 0,
  manualDiscountLak: 0,
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

function useDisplayMode() {
  return useContext(ModeContext);
}

export function CustomerDisplayClient() {
  const [displayState, setDisplayState] = useState<PosDisplayState>(emptyState);
  const [settings, setSettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
  const [slideIndex, setSlideIndex] = useState(0);
  const locale = useAppLocale();

  useEffect(() => {
    function readState() {
      setSettings(readCustomerDisplaySettingsFromStorage());
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
  const mode = resolveCustomerDisplayMode(displayState);
  const showQr = Boolean(displayState.showQr && displayState.selectedQrBank);
  const storeName = resolveCustomerDisplayStoreName(displayState.storeName, settings.promotionMessages);
  const resolvedLogo = displayState.storeLogoUrl || "";

  return (
    <ThemeContext.Provider value={tokens}>
      <ChromeContext.Provider value={chrome}>
        <LocaleContext.Provider value={locale}>
          <ModeContext.Provider value={mode}>
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
          </ModeContext.Provider>
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

function SelectedTemplate({ displayState, logoUrl, mode, settings, slideIndex, storeName, template }: {
  displayState: PosDisplayState;
  logoUrl: string;
  mode: CustomerDisplayMode;
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
    case "ocean-blue":
    default:
      return <OceanBlueLayout {...common} />;
  }
}

type LayoutProps = {
  displayState: PosDisplayState;
  logoUrl: string;
  mode: CustomerDisplayMode;
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

function GeometryRoom({ children, className, marker, tone = "surface" }: {
  children: ReactNode;
  className?: string;
  marker: string;
  tone?: "accent" | "soft" | "surface";
}) {
  const theme = useTheme();
  const backgroundColor = tone === "accent" ? theme.primary : tone === "soft" ? theme.soft : theme.surface;
  const color = tone === "accent" ? theme.totalText : theme.text;
  return (
    <section
      className={cn("min-h-0 overflow-hidden rounded-2xl border p-3", className)}
      data-cd-room={marker}
      style={{ backgroundColor, borderColor: theme.border, color }}
    >
      {children}
    </section>
  );
}

function OceanBlueLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  const locale = useDisplayLocale();
  return (
    <div className="grid h-full min-h-0 grid-rows-1 p-3" data-cd-geometry="full" data-cd-idle="ocean-blue" data-cd-payment={mode === "payment" ? "ocean-blue" : undefined} data-cd-thankyou="ocean-blue">
      <GeometryRoom className="grid grid-rows-[auto_minmax(0,1fr)]" marker="full">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StoreMark logoUrl={logoUrl} size={40} storeName={storeName} />
            <div className="truncate text-[clamp(1rem,2vw,1.45rem)] font-black">{storeName}</div>
          </div>
          {mode === "idle" || mode === "thank_you" ? null : <HeaderMeta displayState={displayState} />}
        </div>
        {mode === "thank_you" ? (
          <div className="grid min-h-0 place-items-center text-center">
            <div>
              <div className="text-[clamp(2rem,6vw,4rem)] font-black">{tCd("thankYou", locale)}</div>
              <div className="mx-auto mt-4 max-w-sm rounded-2xl px-4 py-3" style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}>
                <div className="text-xs font-black uppercase">{tCd("grandTotal", locale)}</div>
                <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
              </div>
              <ReturningNote seconds={settings.autoReturnSeconds} />
            </div>
          </div>
        ) : mode === "idle" ? (
          <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={welcomeCopy(settings)} />
        ) : (
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2">
            <ItemsList displayState={displayState} />
            <TotalsBlock displayState={displayState} settings={settings} />
          </div>
        )}
      </GeometryRoom>
    </div>
  );
}

function BoldGreenLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  const locale = useDisplayLocale();
  return (
    <div className="grid h-full min-h-0 grid-cols-[1.15fr_0.85fr] gap-3 p-3" data-cd-geometry="columns-2" data-cd-idle="bold-green" data-cd-payment={mode === "payment" ? "bold-green" : undefined} data-cd-thankyou="bold-green">
      <GeometryRoom className="flex flex-col" marker="left">
        <div className="mb-2 flex items-center gap-2">
          <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
          <div className="truncate text-[clamp(1rem,2vw,1.4rem)] font-black">{storeName}</div>
        </div>
        <div className="min-h-0 flex-1">
          {mode === "thank_you" ? (
            <div className="grid h-full place-items-center text-center text-[clamp(2rem,6vw,4rem)] font-black">{tCd("thankYou", locale)}</div>
          ) : mode === "idle" ? (
            <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={welcomeCopy(settings)} />
          ) : (
            <ItemsList displayState={displayState} />
          )}
        </div>
      </GeometryRoom>
      <GeometryRoom className="flex flex-col" marker="right">
        {mode === "thank_you" ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <div className="text-xs font-black uppercase">{tCd("grandTotal", locale)}</div>
              <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none" style={{ color: theme.primary }}>{formatLak(displayState.totalLak)} LAK</div>
              <ReturningNote seconds={settings.autoReturnSeconds} />
            </div>
          </div>
        ) : mode === "idle" ? (
          <WelcomePanel fill message={promoCopy(settings, 1)} title={tCd("welcome", locale)} />
        ) : (
          <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2">
            <HeaderMeta displayState={displayState} />
            <TotalsBlock displayState={displayState} settings={settings} />
          </div>
        )}
      </GeometryRoom>
    </div>
  );
}

function SkyBlueLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  const locale = useDisplayLocale();
  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,0.78fr)_minmax(0,1.22fr)] gap-3 p-3" data-cd-geometry="top-split" data-cd-idle="sky-blue" data-cd-payment={mode === "payment" ? "sky-blue" : undefined} data-cd-thankyou="sky-blue">
      <GeometryRoom className="flex flex-col" marker="top">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <StoreMark logoUrl={logoUrl} size={36} storeName={storeName} />
            <div className="truncate text-[clamp(1rem,2vw,1.4rem)] font-black">{storeName}</div>
          </div>
          {mode === "idle" || mode === "thank_you" ? null : <HeaderMeta displayState={displayState} light />}
        </div>
        <div className="min-h-0 flex-1">
          {mode === "thank_you" ? (
            <div className="grid h-full place-items-center text-center text-[clamp(2rem,5vw,3.6rem)] font-black">{tCd("thankYou", locale)}</div>
          ) : mode === "idle" ? (
            <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={welcomeCopy(settings)} />
          ) : (
            <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={promoCopy(settings, 0)} />
          )}
        </div>
      </GeometryRoom>
      <div className="grid min-h-0 grid-cols-2 gap-3" data-cd-room="bottom">
        <GeometryRoom className="flex flex-col" marker="bottom-left">
          {mode === "thank_you" ? <ReturningNote seconds={settings.autoReturnSeconds} /> : mode === "idle" ? <WelcomePanel fill message={promoCopy(settings, 1)} title={tCd("welcome", locale)} /> : <ItemsList displayState={displayState} />}
        </GeometryRoom>
        <GeometryRoom className="flex flex-col" marker="bottom-right" tone="soft">
          {mode === "thank_you" ? (
            <div className="grid h-full place-items-center text-center">
              <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none" style={{ color: theme.secondaryText }}>{formatLak(displayState.totalLak)} LAK</div>
            </div>
          ) : mode === "idle" ? (
            <WelcomePanel fill message={promoCopy(settings, 2)} title={storeName} />
          ) : (
            <TotalsBlock displayState={displayState} settings={settings} />
          )}
        </GeometryRoom>
      </div>
    </div>
  );
}

function SunnyYellowLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  const locale = useDisplayLocale();
  return (
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-2 gap-3 p-3" data-cd-geometry="grid-2x2" data-cd-idle="sunny-yellow" data-cd-payment={mode === "payment" ? "sunny-yellow" : undefined} data-cd-thankyou="sunny-yellow">
      <GeometryRoom className="flex flex-col" marker="top-left">
        {mode === "thank_you" ? (
          <div className="grid h-full place-items-center text-center">
            <Sparkles className="size-10" style={{ color: theme.accent }} />
            <div className="mt-2 text-[clamp(1.6rem,4vw,3rem)] font-black">{tCd("thankYou", locale)}</div>
          </div>
        ) : mode === "idle" ? (
          <WelcomePanel fill message={promoCopy(settings, 0)} title={tCd("welcome", locale)} />
        ) : (
          <ItemsList displayState={displayState} range="first" />
        )}
      </GeometryRoom>
      <GeometryRoom className="flex flex-col" marker="top-right" tone="soft">
        <div className="mb-2 flex items-center gap-2">
          <StoreMark logoUrl={logoUrl} size={32} storeName={storeName} />
          <div className="truncate font-black">{storeName}</div>
        </div>
        <div className="min-h-0 flex-1">
          {mode === "idle" ? <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={welcomeCopy(settings)} /> : mode === "thank_you" ? <ReturningNote seconds={settings.autoReturnSeconds} /> : <ItemsList displayState={displayState} range="rest" />}
        </div>
      </GeometryRoom>
      <GeometryRoom className="flex flex-col gap-2" marker="bottom-left" tone="soft">
        {mode === "idle" ? <WelcomePanel fill message={promoCopy(settings, 1)} title={storeName} /> : mode === "thank_you" ? <WelcomePanel fill message={storeName} title={tCd("thankYou", locale)} /> : (
          <>
            <HeaderMeta displayState={displayState} />
            <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={promoCopy(settings, 0)} />
          </>
        )}
      </GeometryRoom>
      <GeometryRoom className="flex flex-col" marker="bottom-right" tone="accent">
        {mode === "idle" ? <WelcomePanel fill message={promoCopy(settings, 2)} title={tCd("member", locale)} /> : mode === "thank_you" ? (
          <div className="grid h-full place-items-center text-center text-[clamp(2.1rem,6vw,4.2rem)] font-black" style={{ color: theme.totalText }}>{formatLak(displayState.totalLak)} LAK</div>
        ) : <TotalsBlock displayState={displayState} settings={settings} />}
      </GeometryRoom>
    </div>
  );
}

function PremiumDarkLayout({ displayState, logoUrl, mode, settings, slideIndex, storeName, theme }: LayoutProps) {
  const locale = useDisplayLocale();
  return (
    <div className="grid h-full min-h-0 grid-cols-[0.9fr_1.1fr] grid-rows-2 gap-3 p-3" data-cd-geometry="left-stack-right" data-cd-idle="premium-dark" data-cd-payment={mode === "payment" ? "premium-dark" : undefined} data-cd-thankyou="premium-dark">
      <GeometryRoom className="col-start-1 row-start-1 flex flex-col" marker="left-top" tone="accent">
        <div className="mb-2 flex items-center gap-2">
          <StoreMark logoUrl={logoUrl} size={32} storeName={storeName} />
          <div className="truncate font-black">{storeName}</div>
        </div>
        <div className="min-h-0 flex-1">
          {mode === "thank_you" ? <div className="text-[clamp(1.6rem,4vw,3rem)] font-black">{tCd("thankYou", locale)}</div> : mode === "idle" ? <WelcomePanel fill message={promoCopy(settings, 0)} title={tCd("welcome", locale)} /> : (
            <div className="grid gap-2">
              <HeaderMeta displayState={displayState} light />
              <PromoPanel settings={settings} slideIndex={slideIndex} fallback={promoCopy(settings, 0)} />
            </div>
          )}
        </div>
      </GeometryRoom>
      <GeometryRoom className="col-start-2 row-span-2 row-start-1 flex flex-col" marker="right">
        {mode === "thank_you" ? (
          <div className="grid h-full place-items-center text-center">
            <StoreMark logoUrl={logoUrl} size={52} storeName={storeName} />
            <ReturningNote seconds={settings.autoReturnSeconds} />
          </div>
        ) : mode === "idle" ? (
          <PromoPanel fill settings={settings} slideIndex={slideIndex} fallback={welcomeCopy(settings)} />
        ) : (
          <ItemsList displayState={displayState} />
        )}
      </GeometryRoom>
      <GeometryRoom className="col-start-1 row-start-2 flex flex-col" marker="left-bottom" tone="soft">
        {mode === "idle" ? <WelcomePanel fill message={promoCopy(settings, 1)} title={storeName} /> : mode === "thank_you" ? (
          <div className="grid h-full place-items-center text-center">
            <div className="text-xs font-black uppercase">{tCd("grandTotal", locale)}</div>
            <div className="text-[clamp(2.1rem,5vw,3.6rem)] font-black leading-none" style={{ color: theme.primary }}>{formatLak(displayState.totalLak)} LAK</div>
          </div>
        ) : <TotalsBlock displayState={displayState} settings={settings} />}
      </GeometryRoom>
    </div>
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

function PromoPanel({ fallback, fill = false, large = false, settings, slideIndex }: {
  fallback?: string;
  fill?: boolean;
  large?: boolean;
  settings: CustomerDisplaySettings;
  slideIndex: number;
}) {
  const theme = useTheme();
  const chrome = useChrome();
  const mode = useDisplayMode();
  const locale = useDisplayLocale();
  const allowMedia = mode === "idle";
  const showPromoInfo = customerDisplayShouldShowPromotionInfo(settings);
  const slide = allowMedia
    ? resolveCustomerDisplayIdleSlide(settings, slideIndex, DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages)
    : showPromoInfo
      ? { message: fallback || promoCopy(settings, 0), type: "message" as const }
      : null;
  if (!slide) {
    return null;
  }
  return (
    <section
      className={cn("min-h-0", chromeClass(chrome.panel), (large || fill) && "h-full")}
      data-cd-chrome={chrome.panel}
      data-cd-idle-media={allowMedia ? slide.type : "hidden"}
      style={{ borderColor: theme.border, backgroundColor: theme.soft }}
    >
      <SlideContent fallbackLabel={tCd("welcome", locale)} slide={slide} />
    </section>
  );
}

function ItemsList({ displayState, range = "all" }: { displayState: PosDisplayState; range?: "all" | "first" | "rest" }) {
  const theme = useTheme();
  const chrome = useChrome();
  const locale = useDisplayLocale();
  const items = range === "first" ? displayState.items.slice(0, 1) : range === "rest" ? displayState.items.slice(1) : displayState.items;
  return (
    <section className={cn("flex h-full min-h-0 flex-col p-2", chromeClass(chrome.items))} data-cd-chrome={chrome.items} data-cd-items={range} style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="mb-1 flex items-center gap-2 font-black">
        <ReceiptText className="size-5" style={{ color: theme.primary }} />
        {tCd("items", locale)}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? <div className="py-3 text-sm font-semibold" style={{ color: theme.secondaryText }}>—</div> : null}
        {items.map((item) => (
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b py-1.5" key={item.cartLineId ?? `${item.id}-${item.unitId ?? "default"}`} style={{ borderColor: theme.border }}>
            <div className="flex min-w-0 items-center gap-2">
              <CustomerDisplayProductImage item={item} label={localizedProductName(item, locale)} />
              <div className="min-w-0">
                <div className="truncate text-[clamp(1rem,1.8vw,1.35rem)] font-bold">{localizedProductName(item, locale)}</div>
                <div className="text-xs font-semibold" style={{ color: theme.secondaryText }}>
                  {tCd("unitPrice", locale)} {formatLak(item.priceLak)} LAK
                </div>
              </div>
            </div>
            <div className="text-[clamp(1.1rem,2vw,1.5rem)] font-black">{tCd("qty", locale)} {item.quantity}</div>
            <div className="text-right text-[clamp(1.1rem,2vw,1.5rem)] font-black">{formatLak(item.priceLak * item.quantity)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomerDisplayProductImage({ item, label }: { item: PosCartItem; label: string }) {
  const theme = useTheme();
  const resolved = resolveCustomerDisplayProductImage(item);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved.url]);

  return (
    <div
      aria-label={resolved.url && !failed ? label : undefined}
      className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border"
      data-cd-product-image={resolved.source}
      style={{ backgroundColor: theme.soft, borderColor: theme.border }}
    >
      {resolved.url && !failed ? (
        <img
          alt={label}
          className="size-full object-contain"
          decoding="async"
          loading="lazy"
          src={resolved.url}
          onError={() => setFailed(true)}
        />
      ) : (
        <Package aria-hidden="true" className="size-7" style={{ color: theme.secondaryText }} />
      )}
    </div>
  );
}

function meaningfulAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function TotalsBlock({ displayState, settings = DEFAULT_CUSTOMER_DISPLAY_SETTINGS }: {
  displayState: PosDisplayState;
  settings?: CustomerDisplaySettings;
}) {
  const theme = useTheme();
  const chrome = useChrome();
  const locale = useDisplayLocale();
  const member = Boolean(displayState.customer);
  const subtotal = displayState.subtotalLak ?? displayState.items.reduce((total, item) => total + item.priceLak * item.quantity, 0);
  const promotion = displayState.promotionDiscountLak ?? 0;
  const memberDiscount = displayState.membershipDiscountLak ?? 0;
  const manual = displayState.manualDiscountLak ?? 0;
  const redeem = displayState.loyaltyRedeemLak ?? 0;
  const showDiscount = customerDisplayShouldShowDiscountRows(settings);
  const showPromoInfo = customerDisplayShouldShowPromotionInfo(settings);
  const showSubtotal = customerDisplayShouldShowSubtotal(settings, displayState);
  return (
    <section className={cn("p-2", chromeClass(chrome.totals))} data-cd-chrome={chrome.totals} data-cd-discount={showDiscount ? "on" : "off"} style={{ borderColor: theme.border, backgroundColor: theme.surface }}>
      <div className="grid gap-0.5 text-[clamp(0.85rem,1.4vw,1.05rem)] font-semibold" style={{ color: theme.secondaryText }}>
        {showSubtotal ? <div className="flex justify-between" data-cd-total-row="subtotal"><span>{tCd("subtotal", locale)}</span><span>{formatLak(subtotal)} LAK</span></div> : null}
        {showDiscount && showPromoInfo && meaningfulAmount(promotion) ? <div className="flex justify-between" data-cd-total-row="promotion"><span>{tCd("discount", locale)}</span><span>-{formatLak(promotion)} LAK</span></div> : null}
        {showDiscount && member && meaningfulAmount(memberDiscount) ? <div className="flex justify-between" data-cd-total-row="member"><span>{tCd("discount", locale)}</span><span>-{formatLak(memberDiscount)} LAK</span></div> : null}
        {showDiscount && meaningfulAmount(manual) ? <div className="flex justify-between" data-cd-total-row="manual"><span>{tCd("discount", locale)}</span><span>-{formatLak(manual)} LAK</span></div> : null}
        {showDiscount && meaningfulAmount(redeem) ? <div className="flex justify-between" data-cd-total-row="redeem"><span>{tCd("discount", locale)}</span><span>-{formatLak(redeem)} LAK</span></div> : null}
        {showPromoInfo ? <AppliedPromotionNote displayState={displayState} /> : null}
      </div>
      <div className={cn("mt-2 px-3 py-2", chrome.totals === "outlined" ? "border-2" : chrome.totals === "full-width" ? "" : "rounded-xl")} style={{ backgroundColor: theme.totalBackground, color: theme.totalText, borderColor: theme.border }}>
        <div className="text-xs font-black uppercase tracking-wide">{tCd("grandTotal", locale)}</div>
        <div className="text-[clamp(2.1rem,6vw,4.2rem)] font-black leading-none">{formatLak(displayState.totalLak)} LAK</div>
      </div>
    </section>
  );
}

function AppliedPromotionNote({ displayState }: { displayState: PosDisplayState }) {
  const label = displayState.appliedPromotions.find((entry) => entry.trim())?.trim();
  if (!label) return null;
  return (
    <div className="truncate text-xs" data-cd-promo-info="text">
      {label}
    </div>
  );
}

function GuestOrMember({ displayState, light = false }: { displayState: PosDisplayState; light?: boolean }) {
  return <MemberName displayState={displayState} light={light} />;
}

function HeaderMeta({ displayState, light = false }: { displayState: PosDisplayState; light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <PaymentBadge />
      <MemberName displayState={displayState} light={light} />
    </div>
  );
}

function PaymentBadge() {
  const locale = useDisplayLocale();
  const mode = useDisplayMode();
  const theme = useTheme();
  if (mode !== "payment") {
    return null;
  }
  return (
    <div
      className="inline-flex h-fit items-center rounded-full px-2 py-1 text-sm font-black"
      data-cd-payment-badge="on"
      style={{ backgroundColor: theme.totalBackground, color: theme.totalText }}
    >
      {tCd("payment", locale)}
    </div>
  );
}

function MemberName({ displayState, light = false }: { displayState: PosDisplayState; light?: boolean }) {
  const theme = useTheme();
  const locale = useDisplayLocale();
  const name = customerDisplayMemberName(displayState);
  if (!name) {
    return null;
  }
  return (
    <div
      className="inline-flex h-fit items-center gap-1 rounded-full px-2 py-1 text-sm font-black"
      data-cd-member="name"
      data-cd-member-field="name"
      style={{ color: light ? "inherit" : theme.text, backgroundColor: light ? "transparent" : theme.soft }}
    >
      <Trophy className="size-4" />
      {tCd("member", locale)}: {name}
    </div>
  );
}

function ReturningNote({ seconds }: { seconds: number }) {
  const locale = useDisplayLocale();
  return (
    <p className="mt-3 text-sm font-semibold" data-cd-return="timer">
      {fillCustomerDisplayCopy(tCd("returningIn", locale), { seconds })}
    </p>
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
  const locale = useDisplayLocale();
  const tokens = customerDisplayQrStyleTokens(styleId);
  return (
    <div className="absolute inset-0 z-20 grid place-items-center p-3" style={{ backgroundColor: tokens.background, color: tokens.text }}>
      <div className="grid w-full max-w-xl gap-3 rounded-3xl border-4 p-4 text-center" style={{ borderColor: tokens.border, backgroundColor: tokens.panel }}>
        <div className="text-sm font-black uppercase" style={{ color: tokens.primary }}>{tCd("scanToPay", locale)}</div>
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

function SlideContent({ fallbackLabel, slide }: { fallbackLabel?: string; slide: CustomerDisplaySlide }) {
  const theme = useTheme();
  if (slide.type === "video") {
    return <video autoPlay className="h-full min-h-0 w-full object-cover" loop muted playsInline src={slide.url} />;
  }
  if (slide.type === "image") {
    return <img alt={slide.name} className="h-full min-h-0 w-full object-cover" src={slide.url} />;
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-start p-3" data-cd-welcome="start">
      <Gift className="size-7" style={{ color: theme.primary }} />
      <div className="mt-2 text-[clamp(1.1rem,2.2vw,1.7rem)] font-black leading-tight">
        {slide.type === "message" ? slide.message || fallbackLabel : fallbackLabel}
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
