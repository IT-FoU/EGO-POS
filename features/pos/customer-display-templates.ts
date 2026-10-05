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
  { id: "ocean-blue", name: "Green Lime", labelKey: "ui.ocean.blue", sections: "1", description: "Deep green retail panel with lime totals and a strong product list." },
  { id: "bold-green", name: "Orange Navy", labelKey: "ui.bold.green", sections: "3", description: "Navy foundation, orange accent, top status banner and bottom split." },
  { id: "sky-blue", name: "Blue Yellow", labelKey: "ui.sky.blue", sections: "2", description: "Friendly two-column Mini Mart layout with yellow totals." },
  { id: "sunny-yellow", name: "Violet Lime", labelKey: "ui.sunny.yellow", sections: "3-4", description: "Black, violet, and lime premium contrast with a clear payable total." },
  { id: "premium-dark", name: "Red Orange", labelKey: "ui.premium.dark", sections: "3", description: "Bright red/orange retail banner with a clean transaction area." },
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
  panel: "banner" | "card" | "flat" | "rail" | "square" | "thin";
  totals: "banner" | "card" | "full-width" | "outlined";
};

export function customerDisplayTemplateChrome(template: CustomerDisplayTemplate): CustomerDisplayChrome {
  switch (template) {
    case "bold-green":
      return { items: "square", member: "flat", panel: "banner", totals: "full-width" };
    case "sky-blue":
      return { items: "thin", member: "flat", panel: "card", totals: "card" };
    case "sunny-yellow":
      return { items: "square", member: "flat", panel: "square", totals: "banner" };
    case "premium-dark":
      return { items: "square", member: "flat", panel: "banner", totals: "full-width" };
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
        accent: "#FF5F00",
        background: "#003A70",
        badgeBackground: "#FF5F00",
        badgeText: WHITE,
        border: "#FF5F00",
        muted: "#D6E4F0",
        primary: "#FF5F00",
        secondaryText: "#7EA6C9",
        soft: "#0A4A80",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#FF5F00",
        totalText: WHITE,
      };
    case "sky-blue":
      return {
        accent: "#FFCB05",
        background: "#003A70",
        badgeBackground: "#FFCB05",
        badgeText: "#003A70",
        border: "#3D7DCA",
        muted: "#D6E6F7",
        primary: "#3D7DCA",
        secondaryText: "#003A70",
        soft: "#E8F1FB",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#FFCB05",
        totalText: "#003A70",
      };
    case "sunny-yellow":
      return {
        accent: "#C6FF34",
        background: "#000000",
        badgeBackground: "#C6FF34",
        badgeText: "#000000",
        border: "#7F3AED",
        muted: "#E9D8FD",
        primary: "#7F3AED",
        secondaryText: "#C6FF34",
        soft: "#1A1028",
        surface: "#7F3AED",
        text: WHITE,
        totalBackground: "#C6FF34",
        totalText: "#000000",
      };
    case "premium-dark":
      return {
        accent: "#FF5F00",
        background: "#FFF4EC",
        badgeBackground: "#EB001B",
        badgeText: WHITE,
        border: "#FF5F00",
        muted: "#7A1D12",
        primary: "#EB001B",
        secondaryText: "#9A3412",
        soft: "#FFE4CC",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#EB001B",
        totalText: WHITE,
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
        accent: "#C6FF34",
        background: "#13670B",
        badgeBackground: "#C6FF34",
        badgeText: "#111111",
        border: "#0E4F08",
        muted: "#D7F5C8",
        primary: "#C6FF34",
        secondaryText: "#0B3D08",
        soft: "#E8F8D8",
        surface: WHITE,
        text: DARK_TEXT,
        totalBackground: "#C6FF34",
        totalText: "#111111",
      };
  }
}
