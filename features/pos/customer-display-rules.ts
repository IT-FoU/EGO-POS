import type { CustomerDisplayMedia, CustomerDisplaySettings } from "@/features/pos/customer-display-settings";
import type { PosDisplayState } from "@/features/pos/types";

export type CustomerDisplayMode = "cart" | "idle" | "payment" | "thank_you";

export type CustomerDisplayIdleSlide =
  | CustomerDisplayMedia
  | { message: string; type: "message" };

export function resolveCustomerDisplayMode(state: Pick<PosDisplayState, "displayMode" | "items">): CustomerDisplayMode {
  if (state.displayMode === "thank_you") {
    return "thank_you";
  }
  if (!state.items.length || state.displayMode === "advertising") {
    return "idle";
  }
  if (state.displayMode === "payment") {
    return "payment";
  }
  return "cart";
}

export function customerDisplayMemberName(state: Pick<PosDisplayState, "customer">) {
  const name = state.customer?.name?.trim() ?? "";
  return name || null;
}

export function customerDisplayHiddenReductions(state: Pick<PosDisplayState, "loyaltyRedeemLak" | "manualDiscountLak" | "membershipDiscountLak" | "promotionDiscountLak">) {
  return Math.max(0, state.promotionDiscountLak ?? 0)
    + Math.max(0, state.membershipDiscountLak ?? 0)
    + Math.max(0, state.manualDiscountLak ?? 0)
    + Math.max(0, state.loyaltyRedeemLak ?? 0);
}

export function customerDisplayShouldShowDiscountRows(settings: Pick<CustomerDisplaySettings, "showDiscountDetails">) {
  return settings.showDiscountDetails !== false;
}

export function customerDisplayShouldShowSubtotal(
  settings: Pick<CustomerDisplaySettings, "showDiscountDetails">,
  state: Pick<PosDisplayState, "loyaltyRedeemLak" | "manualDiscountLak" | "membershipDiscountLak" | "promotionDiscountLak">,
) {
  if (customerDisplayShouldShowDiscountRows(settings)) {
    return true;
  }
  return customerDisplayHiddenReductions(state) <= 0;
}

export function customerDisplayShouldShowPromotionInfo(settings: Pick<CustomerDisplaySettings, "showPromotionInformation">) {
  return settings.showPromotionInformation !== false;
}

export function resolveCustomerDisplayIdleSlide(
  settings: Pick<CustomerDisplaySettings, "media" | "promotionMessages">,
  slideIndex: number,
  fallbackMessages: string[],
): CustomerDisplayIdleSlide {
  const images = settings.media.filter((item) => item.type === "image");
  const videos = settings.media.filter((item) => item.type === "video");
  const media = images.length > 0 ? images : videos;
  if (media.length > 0) {
    return media[slideIndex % media.length]!;
  }
  const messages = settings.promotionMessages.length > 0 ? settings.promotionMessages : fallbackMessages;
  return { message: messages[slideIndex % messages.length] || fallbackMessages[0] || "", type: "message" };
}
