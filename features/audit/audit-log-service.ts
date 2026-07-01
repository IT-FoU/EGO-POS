import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export const PLATFORM_AUDIT_ACTIONS = {
  AUTH_ACCESS_DENIED: "auth.access_denied",
  AUTH_LOGIN: "auth.login",
  AUTH_LOGIN_FAILED: "auth.login_failed",
  BILLING_AUTO_CHARGE: "billing.auto_charge",
  BUSINESS_ARCHIVE: "business.archive",
  BUSINESS_CREATE: "business.create",
  BUSINESS_DELETE: "business.delete",
  BUSINESS_REACTIVATE: "business.reactivate",
  BUSINESS_SUSPEND: "business.suspend",
  FEATURE_TOGGLE: "feature.toggle",
  IMPERSONATE_END: "impersonate.end",
  IMPERSONATE_START: "impersonate.start",
  PLAN_CHANGE: "plan.change",
  PLAN_CUSTOM_OVERRIDE: "plan.custom_override",
  POS_TEMPLATE_ARCHIVE: "pos_template.archive",
  POS_TEMPLATE_DRAFT: "pos_template.draft",
  POS_TEMPLATE_PUBLISH: "pos_template.publish",
  POS_TEMPLATE_UPDATE: "pos_template.update",
  SETTINGS_UPDATE: "settings.update",
  SUBSCRIPTION_CANCEL: "subscription.cancel",
  SUBSCRIPTION_DOWNGRADE: "subscription.downgrade",
  SUBSCRIPTION_EXTEND: "subscription.extend",
  SUBSCRIPTION_MARK_PAID: "subscription.mark_paid",
  SUBSCRIPTION_UPGRADE: "subscription.upgrade",
  SUBSCRIPTION_AUTO_EXPIRE: "subscription.auto_expire",
  SUBSCRIPTION_WEBHOOK_PAYMENT: "subscription.webhook_payment",
  USER_CREATE: "user.create",
  USER_DISABLE: "user.disable",
  USER_RESET_PASSWORD: "user.reset_password",
  USER_ROLE_CHANGE: "user.role_change",
} as const;

export const STORE_ACTIVITY_ACTIONS = {
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_CREDIT_UPDATE: "customer.credit_update",
  CUSTOMER_UPDATE: "customer.update",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_COUNT: "inventory.count",
  INVENTORY_STOCK_IN: "inventory.stock_in",
  INVENTORY_STOCK_OUT: "inventory.stock_out",
  INVENTORY_TRANSFER: "inventory.transfer",
  PAYMENT_RECEIVE: "payment.receive",
  PAYMENT_REFUND: "payment.refund",
  PRODUCT_CREATE: "product.create",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_PRICE_CHANGE: "product.price_change",
  PRODUCT_UPDATE: "product.update",
  PROMOTION_APPLY: "promotion.apply",
  PROMOTION_REVERSE: "promotion.reverse",
  SALE_COMPLETE: "sale.complete",
  SALE_REFUND: "sale.refund",
  SALE_VOID: "sale.void",
  SHIFT_CLOSE: "shift.close",
  SHIFT_OPEN: "shift.open",
} as const;

export const PLATFORM_TARGET_TYPES = {
  AUTH: "auth",
  BILLING: "billing",
  BUSINESS: "business",
  FEATURE: "feature",
  IMPERSONATION: "impersonation",
  PLAN: "plan",
  POS_TEMPLATE: "pos_template",
  SETTINGS: "settings",
  SUBSCRIPTION: "subscription",
  SYSTEM: "system",
  USER: "user",
} as const;

export type AuditStatus = "success" | "denied" | "failed";
export type AuditSeverity = "info" | "warning" | "critical" | "security";

const SENSITIVE_KEY_PATTERN = /(password|password_hash|api_key|secret|token|access_token|refresh_token|private_key|card_number|bank_account|account_number|payment_secret)/i;
const LAST_FOUR_KEY_PATTERN = /(card_number|bank_account|account_number)/i;

