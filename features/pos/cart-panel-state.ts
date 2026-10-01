export const CART_PANEL_STATE_KEY = "ego-pos.cart-panel-state.v1";

export type CartPanelState = "collapsed" | "expanded";

export const DEFAULT_CART_PANEL_STATE: CartPanelState = "expanded";

export function parseCartPanelState(value: string | null | undefined): CartPanelState {
  return value === "collapsed" || value === "expanded"
    ? value
    : DEFAULT_CART_PANEL_STATE;
}

export function readCartPanelState(): CartPanelState {
  if (typeof window === "undefined") {
    return DEFAULT_CART_PANEL_STATE;
  }

  try {
    return parseCartPanelState(window.localStorage.getItem(CART_PANEL_STATE_KEY));
  } catch {
    return DEFAULT_CART_PANEL_STATE;
  }
}

export function writeCartPanelState(state: CartPanelState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(CART_PANEL_STATE_KEY, state);
  } catch {
    // Browser storage can be unavailable or blocked; keep the UI usable.
  }
}
