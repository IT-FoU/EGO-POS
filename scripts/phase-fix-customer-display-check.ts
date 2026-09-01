import { readFileSync } from "node:fs";
import { join } from "node:path";
import { t } from "../lib/i18n/ui";
import {
  CUSTOMER_DISPLAY_OPEN_FEATURES,
  CUSTOMER_DISPLAY_PATH,
  CUSTOMER_DISPLAY_WINDOW_NAME,
  customerDisplayTargetBounds,
  openCustomerDisplayPopup,
  pickCustomerScreen,
  placeCustomerDisplayWindow,
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

const root = process.cwd();
const toggle = readFileSync(join(root, "components/layout/customer-display-toggle.tsx"), "utf8");
const helper = readFileSync(join(root, "features/pos/customer-display-window.ts"), "utf8");
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const displayClient = readFileSync(join(root, "features/pos/components/customer-display-client.tsx"), "utf8");
const prismaSrc = readFileSync(join(root, "lib/db/prisma.ts"), "utf8");
const en = JSON.parse(readFileSync(join(root, "locales/ui/en.json"), "utf8")) as Record<string, string>;
const th = JSON.parse(readFileSync(join(root, "locales/ui/th.json"), "utf8")) as Record<string, string>;
const lo = JSON.parse(readFileSync(join(root, "locales/ui/lo.json"), "utf8")) as Record<string, string>;
const permissionKey = "ui.allow.window.management.to.open.customer.di";
const cashier: CustomerDisplayScreen = { availHeight: 900, availLeft: 0, availTop: 0, availWidth: 1440 };
const customer: CustomerDisplayScreen = { availHeight: 1080, availLeft: 1440, availTop: 0, availWidth: 1920 };

await check("source: click opens named popup immediately", () => {
  assert(toggle.includes("openCustomerDisplayPopup()"), "toggle must open popup during click");
  assert(!/await[\s\S]{0,80}openCustomerDisplayPopup/.test(toggle), "window.open must not wait on permission");
  const openIndex = toggle.indexOf("openCustomerDisplayPopup()");
  const placeIndex = toggle.indexOf("placeCustomerDisplayWindow(popup)");
  assert(openIndex >= 0 && placeIndex > openIndex, "placement must run after popup creation");
});

await check("source: getScreenDetails used after open", () => {
  assert(helper.includes("getScreenDetails"), "Window Management API missing");
  assert(helper.includes("popup.moveTo"), "moveTo missing");
  assert(helper.includes("popup.resizeTo"), "resizeTo missing");
  assert(helper.includes("availLeft") && helper.includes("availWidth"), "target bounds missing");
});

await check("source: reuse named window, never close on second click", () => {
  assert(helper.includes(`"${CUSTOMER_DISPLAY_WINDOW_NAME}"`) || helper.includes("CUSTOMER_DISPLAY_WINDOW_NAME"), "named window missing");
  assert(CUSTOMER_DISPLAY_WINDOW_NAME === "ego-pos-customer-display", CUSTOMER_DISPLAY_WINDOW_NAME);
  assert(CUSTOMER_DISPLAY_PATH === "/customer-display", CUSTOMER_DISPLAY_PATH);
  assert(CUSTOMER_DISPLAY_OPEN_FEATURES.includes("width=900"), CUSTOMER_DISPLAY_OPEN_FEATURES);
  assert(!toggle.includes(".close()"), "second click must not close the customer window");
});

await check("source: cart sync architecture unchanged", () => {
  assert(posClient.includes("DemoStorageKeys.customerDisplayState"), "POS still writes customer display state");
  assert(displayClient.includes("DemoStorageKeys.customerDisplayState"), "display still reads customer display state");
  assert(!toggle.includes("WebSocket") && !helper.includes("WebSocket"), "WebSocket must not be added");
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
});

await check("pickCustomerScreen: dual monitor selects the other screen", () => {
  const picked = pickCustomerScreen({ currentScreen: cashier, screens: [cashier, customer] });
  assert(picked?.availLeft === 1440 && picked.availWidth === 1920, JSON.stringify(picked));
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
  const moves: number[][] = [];
  const popup = {
    closed: false,
    focus() {},
    moveTo(left: number, top: number) {
      moves.push([left, top]);
    },
    resizeTo() {},
  } as unknown as Window;
  const result = await placeCustomerDisplayWindow(popup, {} as Window);
  assert(result === "unsupported", result);
  assert(moves.length === 0, "unsupported API must not move off-screen");
});

await check("placeCustomerDisplayWindow: two screens move and resize once", async () => {
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
  } as unknown as Window;
  const host = {
    async getScreenDetails(): Promise<CustomerDisplayScreenDetails> {
      return { currentScreen: cashier, screens: [cashier, customer] };
    },
  };
  const result = await placeCustomerDisplayWindow(popup, host as never);
  assert(result === "placed", result);
  assert(moves.length === 1 && moves[0]?.[0] === 1440 && moves[0]?.[1] === 0, JSON.stringify(moves));
  assert(sizes.length === 1 && sizes[0]?.[0] === 1920 && sizes[0]?.[1] === 1080, JSON.stringify(sizes));
});

await check("placeCustomerDisplayWindow: permission denied falls back without throwing", async () => {
  const popup = {
    closed: false,
    focus() {},
    moveTo() {},
    resizeTo() {},
  } as unknown as Window;
  const host = {
    async getScreenDetails() {
      throw new Error("Permission denied");
    },
  };
  const result = await placeCustomerDisplayWindow(popup, host as never);
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
  } as never);
  assert(result === "unavailable", result);
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

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, total: results.length }, null, 2));
if (failed.length) {
  process.exit(1);
}
