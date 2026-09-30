export const CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY = "ego-pos.customer-display.screen.v1";

export type CustomerDisplayScreen = {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  devicePixelRatio?: number;
  label?: string;
  height?: number;
  left?: number;
  top?: number;
  width?: number;
};

export type CustomerDisplayScreenPreference = {
  availHeight: number;
  availLeft: number;
  availTop: number;
  availWidth: number;
  devicePixelRatio?: number;
  label?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function screenPreferenceFromScreen(screen: CustomerDisplayScreen): CustomerDisplayScreenPreference {
  return {
    availHeight: Math.round(screen.availHeight),
    availLeft: Math.round(screen.availLeft),
    availTop: Math.round(screen.availTop),
    availWidth: Math.round(screen.availWidth),
    ...(finite(screen.devicePixelRatio) ? { devicePixelRatio: screen.devicePixelRatio } : {}),
    ...(screen.label?.trim() ? { label: screen.label.trim() } : {}),
  };
}

export function readCustomerDisplayScreenPreference(storage?: StorageLike | null): CustomerDisplayScreenPreference | null {
  const source = browserStorage(storage);
  if (!source) return null;
  try {
    const parsed = JSON.parse(source.getItem(CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY) ?? "null") as Partial<CustomerDisplayScreenPreference> | null;
    if (
      !parsed ||
      !finite(parsed.availHeight) ||
      !finite(parsed.availLeft) ||
      !finite(parsed.availTop) ||
      !finite(parsed.availWidth) ||
      parsed.availWidth <= 0 ||
      parsed.availHeight <= 0
    ) {
      return null;
    }
    return {
      availHeight: Math.round(parsed.availHeight),
      availLeft: Math.round(parsed.availLeft),
      availTop: Math.round(parsed.availTop),
      availWidth: Math.round(parsed.availWidth),
      ...(finite(parsed.devicePixelRatio) ? { devicePixelRatio: parsed.devicePixelRatio } : {}),
      ...(typeof parsed.label === "string" && parsed.label.trim() ? { label: parsed.label.trim() } : {}),
    };
  } catch {
    return null;
  }
}

export function writeCustomerDisplayScreenPreference(
  screen: CustomerDisplayScreen,
  storage?: StorageLike | null,
) {
  const source = browserStorage(storage);
  if (!source) return false;
  try {
    source.setItem(CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY, JSON.stringify(screenPreferenceFromScreen(screen)));
    return true;
  } catch {
    return false;
  }
}

export function clearCustomerDisplayScreenPreference(storage?: StorageLike | null) {
  const source = browserStorage(storage);
  if (!source) return;
  try {
    source.removeItem(CUSTOMER_DISPLAY_SCREEN_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in private or restricted browser contexts.
  }
}

export function screenPreferenceToBounds(preference: CustomerDisplayScreenPreference) {
  return {
    height: preference.availHeight,
    left: preference.availLeft,
    top: preference.availTop,
    width: preference.availWidth,
  };
}

export function screenDisplayLabel(screen: CustomerDisplayScreen, fallback = "Display") {
  if (screen.label?.trim()) return screen.label.trim();
  return `${fallback} (${Math.round(screen.availWidth)}×${Math.round(screen.availHeight)} @ ${Math.round(screen.availLeft)},${Math.round(screen.availTop)})`;
}

export function isScreenPreferenceMatch(
  screen: CustomerDisplayScreen,
  preference: CustomerDisplayScreenPreference,
) {
  if (preference.label && screen.label?.trim() && preference.label === screen.label.trim()) {
    return true;
  }

  const sameGeometry =
    Math.round(screen.availLeft) === preference.availLeft &&
    Math.round(screen.availTop) === preference.availTop &&
    Math.round(screen.availWidth) === preference.availWidth &&
    Math.round(screen.availHeight) === preference.availHeight;
  if (sameGeometry) return true;

  return (
    Math.round(screen.availWidth) === preference.availWidth &&
    Math.round(screen.availHeight) === preference.availHeight &&
    (!preference.devicePixelRatio ||
      !screen.devicePixelRatio ||
      Math.abs(screen.devicePixelRatio - preference.devicePixelRatio) < 0.01)
  );
}

export function screenIsCurrent(screen: CustomerDisplayScreen, current: CustomerDisplayScreen) {
  return (
    Math.round(screen.availLeft) === Math.round(current.availLeft) &&
    Math.round(screen.availTop) === Math.round(current.availTop) &&
    Math.round(screen.availWidth) === Math.round(current.availWidth) &&
    Math.round(screen.availHeight) === Math.round(current.availHeight)
  );
}

export function resolveSavedCustomerDisplayScreen(
  screens: CustomerDisplayScreen[],
  currentScreen: CustomerDisplayScreen,
  preference: CustomerDisplayScreenPreference | null,
) {
  const candidates = screens.filter((screen) => !screenIsCurrent(screen, currentScreen));
  if (!preference) return candidates.length === 1 ? candidates[0] ?? null : null;
  const labelMatches = preference.label
    ? candidates.filter((screen) => screen.label?.trim() === preference.label)
    : [];
  if (labelMatches.length === 1) return labelMatches[0] ?? null;
  const geometryMatches = candidates.filter(
    (screen) =>
      Math.round(screen.availLeft) === preference.availLeft &&
      Math.round(screen.availTop) === preference.availTop &&
      Math.round(screen.availWidth) === preference.availWidth &&
      Math.round(screen.availHeight) === preference.availHeight,
  );
  if (geometryMatches.length === 1) return geometryMatches[0] ?? null;
  if (preference.label) return null;
  const sizeMatches = candidates.filter((screen) =>
    isScreenPreferenceMatch(screen, { ...preference, label: undefined }),
  );
  return sizeMatches.length === 1 ? sizeMatches[0] ?? null : null;
}
