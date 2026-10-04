import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import {
  CHAT_STATUSES,
  FEATURE_STATUSES,
  SUPPORT_CATEGORIES,
  SUPPORT_TYPES,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from "@/features/support/support-types";

const db = prisma as any;

export {
  CHAT_STATUSES,
  FEATURE_STATUSES,
  SUPPORT_CATEGORIES,
  SUPPORT_TYPES,
};
export type { SupportMessageView, SupportTicketDetail, SupportTicketSummary } from "@/features/support/support-types";

export class SupportAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SupportAccessError";
    this.status = status;
  }
}

const SECRET_ASSIGNMENT = /\b(password|pin|token|secret|authorization)\b\s*[:=]\s*\S+/gi;
const BEARER = /\bBearer\s+\S+/gi;

export function cleanSupportText(value: unknown, max: number) {
  const text = String(value ?? "")
    .replace(SECRET_ASSIGNMENT, "$1=[redacted]")
    .replace(BEARER, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, max);
}

export function cleanSupportPath(value: unknown) {
  const raw = cleanSupportText(value, 160);
  if (!raw.startsWith("/")) return null;
  const path = raw.split("?")[0]?.split("#")[0] ?? "";
  return path.length > 1 ? path.slice(0, 120) : null;
}

export function cleanAppVersion(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9._-]{1,40}$/.test(text) ? text : null;
}

export function statusesForTicketType(type: string) {
  return type === "FEATURE_REQUEST" ? FEATURE_STATUSES : CHAT_STATUSES;
}

export function isTerminalSupportStatus(status: string) {
  return status === "RESOLVED" || status === "CLOSED" || status === "COMPLETED" || status === "DECLINED";
}

