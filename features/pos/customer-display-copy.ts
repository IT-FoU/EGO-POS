export const LEGACY_EGO_POS_WELCOME = "Welcome to EGO POS";
export const LEGACY_EGO_POS_STORE = "EGO POS";
export const NEUTRAL_CUSTOMER_DISPLAY_WELCOME = "Welcome";

const LEGACY_DEFAULT_PROMOTION_MESSAGES = [
  LEGACY_EGO_POS_WELCOME,
  "Member discounts available today",
  "Thank you for shopping with us",
];

export function isLegacyEgoPosCopy(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed === LEGACY_EGO_POS_STORE || trimmed === LEGACY_EGO_POS_WELCOME;
}

export function rewriteLegacyCustomerDisplayMessage(value: string) {
  return isLegacyEgoPosCopy(value) ? NEUTRAL_CUSTOMER_DISPLAY_WELCOME : value;
}

export function normalizeCustomerDisplayPromotionMessages(messages: string[] | null | undefined) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  if (messages.join("\n") === LEGACY_DEFAULT_PROMOTION_MESSAGES.join("\n")) {
    return null;
  }
  return messages.map((message) => rewriteLegacyCustomerDisplayMessage(String(message ?? "")));
}

export function resolveCustomerDisplayStoreName(
  storeName?: string | null,
  promotionMessages?: string[],
) {
  const company = storeName?.trim() ?? "";
  if (company) {
    return company;
  }
  const configured = promotionMessages?.[0]?.trim() ?? "";
  if (configured && !isLegacyEgoPosCopy(configured)) {
    return configured;
  }
  return NEUTRAL_CUSTOMER_DISPLAY_WELCOME;
}

export function customerDisplayWelcomeMessage(promotionMessages?: string[]) {
  const first = promotionMessages?.[0]?.trim() ?? "";
  if (first && !isLegacyEgoPosCopy(first)) {
    return first;
  }
  return NEUTRAL_CUSTOMER_DISPLAY_WELCOME;
}
