import { businessDayLabel, startOfBusinessDay } from "@/lib/datetime/business-timezone";

export type NotificationCategory =
  | "low_stock"
  | "near_expiry"
  | "out_of_stock"
  | "membership_expiring"
  | "promotion_starting"
  | "promotion_ending"
  | "support_reply";

export type NotificationItem = {
  category: NotificationCategory;
  count?: number;
  daysRemaining?: number;
  entityName?: string;
  href: string;
  id: string;
};

const DAY_MS = 86_400_000;

export function classifyStockNotification(available: number, minStock: number) {
  if (available <= 0) return "out_of_stock" as const;
  if (available <= minStock) return "low_stock" as const;
  return null;
}

export function availableStock(onHand: number, reserved: number) {
  return Math.max(0, onHand - reserved);
}

function businessDayDistance(from: Date, to: Date) {
  return Math.round((startOfBusinessDay(to).getTime() - startOfBusinessDay(from).getTime()) / DAY_MS);
}

export function nearExpiryDays(expiryDate: Date | string | null | undefined, now = new Date()) {
  if (!expiryDate) return null;
  const distance = businessDayDistance(now, new Date(expiryDate));
  return distance >= 0 && distance <= 30 ? distance : null;
}

export function membershipExpiringDays(endDate: Date | string | null | undefined, now = new Date()) {
  if (!endDate) return null;
  const distance = businessDayDistance(now, new Date(endDate));
  return distance >= 1 && distance <= 7 ? distance : null;
}

export function promotionWindowDays(date: Date | string | null | undefined, now = new Date()) {
  if (!date) return null;
  const distance = businessDayDistance(now, new Date(date));
  return distance >= 0 && distance <= 7 ? distance : null;
}

export function notificationDayLabel(date: Date | string) {
  return businessDayLabel(new Date(date));
}
