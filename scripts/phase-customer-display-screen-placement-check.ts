import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY,
  clearCustomerDisplayScreenPreference,
  discoverCustomerDisplayScreens,
  customerDisplayOpenFeatures,
  customerDisplayTargetBounds,
  openCustomerDisplayPopup,
  placeCustomerDisplayWindow,
  resolveSavedCustomerDisplayScreen,
  screenPreferenceFromScreen,
  writeCustomerDisplayScreenPreference,
  type CustomerDisplayScreen,
} from "../features/pos/customer-display-window";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const pos: CustomerDisplayScreen = {
  availHeight: 900,
  availLeft: 0,
  availTop: 0,
  availWidth: 1440,
  devicePixelRatio: 1,
  label: "POS",
};
const right: CustomerDisplayScreen = {
  availHeight: 1080,
  availLeft: 1440,
  availTop: 0,
  availWidth: 1920,
  devicePixelRatio: 1.25,
  label: "Other",
};
const left: CustomerDisplayScreen = {
  availHeight: 1080,
  availLeft: -1920,
  availTop: 0,
  availWidth: 1920,
  devicePixelRatio: 1.25,
  label: "Different",
};
const above: CustomerDisplayScreen = {
  availHeight: 1080,
  availLeft: 0,
  availTop: -1080,
  availWidth: 1920,
  devicePixelRatio: 1.5,
  label: "Customer",
};

const storageState = { value: null as string | null };
const storage = {
  getItem() {
    return storageState.value;
  },
  setItem(_key: string, value: string) {
    storageState.value = value;
  },
  removeItem() {
    storageState.value = null;
  },
};
const originalWindow = globalThis.window;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

const popupState = { closed: false };
const moves: number[][] = [];
const sizes: number[][] = [];
const popup = {
  get closed() {
    return popupState.closed;
  },
  focus() {},
  moveTo(leftValue: number, topValue: number) {
    moves.push([leftValue, topValue]);
  },
  resizeTo(width: number, height: number) {
    sizes.push([width, height]);
  },
} as unknown as Window;

const silentClock = {
  delay() {},
  onLoad() {},
};

const root = process.cwd();
const toggleSource = readFileSync(join(root, "components/layout/customer-display-toggle.tsx"), "utf8");

const unsupported = await discoverCustomerDisplayScreens({});
assert(unsupported.status === "unsupported", "unsupported API is handled");

const denied = await discoverCustomerDisplayScreens({
  async getScreenDetails() {
    throw new DOMException("Permission denied", "NotAllowedError");
  },
});
assert(denied.status === "denied", "permission denial is handled");

const single = await discoverCustomerDisplayScreens({
  async getScreenDetails() {
    return { currentScreen: pos, screens: [pos] };
  },
});
assert(single.status === "available" && single.details.screens.length === 1, "single screen is detected");

const two = await discoverCustomerDisplayScreens({
  async getScreenDetails() {
    return { currentScreen: pos, screens: [pos, right] };
  },
});
assert(two.status === "available", "two screens are detected");
assert(resolveSavedCustomerDisplayScreen([pos, right], pos, null) === right, "two-screen setup auto-selects the other screen");

assert(resolveSavedCustomerDisplayScreen([pos, right, above], pos, null) === null, "three screens require explicit selection");
assert(
  resolveSavedCustomerDisplayScreen([pos, right], pos, screenPreferenceFromScreen(right)) === right,
  "saved target resolves by geometry and label",
);
assert(
  resolveSavedCustomerDisplayScreen([pos, left], pos, screenPreferenceFromScreen(right)) === null,
  "disconnected saved target does not select a new screen blindly",
);

const negativeBounds = customerDisplayTargetBounds(left);
const aboveBounds = customerDisplayTargetBounds(above);
assert(negativeBounds.left === -1920 && negativeBounds.top === 0, "negative X geometry is preserved");
assert(aboveBounds.top === -1080 && aboveBounds.width === 1920, "negative Y geometry is preserved");
assert(aboveBounds.height === 1080, "mixed-DPI screen geometry is preserved");

assert(
  customerDisplayOpenFeatures(negativeBounds).includes("left=-1920,top=0,width=1920,height=1080"),
  "known target geometry is included in initial window.open features",
);
const opened: string[] = [];
openCustomerDisplayPopup(
  {
    open(_url: string, _name: string, features: string) {
      opened.push(features);
      return popup;
    },
  } as unknown as Window,
  negativeBounds,
);
assert(opened[0]?.includes("left=-1920,top=0"), "window.open receives negative target coordinates");

clearCustomerDisplayScreenPreference();
moves.length = 0;
sizes.length = 0;
popupState.closed = false;
const placed = await placeCustomerDisplayWindow(
  popup,
  {
    async getScreenDetails() {
      return { currentScreen: pos, screens: [pos, right] };
    },
  },
  silentClock,
);
assert(placed === "placed", "two-screen placement succeeds");
assert(moves[0]?.[0] === 1440 && sizes[0]?.[0] === 1920, "moveTo and resizeTo use target geometry");
assert(storageState.value?.includes(CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY) === false, "storage value contains only serialized preference");

writeCustomerDisplayScreenPreference(right);
assert(storageState.value?.includes('"Other"'), "screen preference is device-local");
popupState.closed = false;
const revalidated = await placeCustomerDisplayWindow(
  popup,
  {
    async getScreenDetails() {
      return { currentScreen: pos, screens: [pos, right] };
    },
  },
  silentClock,
);
assert(revalidated === "placed", "saved target is revalidated on every open");

const disconnected = await placeCustomerDisplayWindow(
  popup,
  {
    async getScreenDetails() {
      return { currentScreen: pos, screens: [pos, left] };
    },
  },
  silentClock,
);
assert(disconnected === "disconnected", "disconnected target requires setup again");

assert(toggleSource.includes("openCustomerDisplayPopup("), "toggle still opens from a user click");
assert(toggleSource.includes("customerDisplayWindow.close()"), "toggle still closes the same named window");
assert(toggleSource.includes("placeCustomerDisplayWindow(popup)"), "toggle still repositions on open");
assert(toggleSource.includes("data-cd-screen-setup"), "screen setup control is visible");

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: originalWindow,
});

console.log("PASS: screen discovery, permission states, device-local selection, geometry, revalidation, and toggle preservation");
