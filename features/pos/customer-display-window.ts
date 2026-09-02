export const CUSTOMER_DISPLAY_PATH = "/customer-display";
export const CUSTOMER_DISPLAY_WINDOW_NAME = "ego-pos-customer-display";
export const CUSTOMER_DISPLAY_FALLBACK_OPEN_WIDTH = 1280;
export const CUSTOMER_DISPLAY_FALLBACK_OPEN_HEIGHT = 800;
export const CUSTOMER_DISPLAY_OPEN_FEATURES = `popup=yes,width=${CUSTOMER_DISPLAY_FALLBACK_OPEN_WIDTH},height=${CUSTOMER_DISPLAY_FALLBACK_OPEN_HEIGHT}`;
export const CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS = 180;
export const CUSTOMER_DISPLAY_PLACEMENT_MAX_APPLIES = 3;
export const CUSTOMER_DISPLAY_PLACEMENT_TOLERANCE_PX = 64;

export type CustomerDisplayScreen = {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
};

export type CustomerDisplayScreenDetails = {
  currentScreen: CustomerDisplayScreen;
  screens: CustomerDisplayScreen[];
};

export type CustomerDisplayPlacement =
  | "denied"
  | "placed"
  | "single"
  | "unavailable"
  | "unsupported";

export type CustomerDisplayBounds = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type CustomerDisplayPlacementClock = {
  delay: (callback: () => void, ms: number) => void;
  onLoad: (popup: Window, callback: () => void) => void;
};

type ScreenDetailsApi = {
  getScreenDetails?: () => Promise<CustomerDisplayScreenDetails>;
};

const defaultPlacementClock: CustomerDisplayPlacementClock = {
  delay(callback, ms) {
    setTimeout(callback, ms);
  },
  onLoad(popup, callback) {
    popup.addEventListener?.("load", callback, { once: true });
  },
};

export function isSameCustomerDisplayScreen(left: CustomerDisplayScreen, right: CustomerDisplayScreen) {
  return (
    left.availLeft === right.availLeft &&
    left.availTop === right.availTop &&
    left.availWidth === right.availWidth &&
    left.availHeight === right.availHeight
  );
}

export function pickCustomerScreen(details: CustomerDisplayScreenDetails): CustomerDisplayScreen | null {
  const screens = details.screens ?? [];
  if (screens.length < 2) {
    return null;
  }

  const other = screens.find((screen) => !isSameCustomerDisplayScreen(screen, details.currentScreen));
  return other ?? null;
}

export function customerDisplayTargetBounds(screen: CustomerDisplayScreen): CustomerDisplayBounds {
  return {
    height: Math.max(1, Math.round(screen.availHeight)),
    left: Math.round(screen.availLeft),
    top: Math.round(screen.availTop),
    width: Math.max(1, Math.round(screen.availWidth)),
  };
}

export function customerDisplayFallbackOpenBounds(host?: { screen?: { availHeight?: number; availWidth?: number } }) {
  const width = host?.screen?.availWidth;
  const height = host?.screen?.availHeight;
  if (typeof width === "number" && width >= 800 && typeof height === "number" && height >= 600) {
    return {
      height: Math.round(height),
      left: 0,
      top: 0,
      width: Math.round(width),
    } satisfies CustomerDisplayBounds;
  }
  return {
    height: CUSTOMER_DISPLAY_FALLBACK_OPEN_HEIGHT,
    left: 0,
    top: 0,
    width: CUSTOMER_DISPLAY_FALLBACK_OPEN_WIDTH,
  } satisfies CustomerDisplayBounds;
}

export function customerDisplayOpenFeatures(
  bounds?: CustomerDisplayBounds | null,
  host?: { screen?: { availHeight?: number; availWidth?: number } },
) {
  const resolved = bounds ?? customerDisplayFallbackOpenBounds(host);
  const origin = bounds ? `left=${resolved.left},top=${resolved.top},` : "";
  return `popup=yes,${origin}width=${resolved.width},height=${resolved.height}`;
}

export function applyCustomerDisplayBounds(
  popup: Pick<Window, "closed" | "moveTo" | "resizeTo">,
  bounds: CustomerDisplayBounds,
) {
  if (popup.closed) {
    return false;
  }

  popup.moveTo(bounds.left, bounds.top);
  popup.resizeTo(bounds.width, bounds.height);
  popup.moveTo(bounds.left, bounds.top);
  return true;
}

export function customerDisplayPlacementNeedsRetry(
  popup: { outerHeight?: number; outerWidth?: number; screenX?: number; screenY?: number },
  bounds: CustomerDisplayBounds,
  tolerance = CUSTOMER_DISPLAY_PLACEMENT_TOLERANCE_PX,
) {
  const screenX = typeof popup.screenX === "number" ? popup.screenX : Number.NaN;
  const screenY = typeof popup.screenY === "number" ? popup.screenY : Number.NaN;
  const width = typeof popup.outerWidth === "number" ? popup.outerWidth : Number.NaN;
  const height = typeof popup.outerHeight === "number" ? popup.outerHeight : Number.NaN;

  if ([screenX, screenY, width, height].some((value) => Number.isNaN(value))) {
    return true;
  }

  return (
    Math.abs(screenX - bounds.left) > tolerance ||
    Math.abs(screenY - bounds.top) > tolerance ||
    Math.abs(width - bounds.width) > tolerance ||
    Math.abs(height - bounds.height) > tolerance
  );
}

export function scheduleCustomerDisplayPlacementRetries(
  popup: Window,
  apply: () => void,
  clock: CustomerDisplayPlacementClock = defaultPlacementClock,
) {
  clock.onLoad(popup, apply);
  clock.delay(apply, CUSTOMER_DISPLAY_PLACEMENT_RETRY_DELAY_MS);
}

export function openCustomerDisplayPopup(host: Window = window) {
  return host.open(CUSTOMER_DISPLAY_PATH, CUSTOMER_DISPLAY_WINDOW_NAME, customerDisplayOpenFeatures(null, host));
}

export async function placeCustomerDisplayWindow(
  popup: Window,
  host: ScreenDetailsApi & Pick<Window, "focus"> = window,
  clock: CustomerDisplayPlacementClock = defaultPlacementClock,
): Promise<CustomerDisplayPlacement> {
  if (popup.closed) {
    return "unavailable";
  }

  const getScreenDetails = host.getScreenDetails;
  if (typeof getScreenDetails !== "function") {
    popup.focus();
    return "unsupported";
  }

  try {
    const details = await getScreenDetails.call(host);
    const target = pickCustomerScreen(details);
    if (!target) {
      popup.focus();
      return "single";
    }

    const bounds = customerDisplayTargetBounds(target);
    let applies = 0;

    const apply = () => {
      if (applies >= CUSTOMER_DISPLAY_PLACEMENT_MAX_APPLIES || popup.closed) {
        return;
      }
      applies += 1;
      applyCustomerDisplayBounds(popup, bounds);
    };

    apply();
    scheduleCustomerDisplayPlacementRetries(popup, apply, clock);
    popup.focus();
    return "placed";
  } catch {
    popup.focus();
    return "denied";
  }
}
