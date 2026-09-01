import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/demo/storage";
import {
  DEFAULT_CUSTOMER_DISPLAY_THEME,
  parseCustomerDisplayTheme,
  type CustomerDisplayThemeId,
} from "@/features/pos/customer-display-theme";

export const CUSTOMER_DISPLAY_SETTINGS_KEY = DemoStorageKeys.customerDisplaySettings;

export type CustomerDisplayTemplate =
  | "classic_checkout"
  | "qr_focus"
  | "ads_checkout"
  | "fullscreen_promotion"
  | "vip_membership";

export type CustomerDisplayMedia = {
  id: string;
  name: string;
  type: "image" | "video";
  url: string;
};

export type CustomerDisplaySettings = {
  autoReturnSeconds: number;
  media: CustomerDisplayMedia[];
  promotionMessages: string[];
  template: CustomerDisplayTemplate;
  theme: CustomerDisplayThemeId;
};

export const CUSTOMER_DISPLAY_TEMPLATES: Array<{
  description: string;
  id: CustomerDisplayTemplate;
  name: string;
}> = [
  {
    description: "Balanced QR, items, promotions, and totals for standard checkout.",
    id: "classic_checkout",
    name: "Classic Checkout",
  },
  {
    description: "Large payment QR first, with compact items and totals beside it.",
    id: "qr_focus",
    name: "QR Focus",
  },
  {
    description: "Checkout with a stronger advertising and promotion panel.",
    id: "ads_checkout",
    name: "Ads + Checkout",
  },
  {
    description: "Full-screen promotions when idle, checkout when sale starts.",
    id: "fullscreen_promotion",
    name: "Full Screen Promotion",
  },
  {
    description: "Membership-first view for loyalty-focused stores.",
    id: "vip_membership",
    name: "VIP Membership",
  },
];

export const DEFAULT_CUSTOMER_DISPLAY_SETTINGS: CustomerDisplaySettings = {
  autoReturnSeconds: 5,
  media: [],
  promotionMessages: [
    "Welcome to EGO POS",
    "Member discounts available today",
    "Thank you for shopping with us",
  ],
  template: "classic_checkout",
  theme: DEFAULT_CUSTOMER_DISPLAY_THEME,
};

export function readCustomerDisplaySettingsFromStorage(): CustomerDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_CUSTOMER_DISPLAY_SETTINGS;
  }

  const parsed = readJsonFromStorage<Partial<CustomerDisplaySettings>>(CUSTOMER_DISPLAY_SETTINGS_KEY, {});
  return normalizeCustomerDisplaySettings(parsed);
}

export function normalizeCustomerDisplaySettings(
  parsed: Partial<CustomerDisplaySettings> | null | undefined,
): CustomerDisplaySettings {
  const source = parsed ?? {};
  return {
    autoReturnSeconds:
      typeof source.autoReturnSeconds === "number" && source.autoReturnSeconds > 0
        ? source.autoReturnSeconds
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.autoReturnSeconds,
    media: Array.isArray(source.media) ? source.media : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.media,
    promotionMessages:
      Array.isArray(source.promotionMessages) && source.promotionMessages.length > 0
        ? source.promotionMessages
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages,
    template: CUSTOMER_DISPLAY_TEMPLATES.some((template) => template.id === source.template)
      ? source.template as CustomerDisplayTemplate
      : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.template,
    theme: parseCustomerDisplayTheme(source.theme),
  };
}

export function writeCustomerDisplaySettingsToStorage(settings: CustomerDisplaySettings) {
  writeJsonToStorage(CUSTOMER_DISPLAY_SETTINGS_KEY, settings);
}
