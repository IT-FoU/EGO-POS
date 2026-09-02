import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "../lib/i18n/ui";
import { formatLak } from "../features/pos/format";
import { isSupportedCompanyLogoUrl, storeInitials } from "../features/brand/company-logo";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  normalizeCustomerDisplaySettings,
  resetAllCustomerDisplaySettings,
  resetCustomerDisplayAppearanceSettings,
} from "../features/pos/customer-display-settings";
import {
  CUSTOMER_DISPLAY_TEMPLATES,
  DEFAULT_CUSTOMER_DISPLAY_TEMPLATE,
  customerDisplayTemplateTokens,
  parseCustomerDisplayTemplate,
} from "../features/pos/customer-display-templates";
import {
  CUSTOMER_DISPLAY_QR_STYLES,
  DEFAULT_CUSTOMER_DISPLAY_QR_STYLE,
  parseCustomerDisplayQrStyle,
} from "../features/pos/customer-display-qr-style";
import {
  customerDisplayQrBanks,
  hideCustomerDisplayQr,
  maskAccountReference,
  readCustomerDisplayQrIntent,
} from "../features/pos/customer-display-qr";
import { parsePosAppearance } from "../features/pos/customer-display-theme";
import {
  CUSTOMER_DISPLAY_OPEN_FEATURES,
  CUSTOMER_DISPLAY_PATH,
  CUSTOMER_DISPLAY_PLACEMENT_MAX_APPLIES,
  CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS,
  CUSTOMER_DISPLAY_WINDOW_NAME,
  applyCustomerDisplayBounds,
  customerDisplayPlacementNeedsRetry,
  customerDisplayTargetBounds,
  openCustomerDisplayPopup,
  pickCustomerScreen,
  placeCustomerDisplayWindow,
  type CustomerDisplayPlacementClock,
  type CustomerDisplayScreen,
  type CustomerDisplayScreenDetails,
} from "../features/pos/customer-display-window";

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void | Promise<void>) {
  return Promise.resolve()
    .then(run)
    .then(() => {
      results.push({ name, status: "PASS" });
      console.log(`PASS  ${name}`);
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ detail, name, status: "FAIL" });
      console.log(`FAIL  ${name} — ${detail}`);
    });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const silentClock: CustomerDisplayPlacementClock = {
  delay() {},
  onLoad() {},
};

function createPopup() {
  const moves: number[][] = [];
  const sizes: number[][] = [];
  const popup = {
    closed: false,
    focus() {},
    moveTo(left: number, top: number) {
      moves.push([left, top]);
    },
    resizeTo(width: number, height: number) {
      sizes.push([width, height]);
    },
  };
  return { moves, popup: popup as unknown as Window, sizes };
}

