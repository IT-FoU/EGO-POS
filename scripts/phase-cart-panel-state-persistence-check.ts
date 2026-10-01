import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CART_PANEL_STATE_KEY,
  DEFAULT_CART_PANEL_STATE,
  parseCartPanelState,
  readCartPanelState,
  writeCartPanelState,
} from "../features/pos/cart-panel-state";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => {
    values.set(key, value);
  },
};
const originalWindow = globalThis.window;

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});

assert(DEFAULT_CART_PANEL_STATE === "expanded", "new devices must keep the expanded default");
assert(parseCartPanelState(null) === "expanded", "missing preference must use the default");
assert(parseCartPanelState("invalid") === "expanded", "invalid preference must use the default");

values.set(CART_PANEL_STATE_KEY, "collapsed");
assert(readCartPanelState() === "collapsed", "stored collapsed preference must be read");
values.set(CART_PANEL_STATE_KEY, "expanded");
assert(readCartPanelState() === "expanded", "stored expanded preference must be read");

writeCartPanelState("collapsed");
assert(values.get(CART_PANEL_STATE_KEY) === "collapsed", "collapse must persist locally");
writeCartPanelState("expanded");
assert(values.get(CART_PANEL_STATE_KEY) === "expanded", "expand must persist locally");

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    get localStorage() {
      throw new Error("storage unavailable");
    },
  },
});
assert(readCartPanelState() === "expanded", "unavailable storage must fall back safely");
writeCartPanelState("collapsed");

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: originalWindow,
});

const root = process.cwd();
const clientSource = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
assert(clientSource.includes("readCartPanelState"), "POS must read the local cart-panel preference");
assert(clientSource.includes("writeCartPanelState"), "POS must write the local cart-panel preference");
assert(clientSource.includes('setCartCollapsed(readCartPanelState() === "collapsed")'), "preference must load after mount");
assert(clientSource.includes("cartItems.length") && clientSource.includes("totalAmount"), "cart data and totals must remain in the panel");

console.log("PASS: cart panel state persistence, safe storage fallback, and data isolation checks");
