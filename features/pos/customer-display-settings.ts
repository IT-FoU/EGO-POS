import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/demo/storage";
import {
  DEFAULT_CUSTOMER_DISPLAY_TEMPLATE,
  isCustomerDisplayTemplate,
  parseCustomerDisplayTemplate,
  type CustomerDisplayTemplate,
} from "@/features/pos/customer-display-templates";
import {
  DEFAULT_CUSTOMER_DISPLAY_QR_STYLE,
  parseCustomerDisplayQrStyle,
  type CustomerDisplayQrStyle,
} from "@/features/pos/customer-display-qr-style";
import {
  NEUTRAL_CUSTOMER_DISPLAY_WELCOME,
  normalizeCustomerDisplayPromotionMessages,
} from "@/features/pos/customer-display-copy";

export const CUSTOMER_DISPLAY_SETTINGS_KEY = DemoStorageKeys.customerDisplaySettings;

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
  qrDisplayStyle: CustomerDisplayQrStyle;
  showDiscountDetails: boolean;
  showPromotionInformation: boolean;
  template: CustomerDisplayTemplate;
};

export { CUSTOMER_DISPLAY_TEMPLATE_OPTIONS as CUSTOMER_DISPLAY_TEMPLATES } from "@/features/pos/customer-display-templates";
export type { CustomerDisplayTemplate } from "@/features/pos/customer-display-templates";

export const DEFAULT_CUSTOMER_DISPLAY_SETTINGS: CustomerDisplaySettings = {
  autoReturnSeconds: 5,
  media: [],
  promotionMessages: [
    NEUTRAL_CUSTOMER_DISPLAY_WELCOME,
    "Member discounts available today",
    "Thank you for shopping with us",
  ],
  qrDisplayStyle: DEFAULT_CUSTOMER_DISPLAY_QR_STYLE,
  showDiscountDetails: true,
  showPromotionInformation: true,
  template: DEFAULT_CUSTOMER_DISPLAY_TEMPLATE,
};

export function readCustomerDisplaySettingsFromStorage(): CustomerDisplaySettings {
  if (typeof window === "undefined") {
    return DEFAULT_CUSTOMER_DISPLAY_SETTINGS;
  }

  const parsed = readJsonFromStorage<StoredCustomerDisplaySettings>(
    CUSTOMER_DISPLAY_SETTINGS_KEY,
    {},
  );
  const normalized = normalizeCustomerDisplaySettings(parsed);
  if (customerDisplaySettingsNeedTemplateMigration(parsed)) {
    writeCustomerDisplaySettingsToStorage(normalized);
  }
  return normalized;
}

type StoredCustomerDisplaySettings = Partial<Omit<CustomerDisplaySettings, "template">> & {
  template?: unknown;
  theme?: string;
};

export function customerDisplaySettingsNeedTemplateMigration(
  parsed: StoredCustomerDisplaySettings | null | undefined,
) {
  const rawTemplate = parsed?.template ?? parsed?.theme;
  return typeof rawTemplate === "string" && !isCustomerDisplayTemplate(rawTemplate);
}

export function normalizeCustomerDisplaySettings(
  parsed: StoredCustomerDisplaySettings | null | undefined,
): CustomerDisplaySettings {
  const source = parsed ?? {};
  return {
    autoReturnSeconds:
      typeof source.autoReturnSeconds === "number" && source.autoReturnSeconds > 0
        ? source.autoReturnSeconds
        : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.autoReturnSeconds,
    media: Array.isArray(source.media) ? source.media : DEFAULT_CUSTOMER_DISPLAY_SETTINGS.media,
    promotionMessages:
      normalizeCustomerDisplayPromotionMessages(source.promotionMessages)
      ?? DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages,
    qrDisplayStyle: parseCustomerDisplayQrStyle(source.qrDisplayStyle),
    showDiscountDetails: source.showDiscountDetails !== false,
    showPromotionInformation: source.showPromotionInformation !== false,
    template: parseCustomerDisplayTemplate(source.template ?? source.theme),
  };
}

export function writeCustomerDisplaySettingsToStorage(settings: CustomerDisplaySettings) {
  writeJsonToStorage(CUSTOMER_DISPLAY_SETTINGS_KEY, settings);
}

export function resetCustomerDisplayAppearanceSettings(_current?: CustomerDisplaySettings): CustomerDisplaySettings {
  return resetAllCustomerDisplaySettings();
}

export function resetAllCustomerDisplaySettings(): CustomerDisplaySettings {
  return {
    ...DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
    media: [],
    promotionMessages: [...DEFAULT_CUSTOMER_DISPLAY_SETTINGS.promotionMessages],
  };
}
