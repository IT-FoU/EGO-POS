export const CUSTOMER_DISPLAY_PATH = "/customer-display";
export const CUSTOMER_DISPLAY_WINDOW_NAME = "ego-pos-customer-display";
export const CUSTOMER_DISPLAY_OPEN_FEATURES = "popup=yes,width=900,height=720";

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

type ScreenDetailsApi = {
  getScreenDetails?: () => Promise<CustomerDisplayScreenDetails>;
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

export function customerDisplayTargetBounds(screen: CustomerDisplayScreen) {
  return {
    height: Math.max(1, Math.round(screen.availHeight)),
    left: Math.round(screen.availLeft),
    top: Math.round(screen.availTop),
    width: Math.max(1, Math.round(screen.availWidth)),
  };
}

export function openCustomerDisplayPopup(host: Window = window) {
  return host.open(CUSTOMER_DISPLAY_PATH, CUSTOMER_DISPLAY_WINDOW_NAME, CUSTOMER_DISPLAY_OPEN_FEATURES);
}

export async function placeCustomerDisplayWindow(
  popup: Window,
  host: ScreenDetailsApi & Pick<Window, "focus"> = window,
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
    popup.moveTo(bounds.left, bounds.top);
    popup.resizeTo(bounds.width, bounds.height);
    popup.focus();
    return "placed";
  } catch {
    popup.focus();
    return "denied";
  }
}
