import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";

export const CUSTOMER_DISPLAY_THEMES = ["follow-pos", "fresh-green", "sky-blue", "sunny-yellow"] as const;

export type CustomerDisplayThemeId = (typeof CUSTOMER_DISPLAY_THEMES)[number];
export type PosAppearance = "dark" | "light";
export type ResolvedCustomerDisplayAppearance = PosAppearance | "fresh-green" | "sky-blue" | "sunny-yellow";

export const DEFAULT_CUSTOMER_DISPLAY_THEME: CustomerDisplayThemeId = "fresh-green";
export const CUSTOMER_DISPLAY_PRIMARY_TEXT = "#111827";
export const CUSTOMER_DISPLAY_SECONDARY_TEXT = "#4B5563";

export const CUSTOMER_DISPLAY_THEME_OPTIONS: Array<{
  id: CustomerDisplayThemeId;
  labelKey: string;
}> = [
  { id: "follow-pos", labelKey: "ui.follow.pos" },
  { id: "fresh-green", labelKey: "ui.fresh.green" },
  { id: "sky-blue", labelKey: "ui.sky.blue" },
  { id: "sunny-yellow", labelKey: "ui.sunny.yellow" },
];

export type CustomerDisplayThemeTokens = {
  accent: string;
  background: string;
  badgeBackground: string;
  badgeText: string;
  border: string;
  muted: string;
  primary: string;
  secondaryText: string;
  soft: string;
  surface: string;
  text: string;
  totalBackground: string;
  totalText: string;
};

export function isCustomerDisplayThemeId(value: unknown): value is CustomerDisplayThemeId {
  return CUSTOMER_DISPLAY_THEMES.some((theme) => theme === value);
}

export function parseCustomerDisplayTheme(value: unknown): CustomerDisplayThemeId {
  return isCustomerDisplayThemeId(value) ? value : DEFAULT_CUSTOMER_DISPLAY_THEME;
}

export function parsePosAppearance(value: unknown): PosAppearance {
  return value === "light" ? "light" : "dark";
}

export function readResolvedPosAppearance(): PosAppearance {
  return parsePosAppearance(readStringFromStorage(DemoStorageKeys.theme));
}

export function resolveCustomerDisplayAppearance(
  theme: CustomerDisplayThemeId,
  posAppearance: PosAppearance,
): ResolvedCustomerDisplayAppearance {
  if (theme === "follow-pos") {
    return posAppearance;
  }

  return theme;
}

export function customerDisplayThemeTokens(
  appearance: ResolvedCustomerDisplayAppearance,
): CustomerDisplayThemeTokens {
  if (appearance === "dark") {
    return {
      accent: "#67E8F9",
      background: "#071014",
      badgeBackground: "rgba(103, 232, 249, 0.18)",
      badgeText: "#CFFAFE",
      border: "rgba(255, 255, 255, 0.18)",
      muted: "rgba(226, 232, 240, 0.86)",
      primary: "#22D3EE",
      secondaryText: "#E2E8F0",
      soft: "rgba(34, 211, 238, 0.14)",
      surface: "rgba(255, 255, 255, 0.08)",
      text: "#FFFFFF",
      totalBackground: "#FFD700",
      totalText: "#071014",
    };
  }

  if (appearance === "light") {
    return {
      accent: "#0E7490",
      background: "#F8FAFC",
      badgeBackground: "#E0F2FE",
      badgeText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      border: "#CBD5E1",
      muted: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      primary: "#0891B2",
      secondaryText: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      soft: "#E0F2FE",
      surface: "#FFFFFF",
      text: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      totalBackground: "#0F172A",
      totalText: "#FFFFFF",
    };
  }

  if (appearance === "sky-blue") {
    return {
      accent: "#0284C7",
      background: "#FFFFFF",
      badgeBackground: "#E0F2FE",
      badgeText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      border: "#7DD3FC",
      muted: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      primary: "#0284C7",
      secondaryText: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      soft: "#E0F2FE",
      surface: "#F0F9FF",
      text: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      totalBackground: "#E0F2FE",
      totalText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
    };
  }

  if (appearance === "sunny-yellow") {
    return {
      accent: "#EAB308",
      background: "#FFFFFF",
      badgeBackground: "#FEF9C3",
      badgeText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      border: "#FACC15",
      muted: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      primary: "#EAB308",
      secondaryText: CUSTOMER_DISPLAY_SECONDARY_TEXT,
      soft: "#FEF9C3",
      surface: "#FEFCE8",
      text: CUSTOMER_DISPLAY_PRIMARY_TEXT,
      totalBackground: "#FEF9C3",
      totalText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
    };
  }

  return {
    accent: "#16A34A",
    background: "#FFFFFF",
    badgeBackground: "#DCFCE7",
    badgeText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
    border: "#86EFAC",
    muted: CUSTOMER_DISPLAY_SECONDARY_TEXT,
    primary: "#16A34A",
    secondaryText: CUSTOMER_DISPLAY_SECONDARY_TEXT,
    soft: "#DCFCE7",
    surface: "#F0FDF4",
    text: CUSTOMER_DISPLAY_PRIMARY_TEXT,
    totalBackground: "#DCFCE7",
    totalText: CUSTOMER_DISPLAY_PRIMARY_TEXT,
  };
}
