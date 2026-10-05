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

const cdEn = {
  discount: "Discount",
  grandTotal: "Grand Total",
  items: "Items",
  member: "Member",
  pay: "Pay",
  payment: "Payment",
  qty: "Qty",
  returningIn: "Returning in {seconds}s",
  scanToPay: "Scan to Pay",
  subtotal: "Subtotal",
  thankYou: "Thank You",
  total: "Total",
  unitPrice: "Unit Price",
  welcome: "Welcome",
} as const;

const cdLo: Record<keyof typeof cdEn, string> = {
  discount: "\u0EAA\u0EC8\u0EA7\u0E99\u0EAB\u0EBC\u0EB8\u0E94",
  grandTotal: "\u0E8D\u0EAD\u0E94\u0EA5\u0EA7\u0EA1",
  items: "\u0EA5\u0EB2\u0E8D\u0E81\u0EB2\u0E99",
  member: "\u0EAA\u0EB0\u0EA1\u0EB2\u0E8A\u0EB4\u0E81",
  pay: "\u0E88\u0EC8\u0EB2\u0E8D",
  payment: "\u0E81\u0EB2\u0E99\u0E8A\u0EB3\u0EA5\u0EB0",
  qty: "\u0E88\u0EB3\u0E99\u0EA7\u0E99",
  returningIn: "\u0E81\u0EB1\u0E9A\u0EC3\u0E99 {seconds} \u0EA7\u0EB4\u0E99\u0EB2\u0E97\u0EB5",
  scanToPay: "\u0EAA\u0EB0\u0EC1\u0E81\u0E99\u0EC0\u0E9E\u0EB7\u0EC8\u0EAD\u0E88\u0EC8\u0EB2\u0E8D",
  subtotal: "\u0EA5\u0EA7\u0EA1\u0E8D\u0EC8\u0EAD\u0E8D",
  thankYou: "\u0E82\u0EAD\u0E9A\u0EC3\u0E88",
  total: "\u0EA5\u0EA7\u0EA1",
  unitPrice: "\u0EA5\u0EB2\u0E84\u0EB2",
  welcome: "\u0E8D\u0EB4\u0E99\u0E94\u0EB5\u0E95\u0EC9\u0EAD\u0E99\u0EAE\u0EB1\u0E9A",
};

export type CustomerDisplayCopyKey = keyof typeof cdEn;

export function tCd(key: CustomerDisplayCopyKey, locale?: string | null) {
  return (locale === "lo" ? cdLo : cdEn)[key];
}

export function fillCustomerDisplayCopy(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}
