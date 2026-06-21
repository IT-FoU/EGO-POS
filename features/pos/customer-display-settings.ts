import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/demo/storage";

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
};

export function readCustomerDisplaySettingsFromStorage(): CustomerDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_CUSTOMER_DISPLAY_SETTINGS;
  }

  const parsed = readJsonFromStorage<Partial<CustomerDisplaySettings>>(CUSTOMER_DISPLAY_SETTINGS_KEY, {});
  return {
    autoReturnSeconds:
      typeof parsed.autoReturnSeconds === "number" && parsed.autoReturnSeconds > 0
        ? parsed.autoReturnSeconds
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.autoReturnSeconds,
    media: Array.isArray(parsed.media) ? parsed.media : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.media,
    promotionMessages:
      Array.isArray(parsed.promotionMessages) && parsed.promotionMessages.length > 0
        ? parsed.promotionMessages
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages,
    template: CUSTOMER_DISPLAY_TEMPLATES.some((template) => template.id === parsed.template)
      ? parsed.template as CustomerDisplayTemplate
      : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.template,
  };
}

export function writeCustomerDisplaySettingsToStorage(settings: CustomerDisplaySettings) {
  writeJsonToStorage(CUSTOMER_DISPLAY_SETTINGS_KEY, settings);
}
