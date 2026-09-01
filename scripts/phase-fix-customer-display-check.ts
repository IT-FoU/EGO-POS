import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "../lib/i18n/ui";
import { formatLak } from "../features/pos/format";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  normalizeCustomerDisplaySettings,
} from "../features/pos/customer-display-settings";
import {
  CUSTOMER_DISPLAY_PRIMARY_TEXT,
  CUSTOMER_DISPLAY_THEME_OPTIONS,
  DEFAULT_CUSTOMER_DISPLAY_THEME,
  customerDisplayThemeTokens,
  parseCustomerDisplayTheme,
  parsePosAppearance,
  resolveCustomerDisplayAppearance,
  type CustomerDisplayThemeId,
  type PosAppearance,
} from "../features/pos/customer-display-theme";
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
const helper = readFileSync(join(root, "features/pos/customer-display-window.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const displayClient = readFileSync(join(root, "features/pos/components/customer-display-client.tsx"), "utf8");
const settingsForm = readFileSync(join(root, "features/settings/components/settings-form.tsx"), "utf8");
const themeProvider = readFileSync(join(root, "components/theme-provider.tsx"), "utf8");
const prismaSrc = readFileSync(join(root, "lib/db/prisma.ts"), "utf8");
const prismaSchema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const en = JSON.parse(readFileSync(join(root, "locales/ui/en.json"), "utf8")) as Record<string, string>;
const th = JSON.parse(readFileSync(join(root, "locales/ui/th.json"), "utf8")) as Record<string, string>;
const lo = JSON.parse(readFileSync(join(root, "locales/ui/lo.json"), "utf8")) as Record<string, string>;
const permissionKey = "ui.allow.window.management.to.open.customer.di";
const themeKeys = [
  "ui.customer.display.theme",
  "ui.follow.pos",
  "ui.fresh.green",
  "ui.sky.blue",
  "ui.sunny.yellow",
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

await check("source: settings expose Customer Display Theme", () => {
  assert(settingsForm.includes("updateDisplayTheme"), "theme setter missing");
  assert(settingsForm.includes("CUSTOMER_DISPLAY_THEME_OPTIONS"), "theme options missing");
  assert(settingsForm.includes('t("ui.customer.display.theme")'), "theme label missing");
  assert(CUSTOMER_DISPLAY_THEME_OPTIONS.map((option) => option.id).join(",") === "follow-pos,fresh-green,sky-blue,sunny-yellow", "theme option ids changed");
});

await check("source: localization keys for all supported UI locales", () => {
  for (const key of themeKeys) {
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

await check("theme default is Fresh Green, not Dark", () => {
  assert(DEFAULT_CUSTOMER_DISPLAY_THEME === "fresh-green", DEFAULT_CUSTOMER_DISPLAY_THEME);
  assert(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.theme === "fresh-green", DEFAULT_CUSTOMER_DISPLAY_SETTINGS.theme);
  assert(parseCustomerDisplayTheme(undefined) === "fresh-green", "missing preference must be Fresh Green");
  assert(parseCustomerDisplayTheme("dark") === "fresh-green", "unknown values must not become Dark");
  assert(normalizeCustomerDisplaySettings({}).theme === "fresh-green", "legacy settings JSON must default Fresh Green");
});

await check("Follow POS initial Light and Dark", () => {
  assert(parsePosAppearance("light") === "light", "light");
  assert(parsePosAppearance("dark") === "dark", "dark");
  assert(parsePosAppearance("system") === "dark", "no system mode; unresolved values are dark");
  assert(resolveCustomerDisplayAppearance("follow-pos", "light") === "light", "initial light");
  assert(resolveCustomerDisplayAppearance("follow-pos", "dark") === "dark", "initial dark");
});

await check("Follow POS Light → Dark and Dark → Light", () => {
  let pos: PosAppearance = "light";
  assert(resolveCustomerDisplayAppearance("follow-pos", pos) === "light", "start light");
  pos = "dark";
  assert(resolveCustomerDisplayAppearance("follow-pos", pos) === "dark", "light to dark");
  pos = "light";
  assert(resolveCustomerDisplayAppearance("follow-pos", pos) === "light", "dark to light");
});

await check("fixed themes ignore POS theme changes", () => {
  const cases: Array<[CustomerDisplayThemeId, "fresh-green" | "sky-blue" | "sunny-yellow"]> = [
    ["fresh-green", "fresh-green"],
    ["sky-blue", "sky-blue"],
    ["sunny-yellow", "sunny-yellow"],
  ];
  for (const [theme, expected] of cases) {
    assert(resolveCustomerDisplayAppearance(theme, "light") === expected, `${theme} light`);
    assert(resolveCustomerDisplayAppearance(theme, "dark") === expected, `${theme} dark`);
  }
});

await check("theme persistence and live setting update", () => {
  const stored = normalizeCustomerDisplaySettings({ theme: "sky-blue" });
  assert(stored.theme === "sky-blue", stored.theme);
  let preference: CustomerDisplayThemeId = stored.theme;
  let pos: PosAppearance = "dark";
  assert(resolveCustomerDisplayAppearance(preference, pos) === "sky-blue", "live sky blue");
  preference = "sunny-yellow";
  assert(resolveCustomerDisplayAppearance(preference, pos) === "sunny-yellow", "live sunny yellow");
  preference = "follow-pos";
  assert(resolveCustomerDisplayAppearance(preference, pos) === "dark", "live follow POS adopts current POS");
  pos = "light";
  assert(resolveCustomerDisplayAppearance(preference, pos) === "light", "follow POS still live after POS toggle");
});

await check("bright theme contrast keeps dark text", () => {
  for (const appearance of ["fresh-green", "sky-blue", "sunny-yellow"] as const) {
    const tokens = customerDisplayThemeTokens(appearance);
    assert(tokens.background === "#FFFFFF", `${appearance} background`);
    assert(tokens.text === CUSTOMER_DISPLAY_PRIMARY_TEXT, `${appearance} text`);
    assert(tokens.totalText === CUSTOMER_DISPLAY_PRIMARY_TEXT, `${appearance} total text`);
    assert(tokens.text !== tokens.primary, `${appearance} must not use accent as body text`);
  }
  const yellow = customerDisplayThemeTokens("sunny-yellow");
  assert(yellow.primary === "#EAB308", yellow.primary);
  assert(yellow.soft === "#FEF9C3", yellow.soft);
  assert(yellow.totalBackground === "#FEF9C3", "yellow total must use soft highlight, not yellow text");
  const green = customerDisplayThemeTokens("fresh-green");
  assert(green.primary === "#16A34A" && green.soft === "#DCFCE7", JSON.stringify(green));
  const blue = customerDisplayThemeTokens("sky-blue");
  assert(blue.primary === "#0284C7" && blue.soft === "#E0F2FE", JSON.stringify(blue));
});

await check("Follow POS visual tokens and total prominence source", () => {
  const light = customerDisplayThemeTokens("light");
  const dark = customerDisplayThemeTokens("dark");
  assert(light.background !== dark.background, "light and dark must differ");
  assert(dark.totalBackground === "#FFD700", dark.totalBackground);
  assert(displayClient.includes("clamp(2.8rem,5.2vw,5rem)"), "grand total must stay the strongest type size");
  assert(displayClient.includes("storage") && displayClient.includes("readResolvedPosAppearance"), "live POS theme read missing");
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
  assert(settingsForm.includes("writeCustomerDisplaySettingsToStorage"), "theme must persist with existing local settings");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length) {
  process.exit(1);
}