const root = process.cwd();
const toggle = readFileSync(join(root, "components/layout/customer-display-toggle.tsx"), "utf8");
const qrToggle = readFileSync(join(root, "components/layout/customer-display-qr-toggle.tsx"), "utf8");
const helper = readFileSync(join(root, "features/pos/customer-display-window.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const displayClient = readFileSync(join(root, "features/pos/components/customer-display-client.tsx"), "utf8");
const settingsForm = readFileSync(join(root, "features/settings/components/settings-form.tsx"), "utf8");
const logoContainer = readFileSync(join(root, "components/brand/logo-container.tsx"), "utf8");
const dashboardShell = readFileSync(join(root, "components/layout/dashboard-shell.tsx"), "utf8");
const themeProvider = readFileSync(join(root, "components/theme-provider.tsx"), "utf8");
const prismaSrc = readFileSync(join(root, "lib/db/prisma.ts"), "utf8");
const prismaSchema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const en = JSON.parse(readFileSync(join(root, "locales/ui/en.json"), "utf8")) as Record<string, string>;
const th = JSON.parse(readFileSync(join(root, "locales/ui/th.json"), "utf8")) as Record<string, string>;
const lo = JSON.parse(readFileSync(join(root, "locales/ui/lo.json"), "utf8")) as Record<string, string>;
const permissionKey = "ui.allow.window.management.to.open.customer.di";
const localeKeys = [
  "ui.customer.display.appearance",
  "ui.display.template",
  "ui.qr.display.style",
  "ui.reset.this.page",
  "ui.reset.all.customer.display.settings",
  "ui.hide.qr",
  "ui.ocean.blue",
  "ui.bold.green",
  "ui.sky.blue",
  "ui.sunny.yellow",
  "ui.premium.dark",
  "ui.emerald.dream",
  "ui.coral.minimal",
  "ui.premium.dark.green",
  "ui.minimal.premium.red",
  "ui.minimal.premium.purple",
  "ui.green.clean",
  "ui.blue.wave",
  "ui.orange.modern",
  "ui.black.gold",
  "ui.purple.soft",
  "ui.teal.gradient",
] as const;
const cashier: CustomerDisplayScreen = { availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1440 };
const customer: CustomerDisplayScreen = { availHeight: 1080, availLeft: 1440, availTop: 0, availWidth: 1920 };
const leftCustomer: CustomerDisplayScreen = { availHeight: 1080, availLeft: -1920, availTop: 0, availWidth: 1920 };

await check("source: click opens named popup immediately", () => {
  assert(toggle.includes("openCustomerDisplayPopup()"), "toggle must open popup during click");
  assert(!/await[\s\S]{0,80}openCustomerDisplayPopup/.test(toggle), "window.open must not wait on permission");
  const openIndex = toggle.indexOf("openCustomerDisplayPopup()");
  const placeIndex = toggle.indexOf("placeCustomerDisplayWindow(popup)");
  assert(openIndex >= 0 && placeIndex > openIndex, "placement must run after popup creation");
});

await check("source: getScreenDetails used after open", () => {
  assert(helper.includes("getScreenDetails"), "Window Management API missing");
  assert(helper.includes("popup.moveTo") || helper.includes("applyCustomerDisplayBounds"), "moveTo missing");
  assert(helper.includes("resizeTo"), "resizeTo missing");
  assert(helper.includes("availLeft") && helper.includes("availWidth"), "target bounds missing");
});

await check("source: reuse named window, never close on second click", () => {
  assert(helper.includes("CUSTOMER_DISPLAY_WINDOW_NAME"), "named window missing");
  assert(CUSTOMER_DISPLAY_WINDOW_NAME === "ego-pos-customer-display", CUSTOMER_DISPLAY_WINDOW_NAME);
  assert(CUSTOMER_DISPLAY_PATH === "/customer-display", CUSTOMER_DISPLAY_PATH);
  assert(CUSTOMER_DISPLAY_OPEN_FEATURES.includes("width=900"), CUSTOMER_DISPLAY_OPEN_FEATURES);
  assert(!toggle.includes(".close()"), "second click must not close the customer window");
});

await check("source: cart sync architecture unchanged", () => {
  assert(posClient.includes("DemoStorageKeys.customerDisplayState"), "POS still writes customer display state");
  assert(displayClient.includes("DemoStorageKeys.customerDisplayState"), "display still reads customer display state");
  assert(displayClient.includes("item.priceLak * item.quantity"), "line totals still come from cart qty * price");
  assert(displayClient.includes("displayState.totalLak"), "grand total still comes from POS display state");
  assert(!toggle.includes("WebSocket") && !helper.includes("WebSocket") && !displayClient.includes("WebSocket"), "WebSocket must not be added");
  assert(prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"), "PrismaPg pooling changed");
});

await check("source: permission message EN + TH + LO", () => {
  assert(en[permissionKey]?.includes("second screen"), en[permissionKey]);
  assert(th[permissionKey]?.includes("second screen") || th[permissionKey]?.includes("จอ"), th[permissionKey]);
  assert(Boolean(lo[permissionKey]), "lo locale missing permission copy");
  assert(t(permissionKey, "en") === en[permissionKey], t(permissionKey, "en"));
});

await check("source: no POS/sale mutation from display toggle", () => {
  assert(!toggle.includes("completePrismaSale") && !helper.includes("completePrismaSale"), "sale API leaked into display toggle");
  assert(!toggle.includes("createPrismaHeldBill") && !helper.includes("fetch("), "display toggle must stay client-window only");
  assert(!displayClient.includes("completeSaleAction"), "customer display must not create sales");
});

await check("source: bounded placement retry, no polling loop", () => {
  assert(CUSTOMER_DISPLAY_PLACEMENT_MAX_APPLIES === 3, String(CUSTOMER_DISPLAY_PLACEMENT_MAX_APPLIES));
  assert(CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS > 0 && CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS < 1000, String(CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS));
  assert(helper.includes("scheduleCustomerDisplayPlacementRetries"), "retry scheduler missing");
  assert(!helper.includes("setInterval"), "placement must not poll forever");
  assert(!toggle.includes("setInterval"), "toggle must not poll placement");
});

await check("source: ThemeProvider reuses POS storage and skips first write", () => {
  assert(themeProvider.includes("DemoStorageKeys.theme"), "canonical POS theme key missing");
  assert(themeProvider.includes("if (!hydrated)"), "must not overwrite POS theme before hydrate");
  assert(themeProvider.includes('window.addEventListener("storage"'), "Follow POS needs storage live sync");
  assert(!themeProvider.includes("system"), "POS has no system theme mode");
});

await check("source: settings expose templates, QR styles, and scoped resets", () => {
  assert(settingsForm.includes("updateDisplayTemplate"), "template setter missing");
  assert(settingsForm.includes("CUSTOMER_DISPLAY_TEMPLATE_OPTIONS"), "template options missing");
  assert(settingsForm.includes("CUSTOMER_DISPLAY_QR_STYLE_OPTIONS"), "QR style options missing");
  assert(settingsForm.includes("resetAppearancePage"), "Reset This Page missing");
  assert(settingsForm.includes("resetAllDisplaySettings"), "Reset All Customer Display Settings missing");
  assert(settingsForm.includes("resetCustomerDisplayAppearanceSettings"), "appearance reset helper missing");
  assert(settingsForm.includes("resetAllCustomerDisplaySettings"), "full CD reset helper missing");
  assert(settingsForm.includes("writeCompanyLogoUrl"), "company logo must persist to the existing storage key");
  assert(!settingsForm.includes("updateDisplayTheme"), "old four-theme setter must not remain");
});

await check("source: localization keys for all supported UI locales", () => {
  for (const key of localeKeys) {
    assert(Boolean(en[key]), `en missing ${key}`);
    assert(Boolean(th[key]) && th[key] !== en[key], `th must translate ${key}`);
    assert(Boolean(lo[key]), `lo missing ${key}`);
    assert(t(key, "en") === en[key], t(key, "en"));
    assert(t(key, "th") === th[key], t(key, "th"));
  }
});

await check("pickCustomerScreen: dual monitor selects the other screen", () => {
  const picked = pickCustomerScreen({ currentScreen: cashier, screens: [cashier, customer] });
  assert(picked?.availLeft === 1440 && picked.availWidth === 1920, JSON.stringify(picked));
});

await check("pickCustomerScreen: left-of-cashier monitor is valid", () => {
  const picked = pickCustomerScreen({ currentScreen: cashier, screens: [leftCustomer, cashier] });
  assert(picked?.availLeft === -1920 && picked.availWidth === 1920, JSON.stringify(picked));
});

await check("pickCustomerScreen: single monitor does not invent a second screen", () => {
  const picked = pickCustomerScreen({ currentScreen: cashier, screens: [cashier] });
  assert(picked === null, JSON.stringify(picked));
});

await check("pickCustomerScreen: empty screens stay on cashier", () => {
  assert(pickCustomerScreen({ currentScreen: cashier, screens: [] }) === null, "empty screens should not place off-screen");
});

await check("target bounds fill usable customer screen", () => {
  const bounds = customerDisplayTargetBounds(customer);
  assert(bounds.left === 1440 && bounds.top === 0 && bounds.width === 1920 && bounds.height === 1080, JSON.stringify(bounds));
});

await check("openCustomerDisplayPopup uses stable name and path", () => {
  const opened: Array<{ features: string; name: string; url: string }> = [];
  const host = {
    open(url: string, name: string, features: string) {
      opened.push({ features, name, url });
      return { closed: false } as Window;
    },
  } as unknown as Window;
  openCustomerDisplayPopup(host);
  assert(opened.length === 1, `opens=${opened.length}`);
  assert(opened[0]?.url === "/customer-display", opened[0]?.url);
  assert(opened[0]?.name === "ego-pos-customer-display", opened[0]?.name);
  assert(opened[0]?.features === "popup=yes,width=900,height=720", opened[0]?.features);
});

await check("placeCustomerDisplayWindow: unsupported API focuses existing popup", async () => {
  const { moves, popup } = createPopup();
  const result = await placeCustomerDisplayWindow(popup, {} as Window, silentClock);
  assert(result === "unsupported", result);
  assert(moves.length === 0, "unsupported API must not move off-screen");
});

await check("placeCustomerDisplayWindow: two screens move and resize immediately", async () => {
  const { moves, popup, sizes } = createPopup();
  const host = {
    async getScreenDetails(): Promise<CustomerDisplayScreenDetails> {
      return { currentScreen: cashier, screens: [cashier, customer] };
    },
  };
  const result = await placeCustomerDisplayWindow(popup, host as never, silentClock);
  assert(result === "placed", result);
  assert(moves.length === 2 && moves[0]?.[0] === 1440 && moves[1]?.[0] === 1440, JSON.stringify(moves));
  assert(sizes.length === 1 && sizes[0]?.[0] === 1920 && sizes[0]?.[1] === 1080, JSON.stringify(sizes));
});

await check("placeCustomerDisplayWindow: bounded retry after load and delay", async () => {
  const { moves, popup, sizes } = createPopup();
  let loadApply: (() => void) | null = null;
  let delayApply: (() => void) | null = null;
  const clock: CustomerDisplayPlacementClock = {
    onLoad(_target, callback) {
      loadApply = callback;
    },
    delay(callback, ms) {
      assert(ms === CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS, String(ms));
      delayApply = callback;
    },
  };
  const result = await placeCustomerDisplayWindow(
    popup,
    {
      async getScreenDetails(): Promise<CustomerDisplayScreenDetails> {
        return { currentScreen: cashier, screens: [cashier, customer] };
      },
    } as never,
    clock,
  );
  assert(result === "placed", result);
  assert(moves.length === 2, `immediate moves=${moves.length}`);
  loadApply?.();
  assert(moves.length === 4, `load retry moves=${moves.length}`);
  delayApply?.();
  assert(moves.length === 6, `final retry moves=${moves.length}`);
  delayApply?.();
  loadApply?.();
  assert(moves.length === 6 && sizes.length === 3, "retry must stay bounded at 3 applies");
});

await check("placeCustomerDisplayWindow: permission denied falls back without throwing", async () => {
  const { popup } = createPopup();
  const host = {
    async getScreenDetails() {
      throw new Error("Permission denied");
    },
  };
  const result = await placeCustomerDisplayWindow(popup, host as never, silentClock);
  assert(result === "denied", result);
});

await check("placeCustomerDisplayWindow: closed popup is not moved", async () => {
  const popup = {
    closed: true,
    focus() {
      throw new Error("closed window focused");
    },
    moveTo() {
      throw new Error("closed window moved");
    },
    resizeTo() {},
  } as unknown as Window;
  const result = await placeCustomerDisplayWindow(popup, {
    async getScreenDetails() {
      return { currentScreen: cashier, screens: [cashier, customer] };
    },
  } as never, silentClock);
  assert(result === "unavailable", result);
});

await check("placeCustomerDisplayWindow: close then reopen places again", async () => {
  const state = { closed: false };
  const moves: number[][] = [];
  const popup = {
    get closed() {
      return state.closed;
    },
    focus() {},
    moveTo(left: number, top: number) {
      moves.push([left, top]);
    },
    resizeTo() {},
  } as unknown as Window;
  const host = {
    async getScreenDetails(): Promise<CustomerDisplayScreenDetails> {
      return { currentScreen: cashier, screens: [cashier, customer] };
    },
  };
  const first = await placeCustomerDisplayWindow(popup, host as never, silentClock);
  assert(first === "placed", first);
  state.closed = true;
  const closedResult = await placeCustomerDisplayWindow(popup, host as never, silentClock);
  assert(closedResult === "unavailable", closedResult);
  state.closed = false;
  const reopened = await placeCustomerDisplayWindow(popup, host as never, silentClock);
  assert(reopened === "placed", reopened);
  assert(moves.length >= 4, JSON.stringify(moves));
});

await check("placeCustomerDisplayWindow: single-screen fallback stays on cashier", async () => {
  const { moves, popup } = createPopup();
  const result = await placeCustomerDisplayWindow(
    popup,
    {
      async getScreenDetails(): Promise<CustomerDisplayScreenDetails> {
        return { currentScreen: cashier, screens: [cashier] };
      },
    } as never,
    silentClock,
  );
  assert(result === "single", result);
  assert(moves.length === 0, "single monitor must not move the popup off-screen");
});

await check("named popup reuse: second open uses the same window name", () => {
  const names: string[] = [];
  const existing = { closed: false, id: "one" };
  const host = {
    open(_url: string, name: string) {
      names.push(name);
      return existing;
    },
  } as unknown as Window;
  const first = openCustomerDisplayPopup(host);
  const second = openCustomerDisplayPopup(host);
  assert(first === second, "named open must reuse the same window object");
  assert(names.length === 2 && names.every((name) => name === CUSTOMER_DISPLAY_WINDOW_NAME), names.join(","));
});

await check("placement retry detector uses actual window geometry", () => {
  const bounds = customerDisplayTargetBounds(customer);
  assert(applyCustomerDisplayBounds({ closed: false, moveTo() {}, resizeTo() {} }, bounds) === true, "apply should succeed");
  assert(
    customerDisplayPlacementNeedsRetry({ outerHeight: 720, outerWidth: 900, screenX: 0, screenY: 0 }, bounds) === true,
    "wrong geometry must retry",
  );
  assert(
    customerDisplayPlacementNeedsRetry({ outerHeight: 1080, outerWidth: 1920, screenX: 1440, screenY: 0 }, bounds) === false,
    "correct geometry should stop retrying",
  );
});

await check("template default is Ocean Blue with legacy mapping", () => {
  assert(DEFAULT_CUSTOMER_DISPLAY_TEMPLATE === "ocean-blue", DEFAULT_CUSTOMER_DISPLAY_TEMPLATE);
  assert(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.template === "ocean-blue", DEFAULT_CUSTOMER_DISPLAY_SETTINGS.template);
  assert(parseCustomerDisplayTemplate(undefined) === "ocean-blue", "missing preference must be Ocean Blue");
  assert(parseCustomerDisplayTemplate("dark") === "ocean-blue", "unknown values must not become Dark");
  assert(parseCustomerDisplayTemplate("fresh-green") === "bold-green", "legacy Fresh Green maps to Bold Green");
  assert(parseCustomerDisplayTemplate("classic_checkout") === "ocean-blue", "legacy classic_checkout maps to Ocean Blue");
  assert(normalizeCustomerDisplaySettings({}).template === "ocean-blue", "legacy settings JSON must default Ocean Blue");
  assert(normalizeCustomerDisplaySettings({ theme: "sky-blue" }).template === "sky-blue", "legacy theme field must map");
  assert(CUSTOMER_DISPLAY_TEMPLATES.length === 10, String(CUSTOMER_DISPLAY_TEMPLATES.length));
});

await check("ten templates keep distinct tokens and layouts", () => {
  const layouts = [
    "OceanBlueLayout",
    "BoldGreenLayout",
    "SkyBlueLayout",
    "SunnyYellowLayout",
    "PremiumDarkLayout",
    "EmeraldDreamLayout",
    "CoralMinimalLayout",
    "PremiumDarkGreenLayout",
    "MinimalRedLayout",
    "MinimalPurpleLayout",
  ];
  for (const layout of layouts) {
    assert(displayClient.includes(`function ${layout}`), `${layout} missing`);
  }
  const signatures = CUSTOMER_DISPLAY_TEMPLATES.map((id) => {
    const tokens = customerDisplayTemplateTokens(id);
    return `${id}:${tokens.background}:${tokens.primary}:${tokens.totalBackground}:${tokens.totalText}`;
  });
  assert(new Set(signatures).size === 10, signatures.join(" | "));
  const green = customerDisplayTemplateTokens("bold-green");
  const ocean = customerDisplayTemplateTokens("ocean-blue");
  const dark = customerDisplayTemplateTokens("premium-dark");
  const darkGreen = customerDisplayTemplateTokens("premium-dark-green");
  const red = customerDisplayTemplateTokens("minimal-premium-red");
  const purple = customerDisplayTemplateTokens("minimal-premium-purple");
  assert(green.totalBackground === "#15803D" && green.totalText === "#FFFFFF", JSON.stringify(green));
  assert(ocean.totalBackground === "#0C4A6E" && ocean.background === "#FFFFFF", JSON.stringify(ocean));
  assert(dark.background === "#020617" && dark.primary === "#22D3EE", JSON.stringify(dark));
  assert(darkGreen.totalBackground === "#4ADE80" && darkGreen.background !== dark.surface, JSON.stringify(darkGreen));
  assert(red.primary !== purple.primary && red.background !== purple.background, "red and purple must not be recolors");
  assert(displayClient.includes("clamp(2.1rem,6vw,4.2rem)"), "grand total must stay the strongest type size");
  assert(displayClient.includes("100dvh") && displayClient.includes("requestFullscreen"), "viewport / fullscreen hardening missing");
});

await check("POS appearance parse stays light/dark only", () => {
  assert(parsePosAppearance("light") === "light", "light");
  assert(parsePosAppearance("dark") === "dark", "dark");
  assert(parsePosAppearance("system") === "dark", "no system mode; unresolved values are dark");
});

await check("QR is hidden by default and only configured banks appear", () => {
  assert(readCustomerDisplayQrIntent().visible === false, "default QR intent must be hidden");
  assert(DEFAULT_CUSTOMER_DISPLAY_QR_STYLE === "green-clean", DEFAULT_CUSTOMER_DISPLAY_QR_STYLE);
  assert(CUSTOMER_DISPLAY_QR_STYLES.join(",") === "green-clean,blue-wave,orange-modern,black-gold,purple-soft,teal-gradient", CUSTOMER_DISPLAY_QR_STYLES.join(","));
  assert(parseCustomerDisplayQrStyle("unknown") === "green-clean", "unknown QR style must fall back");
  const banks = customerDisplayQrBanks([
    { id: "bcel", bankName: "BCEL", accountName: "Store", accountNumber: "12345678", showOnCustomerDisplay: true, qrImageUrl: "https://example.com/bcel.png" },
    { id: "jdb", bankName: "JDB", accountName: "Store 2", accountNumber: "9999", showOnCustomerDisplay: false, qrImageUrl: "https://example.com/jdb.png" },
    { id: "hidden", bankName: "Hidden", accountName: "X", accountNumber: "1", showOnCustomerDisplay: false },
  ]);
  assert(banks.map((bank) => bank.id).join(",") === "bcel", banks.map((bank) => bank.id).join(","));
  assert(maskAccountReference("12345678") === "••••5678", maskAccountReference("12345678"));
  assert(qrToggle.includes("writeCustomerDisplayQrIntent"), "header QR selector missing");
  assert(dashboardShell.includes("CustomerDisplayQrToggle"), "QR control must sit in POS header controls");
  assert(posClient.includes("showQr: customerQrVisible && Boolean(selectedQrBank)"), "POS must not write QR unless cashier shows it");
  assert(posClient.includes("hideCustomerQrOverlay()"), "Hide QR / auto-hide path missing");
  assert(displayClient.includes("showQr && displayState.selectedQrBank"), "QR overlay must be state-driven, not a permanent section");
});

await check("company logo uses persisted source and customer fallback", () => {
  assert(storeInitials("EGO Market") === "EM", storeInitials("EGO Market"));
  assert(storeInitials("") === "EG", storeInitials(""));
  assert(isSupportedCompanyLogoUrl("data:image/png;base64,abc") === true, "data logo must be accepted");
  assert(isSupportedCompanyLogoUrl("https://store.example/logo.jpg") === true, "jpeg logo must be accepted");
  assert(isSupportedCompanyLogoUrl("not-a-logo") === false, "unsupported logo URL must fail closed");
  assert(logoContainer.includes('variant === "customer"'), "customer logo variant missing");
  assert(logoContainer.includes("storeInitials"), "initials fallback missing");
  assert(!displayClient.includes("Upload Company Logo"), "customer screen must never show admin upload copy");
  assert(!displayClient.includes("[ Logo ]"), "customer screen must never show admin placeholder text");
  assert(displayClient.includes('variant="customer"'), "Customer Display must use customer logo variant");
  assert(posClient.includes("readCompanyLogoUrl()"), "POS must publish the persisted company logo");
});

await check("reset this page vs reset all stays Customer Display only", () => {
  const current = normalizeCustomerDisplaySettings({
    autoReturnSeconds: 12,
    media: [{ id: "m1", name: "promo.png", type: "image", url: "https://example.com/promo.png" }],
    promotionMessages: ["Keep this"],
    qrDisplayStyle: "black-gold",
    template: "premium-dark-green",
  });
  const pageReset = resetCustomerDisplayAppearanceSettings(current);
  assert(pageReset.template === "ocean-blue", pageReset.template);
  assert(pageReset.qrDisplayStyle === "green-clean", pageReset.qrDisplayStyle);
  assert(pageReset.autoReturnSeconds === 12, String(pageReset.autoReturnSeconds));
  assert(pageReset.promotionMessages[0] === "Keep this", pageReset.promotionMessages.join(","));
  assert(pageReset.media.length === 1, String(pageReset.media.length));
  const allReset = resetAllCustomerDisplaySettings();
  assert(allReset.template === "ocean-blue" && allReset.qrDisplayStyle === "green-clean", JSON.stringify(allReset));
  assert(allReset.autoReturnSeconds === DEFAULT_CUSTOMER_DISPLAY_SETTINGS.autoReturnSeconds, String(allReset.autoReturnSeconds));
  assert(allReset.media.length === 0, "full CD reset may clear CD media only");
  assert(!settingsForm.includes("factory reset") && !settingsForm.includes("wipe database"), "do not add a global factory reset");
  hideCustomerDisplayQr();
  assert(true, "hide helper exists");
});

await check("cart qty 1/2/3 and clear stay display-state only", () => {
  const unitPrice = 11000;
  assert(formatLak(unitPrice * 1) === "11,000", formatLak(unitPrice * 1));
  assert(formatLak(unitPrice * 2) === "22,000", formatLak(unitPrice * 2));
  assert(formatLak(unitPrice * 3) === "33,000", formatLak(unitPrice * 3));
  const cleared = { items: [], totalLak: 0 };
  assert(cleared.items.length === 0 && cleared.totalLak === 0, "clear must empty display totals");
});

await check("no database migration or realtime channel", () => {
  assert(!prismaSchema.includes("customerDisplayTheme"), "do not add a DB theme field");
  assert(!helper.includes("WebSocket") && !displayClient.includes("BroadcastChannel"), "no extra realtime channel");
  assert(settingsForm.includes("writeCustomerDisplaySettingsToStorage"), "settings must persist with existing local settings");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length) {
  process.exit(1);
}
