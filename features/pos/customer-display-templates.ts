export const CUSTOMER_DISPLAY_TEMPLATES = [
  "ocean-blue",
  "bold-green",
  "sky-blue",
  "sunny-yellow",
  "premium-dark",
  "emerald-dream",
  "coral-minimal",
  "premium-dark-green",
  "minimal-premium-red",
  "minimal-premium-purple",
] as const;

export type CustomerDisplayTemplate = (typeof CUSTOMER_DISPLAY_TEMPLATES)[number];

export const DEFAULT_CUSTOMER_DISPLAY_TEMPLATE: CustomerDisplayTemplate = "ocean-blue";

const LEGACY_TEMPLATE_MAP: Record<string, CustomerDisplayTemplate> = {
  ads_checkout: "sunny-yellow",
  classic_checkout: "ocean-blue",
  "follow-pos": "premium-dark",
  "fresh-green": "bold-green",
  fullscreen_promotion: "coral-minimal",
  qr_focus: "sky-blue",
  "sky-blue": "sky-blue",
  "sunny-yellow": "sunny-yellow",
  vip_membership: "emerald-dream",
};

export const CUSTOMER_DISPLAY_TEMPLATE_OPTIONS: Array<{
  description: string;
  id: CustomerDisplayTemplate;
  labelKey: string;
  name: string;
  sections: string;
}> = [
  { id: "ocean-blue", name: "Ocean Blue", labelKey: "ui.ocean.blue", sections: "4", description: "Clean left/right checkout with a separate total and service message." },
  { id: "bold-green", name: "Bold Green", labelKey: "ui.bold.green", sections: "3-4", description: "High-contrast retail blocks with a dominant total band." },
  { id: "sky-blue", name: "Sky Blue", labelKey: "ui.sky.blue", sections: "4-5", description: "Stacked summaries with side metric boxes." },
  { id: "sunny-yellow", name: "Sunny Yellow", labelKey: "ui.sunny.yellow", sections: "3-4", description: "Promo banner plus items and a strong total strip." },
  { id: "premium-dark", name: "Premium Dark", labelKey: "ui.premium.dark", sections: "3", description: "Asymmetric dark cards with cyan/teal accents." },
  { id: "emerald-dream", name: "Emerald Dream", labelKey: "ui.emerald.dream", sections: "4-5", description: "Card grid with stronger member emphasis." },
  { id: "coral-minimal", name: "Coral Minimal", labelKey: "ui.coral.minimal", sections: "3-4", description: "Light stacked composition with warm coral accents." },
  { id: "premium-dark-green", name: "Premium Dark Green", labelKey: "ui.premium.dark.green", sections: "4-5", description: "Dark layout with a bright green grand-total focus." },
  { id: "minimal-premium-red", name: "Minimal Premium Red", labelKey: "ui.minimal.premium.red", sections: "3-4", description: "Structured typography-first red and white layout." },
  { id: "minimal-premium-purple", name: "Minimal Premium Purple", labelKey: "ui.minimal.premium.purple", sections: "4-5", description: "Elegant split composition with a purple banner." },
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

export type CustomerDisplayChrome = {
  items: "flat" | "outlined" | "square" | "thin";
  member: "card" | "flat" | "outlined" | "square";
  panel: "banner" | "card" | "flat" | "rail" | "thin";
  totals: "banner" | "card" | "full-width" | "outlined";
};

export function customerDisplayTemplateChrome(template: CustomerDisplayTemplate): CustomerDisplayChrome {
  switch (template) {
    case "bold-green":
      return { items: "flat", member: "flat", panel: "banner", totals: "full-width" };
    case "sky-blue":
      return { items: "thin", member: "card", panel: "card", totals: "card" };
    case "sunny-yellow":
      return { items: "flat", member: "square", panel: "banner", totals: "banner" };
    case "premium-dark":
      return { items: "square", member: "card", panel: "rail", totals: "outlined" };
    case "emerald-dream":
      return { items: "thin", member: "card", panel: "rail", totals: "card" };
    case "coral-minimal":
      return { items: "flat", member: "flat", panel: "flat", totals: "outlined" };
    case "premium-dark-green":
      return { items: "square", member: "square", panel: "rail", totals: "full-width" };
    case "minimal-premium-red":
      return { items: "outlined", member: "outlined", panel: "thin", totals: "outlined" };
    case "minimal-premium-purple":
      return { items: "thin", member: "flat", panel: "banner", totals: "banner" };
    case "ocean-blue":
    default:
      return { items: "thin", member: "square", panel: "thin", totals: "outlined" };
  }
}

const DARK_TEXT = "#111827";
const WHITE = "#FFFFFF";

export function isCustomerDisplayTemplate(value: unknown): value is CustomerDisplayTemplate {
  return CUSTOMER_DISPLAY_TEMPLATES.some((template) => template === value);
}

export function parseCustomerDisplayTemplate(value: unknown): CustomerDisplayTemplate {
  if (isCustomerDisplayTemplate(value)) {
    return value;
  }
  if (typeof value === "string" && value in LEGACY_TEMPLATE_MAP) {
    return LEGACY_TEMPLATE_MAP[value];
  }
  return DEFAULT_CUSTOMER_DISPLAY_TEMPLATE;
}

export function customerDisplayTemplateTokens(template: CustomerDisplayTemplate): CustomerDisplayThemeTokens {
  switch (template) {
    case "bold-green":
      return {
        accent: "#166534",
        background: "#F0FDF4",
        badgeBackground: "#166534",
        badgeText: WHITE,
        border: "#15803D",
        muted: "#14532D",
        primary: "#15803D",
        secondaryText: "#14532D",
        soft: "#BBF7D0",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#15803D",
        totalText: WHITE,
      };
    case "sky-blue":
      return {
        accent: "#075985",
        background: "#E0F2FE",
        badgeBackground: "#0369A1",
        badgeText: WHITE,
        border: "#0369A1",
        muted: "#0C4A6E",
        primary: "#0369A1",
        secondaryText: "#0C4A6E",
        soft: "#BAE6FD",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#0369A1",
        totalText: WHITE,
      };
    case "sunny-yellow":
      return {
        accent: "#854D0E",
        background: "#FEF9C3",
        badgeBackground: "#FACC15",
        badgeText: DARK_TEXT,
        border: "#A16207",
        muted: "#422006",
        primary: "#CA8A04",
        secondaryText: "#422006",
        soft: "#FDE047",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#EAB308",
        totalText: DARK_TEXT,
      };
    case "premium-dark":
      return {
        accent: "#22D3EE",
        background: "#020617",
        badgeBackground: "#164E63",
        badgeText: "#ECFEFF",
        border: "#22D3EE",
        muted: "#F8FAFC",
        primary: "#22D3EE",
        secondaryText: "#67E8F9",
        soft: "#083344",
        surface: "#0B1224",
        text: "#F8FAFC",
        totalBackground: "#22D3EE",
        totalText: "#082F49",
      };
    case "emerald-dream":
      return {
        accent: "#6EE7B7",
        background: "#022C22",
        badgeBackground: "#065F46",
        badgeText: "#ECFDF5",
        border: "#34D399",
        muted: "#A7F3D0",
        primary: "#059669",
        secondaryText: "#D1FAE5",
        soft: "#064E3B",
        surface: "#04332A",
        text: "#F0FDF4",
        totalBackground: "#059669",
        totalText: "#ECFDF5",
      };
    case "coral-minimal":
      return {
        accent: "#BE123C",
        background: WHITE,
        badgeBackground: "#FECDD3",
        badgeText: "#881337",
        border: "#E11D48",
        muted: "#9F1239",
        primary: "#E11D48",
        secondaryText: "#881337",
        soft: "#FFE4E6",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#BE123C",
        totalText: WHITE,
      };
    case "premium-dark-green":
      return {
        accent: "#4ADE80",
        background: "#020617",
        badgeBackground: "#14532D",
        badgeText: "#DCFCE7",
        border: "#4ADE80",
        muted: "#DCFCE7",
        primary: "#4ADE80",
        secondaryText: "#BBF7D0",
        soft: "#052E16",
        surface: "#07140D",
        text: "#F8FAFC",
        totalBackground: "#4ADE80",
        totalText: "#022C22",
      };
    case "minimal-premium-red":
      return {
        accent: "#991B1B",
        background: WHITE,
        badgeBackground: "#7F1D1D",
        badgeText: WHITE,
        border: "#B91C1C",
        muted: "#7F1D1D",
        primary: "#B91C1C",
        secondaryText: "#450A0A",
        soft: "#FEE2E2",
        surface: "#FFF7F7",
        text: DARK_TEXT,
        totalBackground: "#B91C1C",
        totalText: WHITE,
      };
    case "minimal-premium-purple":
      return {
        accent: "#4C1D95",
        background: "#FAF5FF",
        badgeBackground: "#5B21B6",
        badgeText: WHITE,
        border: "#5B21B6",
        muted: "#4C1D95",
        primary: "#5B21B6",
        secondaryText: "#3B0764",
        soft: "#EDE9FE",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#6D28D9",
        totalText: WHITE,
      };
    case "ocean-blue":
    default:
      return {
        accent: "#082F49",
        background: WHITE,
        badgeBackground: "#075985",
        badgeText: WHITE,
        border: "#0C4A6E",
        muted: "#0F172A",
        primary: "#075985",
        secondaryText: "#082F49",
        soft: "#E0F2FE",
        surface: "#F8FAFC",
        text: DARK_TEXT,
        totalBackground: "#0C4A6E",
        totalText: WHITE,
      };
  }
}