function assertLength(value: string, min: number, max: number, label: string) {
  if (value.length < min || value.length > max) {
    throw new SupportAccessError(`${label} must be ${min}-${max} characters.`);
  }
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function summary(row: any, lastMessage = ""): SupportTicketSummary {
  return {
    category: row.category ?? null,
    companyId: String(row.companyId),
    companyName: row.companyName ?? null,
    createdAt: iso(row.createdAt),
    id: String(row.id),
    lastMessage,
    status: String(row.status),
    storeUnread: Boolean(row.storeUnread),
    subject: String(row.subject),
    type: String(row.type),
    updatedAt: iso(row.updatedAt),
    userName: row.userName ?? null,
  };
}

async function actorName(tenant: TenantContext) {
  const [company, user] = await Promise.all([
    db.company.findFirst({ select: { name: true }, where: { id: tenant.companyId } }),
    db.user.findFirst({ select: { fullName: true, username: true }, where: { id: tenant.userId } }),
  ]);
  return {
    companyName: cleanSupportText(company?.name, 120) || null,
    userName: cleanSupportText(user?.fullName || user?.username, 120) || null,
  };
}

export async function listStoreSupportTickets(tenant: TenantContext, filter: { status?: string | null; type?: string | null } = {}) {
  const type = SUPPORT_TYPES.includes(filter.type as (typeof SUPPORT_TYPES)[number]) ? filter.type : undefined;
  const status = typeof filter.status === "string" && filter.status.trim() ? filter.status.trim() : undefined;
  const rows = await db.supportTicket.findMany({
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    where: {
      companyId: tenant.companyId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
    },
  });
  return rows.map((row: any) => summary(row, cleanSupportText(row.messages?.[0]?.message, 160)));
}

export async function getStoreSupportTicket(tenant: TenantContext, ticketId: string): Promise<SupportTicketDetail> {
  const id = cleanSupportText(ticketId, 80);
  const row = await db.supportTicket.findFirst({
    include: { messages: { orderBy: { createdAt: "asc" } } },
    where: { companyId: tenant.companyId, id },
  });
  if (!row) throw new SupportAccessError("Support ticket not found.", 404);
  if (row.storeUnread) {
    await db.supportTicket.update({ data: { storeUnread: false }, where: { id: row.id } });
    row.storeUnread = false;
  }
  return {
    ...summary(row, cleanSupportText(row.messages?.at(-1)?.message, 160)),
    affectedArea: row.affectedArea ?? null,
    appVersion: row.appVersion ?? null,
    browserSummary: row.browserSummary ?? null,
    messages: (row.messages ?? []).map((message: any) => ({
      createdAt: iso(message.createdAt),
      id: String(message.id),
      message: String(message.message),
      senderSide: message.senderSide === "SUPER_ADMIN" ? "SUPER_ADMIN" : "STORE",
    })),
    sourcePath: row.sourcePath ?? null,
  };
}

export async function createStoreSupportTicket(tenant: TenantContext, input: Record<string, unknown>) {
  const type = String(input.type ?? "");
  if (!SUPPORT_TYPES.includes(type as (typeof SUPPORT_TYPES)[number])) {
    throw new SupportAccessError("Support type is not valid.");
  }
  const subject = cleanSupportText(input.subject, 120);
  const message = cleanSupportText(input.message, 2000);
  const why = cleanSupportText(input.why, 1000);
  assertLength(subject, 1, 120, "Subject");
  assertLength(message, 1, 2000, "Message");
  if (type === "FEATURE_REQUEST") assertLength(why, 1, 1000, "Why it would help");
  const category = SUPPORT_CATEGORIES.includes(input.category as (typeof SUPPORT_CATEGORIES)[number]) ? String(input.category) : null;
  const names = await actorName(tenant);
  const body = type === "FEATURE_REQUEST" && why ? `${message}\n\nWhy it would help: ${why}` : message;
  const status = type === "FEATURE_REQUEST" ? "SUBMITTED" : "WAITING_SUPPORT";
  const ticket = await db.supportTicket.create({
    data: {
      adminUnread: true,
      affectedArea: cleanSupportText(input.affectedArea, 80) || null,
      appVersion: cleanAppVersion(input.appVersion),
      browserSummary: cleanSupportText(input.browserSummary, 240) || null,
      category,
      companyId: tenant.companyId,
      companyName: names.companyName,
      createdByUserId: tenant.userId,
      messages: {
        create: {
          message: body,
          senderSide: "STORE",
          senderUserId: tenant.userId,
        },
      },
      sourcePath: cleanSupportPath(input.sourcePath),
      status,
      storeUnread: false,
      subject,
      type,
      userName: names.userName,
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return getStoreSupportTicket(tenant, ticket.id);
}

export async function replyStoreSupportTicket(tenant: TenantContext, ticketId: string, input: Record<string, unknown>) {
  const message = cleanSupportText(input.message, 2000);
  assertLength(message, 1, 2000, "Message");
  const id = cleanSupportText(ticketId, 80);
  const existing = await db.supportTicket.findFirst({
    select: { id: true, status: true, type: true },
    where: { companyId: tenant.companyId, id },
  });
  if (!existing) throw new SupportAccessError("Support ticket not found.", 404);
  const reopened = existing.type !== "FEATURE_REQUEST" && isTerminalSupportStatus(existing.status);
  await db.$transaction([
    db.supportMessage.create({
      data: {
        message,
        senderSide: "STORE",
        senderUserId: tenant.userId,
        ticketId: existing.id,
      },
    }),
    db.supportTicket.update({
      data: {
        adminUnread: true,
        closedAt: reopened ? null : undefined,
        status: reopened ? "WAITING_SUPPORT" : existing.type === "FEATURE_REQUEST" ? existing.status : "WAITING_SUPPORT",
        storeUnread: false,
      },
      where: { id: existing.id },
    }),
  ]);
  return getStoreSupportTicket(tenant, existing.id);
}

export function rejectStoreStatusChange() {
  throw new SupportAccessError("Store users cannot change support status.", 403);
}

export async function countUnreadStoreSupport(companyId: string) {
  try {
    return await db.supportTicket.count({ where: { companyId, storeUnread: true } });
  } catch {
    return 0;
  }
}

export async function listAdminSupportTickets(filter: { company?: string | null; status?: string | null; type?: string | null }) {
  const type = SUPPORT_TYPES.includes(filter.type as (typeof SUPPORT_TYPES)[number]) ? filter.type : undefined;
  const status = typeof filter.status === "string" && filter.status.trim() ? cleanSupportText(filter.status, 40) : undefined;
  const company = cleanSupportText(filter.company, 80);
  const where = {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(company
      ? {
          OR: [
            { companyId: company },
            { companyName: { contains: company, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, unreadCount] = await Promise.all([
    db.supportTicket.findMany({
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      where,
    }),
    db.supportTicket.count({ where: { adminUnread: true } }),
  ]);
  return {
    tickets: rows.map((row: any) => summary(row, cleanSupportText(row.messages?.[0]?.message, 160))),
    unreadCount,
  };
}

export async function getAdminSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  const id = cleanSupportText(ticketId, 80);
  const row = await db.supportTicket.findFirst({
    include: { messages: { orderBy: { createdAt: "asc" } } },
    where: { id },
  });
  if (!row) throw new SupportAccessError("Support ticket not found.", 404);
  if (row.adminUnread) {
    await db.supportTicket.update({ data: { adminUnread: false }, where: { id: row.id } });
    row.adminUnread = false;
  }
  return {
    ...summary(row, cleanSupportText(row.messages?.at(-1)?.message, 160)),
    affectedArea: row.affectedArea ?? null,
    appVersion: row.appVersion ?? null,
    browserSummary: row.browserSummary ?? null,
    messages: (row.messages ?? []).map((message: any) => ({
      createdAt: iso(message.createdAt),
      id: String(message.id),
      message: String(message.message),
      senderSide: message.senderSide === "SUPER_ADMIN" ? "SUPER_ADMIN" : "STORE",
    })),
    sourcePath: row.sourcePath ?? null,
  };
}

export async function replyAdminSupportTicket(actorId: string, ticketId: string, input: Record<string, unknown>) {
  const message = cleanSupportText(input.message, 2000);
  assertLength(message, 1, 2000, "Message");
  const existing = await db.supportTicket.findFirst({
    select: { id: true, status: true, type: true },
    where: { id: cleanSupportText(ticketId, 80) },
  });
  if (!existing) throw new SupportAccessError("Support ticket not found.", 404);
  const nextStatus = existing.type === "FEATURE_REQUEST" ? existing.status : "WAITING_STORE";
  await db.$transaction([
    db.supportMessage.create({
      data: {
        message,
        senderSide: "SUPER_ADMIN",
        senderUserId: actorId,
        ticketId: existing.id,
      },
    }),
    db.supportTicket.update({
      data: {
        adminUnread: false,
        closedAt: existing.type === "FEATURE_REQUEST" ? undefined : null,
        status: nextStatus,
        storeUnread: true,
      },
      where: { id: existing.id },
    }),
  ]);
  return getAdminSupportTicket(existing.id);
}

export async function updateAdminSupportStatus(ticketId: string, status: string) {
  const existing = await db.supportTicket.findFirst({
    select: { id: true, type: true },
    where: { id: cleanSupportText(ticketId, 80) },
  });
  if (!existing) throw new SupportAccessError("Support ticket not found.", 404);
  const allowed = statusesForTicketType(existing.type);
  if (!allowed.includes(status as never)) {
    throw new SupportAccessError("Support status is not valid for this ticket.");
  }
  await db.supportTicket.update({
    data: {
      closedAt: isTerminalSupportStatus(status) ? new Date() : null,
      status,
      storeUnread: true,
    },
    where: { id: existing.id },
  });
  return getAdminSupportTicket(existing.id);
}
