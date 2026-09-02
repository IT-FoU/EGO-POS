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
        accent: "#0369A1",
        background: "#F0F9FF",
        badgeBackground: "#0284C7",
        badgeText: WHITE,
        border: "#0284C7",
        muted: "#0C4A6E",
        primary: "#0369A1",
        secondaryText: "#075985",
        soft: "#BAE6FD",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#0369A1",
        totalText: WHITE,
      };
    case "sunny-yellow":
      return {
        accent: "#A16207",
        background: "#FFFBEB",
        badgeBackground: "#FEF08A",
        badgeText: DARK_TEXT,
        border: "#CA8A04",
        muted: "#422006",
        primary: "#CA8A04",
        secondaryText: "#713F12",
        soft: "#FEF08A",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#FEF08A",
        totalText: DARK_TEXT,
      };
    case "premium-dark":
      return {
        accent: "#22D3EE",
        background: "#020617",
        badgeBackground: "#164E63",
        badgeText: "#ECFEFF",
        border: "#22D3EE",
        muted: "#E2E8F0",
        primary: "#22D3EE",
        secondaryText: "#A5F3FC",
        soft: "#083344",
        surface: "#0B1224",
        text: "#F8FAFC",
        totalBackground: "#22D3EE",
        totalText: "#082F49",
      };
    case "emerald-dream":
      return {
        accent: "#34D399",
        background: "#022C22",
        badgeBackground: "#064E3B",
        badgeText: "#ECFDF5",
        border: "#34D399",
        muted: "#D1FAE5",
        primary: "#10B981",
        secondaryText: "#A7F3D0",
        soft: "#064E3B",
        surface: "#04332A",
        text: "#ECFDF5",
        totalBackground: "#10B981",
        totalText: "#022C22",
      };
    case "coral-minimal":
      return {
        accent: "#E11D48",
        background: "#FFF7F7",
        badgeBackground: "#FFE4E6",
        badgeText: "#9F1239",
        border: "#E11D48",
        muted: "#881337",
        primary: "#E11D48",
        secondaryText: "#9F1239",
        soft: "#FFE4E6",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#E11D48",
        totalText: WHITE,
      };
    case "premium-dark-green":
      return {
        accent: "#4ADE80",
        background: "#020617",
        badgeBackground: "#14532D",
        badgeText: "#DCFCE7",
        border: "#4ADE80",
        muted: "#BBF7D0",
        primary: "#4ADE80",
        secondaryText: "#86EFAC",
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
        secondaryText: "#7F1D1D",
        soft: "#FEE2E2",
        surface: "#FFF7F7",
        text: DARK_TEXT,
        totalBackground: "#B91C1C",
        totalText: WHITE,
      };
    case "minimal-premium-purple":
      return {
        accent: "#5B21B6",
        background: "#FAF5FF",
        badgeBackground: "#6D28D9",
        badgeText: WHITE,
        border: "#7C3AED",
        muted: "#5B21B6",
        primary: "#6D28D9",
        secondaryText: "#5B21B6",
        soft: "#EDE9FE",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#6D28D9",
        totalText: WHITE,
      };
    case "ocean-blue":
    default:
      return {
        accent: "#0C4A6E",
        background: WHITE,
        badgeBackground: "#0369A1",
        badgeText: WHITE,
        border: "#0369A1",
        muted: "#0F172A",
        primary: "#0369A1",
        secondaryText: "#0C4A6E",
        soft: "#E0F2FE",
        surface: "#F8FAFC",
        text: DARK_TEXT,
        totalBackground: "#0C4A6E",
        totalText: WHITE,
      };
  }
}