function maskScalar(key: string, value: unknown) {
  if (/password|password_hash/i.test(key)) {
    return "[changed]";
  }
  if (LAST_FOUR_KEY_PATTERN.test(key) && typeof value === "string") {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 4 ? `****${digits.slice(-4)}` : "[redacted]";
  }
  if (typeof value === "string" && value.length > 4 && !/secret|token|key/i.test(key)) {
    return `****${value.slice(-4)}`;
  }
  return "[redacted]";
}

export function maskAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => maskAuditJson(item) ?? null) as Prisma.InputJsonArray;
  }
  if (typeof value === "object") {
    const masked: Record<string, Prisma.InputJsonValue | null> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        masked[key] = maskScalar(key, entry) as Prisma.InputJsonValue;
      } else {
        masked[key] = maskAuditJson(entry) ?? null;
      }
    });
    return masked as Prisma.InputJsonObject;
  }
  return value as Prisma.InputJsonValue;
}

export function createAuditRequestId() {
  return randomUUID();
}

export async function createPlatformAuditLog(input: {
  action: string;
  actorEmail?: string | null;
  actorId?: string | null;
  actorName: string;
  actorRole?: string | null;
  actorType?: "human" | "system";
  afterValue?: unknown;
  beforeValue?: unknown;
  businessId?: string | null;
  ipAddress?: string | null;
  metadata?: unknown;
  requestId?: string | null;
  severity?: AuditSeverity;
  status?: AuditStatus;
  targetId?: string | null;
  targetName?: string | null;
  targetType: string;
  userAgent?: string | null;
}) {
  const requestId = input.requestId ?? createAuditRequestId();
  return db.platformAuditLog.create({
    data: {
      action: input.action,
      actorEmail: input.actorEmail ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole ?? null,
      actorType: input.actorType ?? "human",
      afterValue: maskAuditJson(input.afterValue),
      beforeValue: maskAuditJson(input.beforeValue),
      businessId: input.businessId ?? null,
      ipAddress: input.ipAddress ?? null,
      metadata: maskAuditJson(input.metadata),
      requestId,
      severity: input.severity ?? "info",
      status: input.status ?? "success",
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      targetType: input.targetType,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function createStoreActivityLog(input: {
  action: string;
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  afterValue?: unknown;
  amount?: Prisma.Decimal | number | string | null;
  beforeValue?: unknown;
  branchId?: string | null;
  businessId: string;
  currency?: string;
  deviceName?: string | null;
  metadata?: unknown;
  occurredAt?: Date;
  status?: AuditStatus;
  syncedAt?: Date | null;
  targetId?: string | null;
  targetName?: string | null;
  targetType: string;
  terminalId?: string | null;
  terminalName?: string | null;
}) {
  return db.storeActivityLog.create({
    data: {
      action: input.action,
      actorId: input.actorId ?? null,
      actorName: input.actorName,
      actorRole: input.actorRole,
      afterValue: maskAuditJson(input.afterValue),
      amount: input.amount ?? null,
      beforeValue: maskAuditJson(input.beforeValue),
      branchId: input.branchId ?? null,
      businessId: input.businessId,
      currency: input.currency ?? "LAK",
      deviceName: input.deviceName ?? null,
      metadata: maskAuditJson(input.metadata),
      occurredAt: input.occurredAt ?? new Date(),
      status: input.status ?? "success",
      syncedAt: input.syncedAt ?? null,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      targetType: input.targetType,
      terminalId: input.terminalId ?? null,
      terminalName: input.terminalName ?? null,
    },
  });
}

export async function archivePlatformAuditLogsOlderThan(cutoff: Date) {
  return db.$transaction([
    db.$executeRaw`INSERT INTO platform_audit_log_archive SELECT * FROM platform_audit_logs WHERE created_at < ${cutoff}`,
    db.$executeRaw`DELETE FROM platform_audit_logs WHERE created_at < ${cutoff}`,
  ]);
}

export async function archiveStoreActivityLogsOlderThan(cutoff: Date) {
  return db.$transaction([
    db.$executeRaw`INSERT INTO store_activity_log_archive SELECT * FROM store_activity_logs WHERE created_at < ${cutoff}`,
    db.$executeRaw`DELETE FROM store_activity_logs WHERE created_at < ${cutoff}`,
  ]);
}
