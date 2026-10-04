import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantMembership } from "@/lib/db/resolve-tenant-user";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import { readPosDeviceId } from "@/features/terminals/device-cookie";
import type { TerminalCard } from "@/features/terminals/terminal-types";

const db = prisma as any;

export class TerminalAccessError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TerminalAccessError";
    this.status = status;
  }
}

function cleanName(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function asStatus(value: unknown) {
  return value === "DISABLED" ? "DISABLED" : value === "ACTIVE" ? "ACTIVE" : "";
}

async function nextCode(companyId: string) {
  const rows = await db.posTerminal.findMany({
    select: { terminalCode: true },
    where: { companyId },
  });
  let max = 0;
  for (const row of rows as Array<{ terminalCode: string }>) {
    const match = /^POS-(\d+)$/.exec(row.terminalCode);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `POS-${String(max + 1).padStart(2, "0")}`;
}

function card(row: any, deviceId: string, shift: { id: string; openedAt: Date } | null): TerminalCard {
  return {
    currentShift: shift ? { id: String(shift.id), openedAt: new Date(shift.openedAt).toISOString() } : null,
    id: String(row.id),
    isCurrentDevice: Boolean(deviceId && row.boundDeviceId === deviceId),
    lastSeenAt: row.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
    status: row.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    terminalBound: Boolean(row.boundDeviceId),
    terminalCode: String(row.terminalCode),
    terminalName: String(row.terminalName),
  };
}

export async function listStoreTerminals(tenant: TenantContext): Promise<TerminalCard[]> {
  const scope = await resolveTenantScope(tenant);
  const deviceId = await readPosDeviceId();
  const rows = await db.posTerminal.findMany({
    orderBy: { terminalCode: "asc" },
    where: { branchId: scope.branchId, companyId: tenant.companyId, status: { not: "ARCHIVED" } },
  });
  const terminalIds = rows.map((row: { id: string }) => row.id);
  const openShifts = terminalIds.length === 0
    ? []
    : await db.cashSession.findMany({
        select: { id: true, openedAt: true, terminalId: true },
        where: {
          branchId: scope.branchId,
          closedAt: null,
          companyId: tenant.companyId,
          terminalId: { in: terminalIds },
        },
      });
  const shiftByTerminal = new Map(openShifts.map((shift: { terminalId: string; id: string; openedAt: Date }) => [shift.terminalId, shift]));
  return rows.map((row: any) => card(row, deviceId, (shiftByTerminal.get(row.id) as { id: string; openedAt: Date } | undefined) ?? null));
}

export async function createStoreTerminal(tenant: TenantContext, input: Record<string, unknown>) {
  const name = cleanName(input.terminalName ?? input.name);
  if (name.length < 1) throw new TerminalAccessError("Terminal name is required.");
  if (input.terminalCode) {
    const wanted = String(input.terminalCode).trim().toUpperCase();
    const taken = await db.posTerminal.findFirst({
      where: { companyId: tenant.companyId, terminalCode: wanted },
    });
    if (taken) throw new TerminalAccessError("Terminal code already exists for this store.");
    throw new TerminalAccessError("Terminal codes are assigned automatically.");
  }
  const scope = await resolveTenantScope(tenant);
  const terminalCode = await nextCode(tenant.companyId);
  try {
    await db.posTerminal.create({
      data: {
        branchId: scope.branchId,
        companyId: tenant.companyId,
        status: "ACTIVE",
        terminalCode,
        terminalName: name,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Unique constraint")) throw new TerminalAccessError("Terminal code already exists for this store.");
    throw error;
  }
  return listStoreTerminals(tenant);
}

async function ownedTerminal(tenant: TenantContext, terminalId: string) {
  const scope = await resolveTenantScope(tenant);
  const row = await db.posTerminal.findFirst({
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: String(terminalId) },
  });
  if (!row || row.status === "ARCHIVED") throw new TerminalAccessError("Terminal was not found.", 404);
  return row;
}

export async function updateStoreTerminal(tenant: TenantContext, terminalId: string, input: Record<string, unknown>) {
  const existing = await ownedTerminal(tenant, terminalId);
  if (input.terminalCode && String(input.terminalCode) !== existing.terminalCode) {
    throw new TerminalAccessError("Terminal code stays fixed after the terminal is created.");
  }
  if (input.companyId && String(input.companyId) !== tenant.companyId) {
    throw new TerminalAccessError("Terminal company cannot be changed.", 403);
  }
  const name = input.terminalName === undefined && input.name === undefined ? existing.terminalName : cleanName(input.terminalName ?? input.name);
  if (!name) throw new TerminalAccessError("Terminal name is required.");
  const status = input.status === undefined ? existing.status : asStatus(input.status);
  if (!status) throw new TerminalAccessError("Terminal status is not valid.");
  if (status === "DISABLED" && existing.status !== "DISABLED") {
    const openShift = await db.cashSession.findFirst({
      where: { closedAt: null, companyId: tenant.companyId, terminalId: existing.id },
    });
    if (openShift) throw new TerminalAccessError("Close this terminal's cash shift before disabling it.");
  }
  await db.posTerminal.update({
    data: { status, terminalName: name },
    where: { id: existing.id },
  });
  return listStoreTerminals(tenant);
}

export async function bindCurrentDevice(tenant: TenantContext, terminalId: string, deviceId: string, rebind = false) {
  if (!/^[a-f0-9]{32}$/.test(deviceId)) throw new TerminalAccessError("This device is not registered.");
  const terminal = await ownedTerminal(tenant, terminalId);
  if (terminal.status !== "ACTIVE") throw new TerminalAccessError("A disabled terminal cannot be used.", 403);
  const holder = await db.posTerminal.findFirst({
    where: { boundDeviceId: deviceId, NOT: { id: terminal.id } },
  });
  if (holder && holder.companyId !== tenant.companyId) {
    throw new TerminalAccessError("This device is already bound to another store.", 403);
  }
  if (holder) {
    const openShift = await db.cashSession.findFirst({
      where: { closedAt: null, companyId: holder.companyId, terminalId: holder.id },
    });
    if (openShift) throw new TerminalAccessError("Close the other terminal's cash shift before moving this device.");
  }
  if (holder && !rebind) throw new TerminalAccessError("This device is already bound to another terminal.");
  if (terminal.boundDeviceId && terminal.boundDeviceId !== deviceId) {
    const openOnTarget = await db.cashSession.findFirst({
      where: { closedAt: null, companyId: tenant.companyId, terminalId: terminal.id },
    });
    if (openOnTarget) throw new TerminalAccessError("Close this terminal's cash shift before binding a different device.");
    if (!rebind) throw new TerminalAccessError("This terminal is bound to another device.");
  }
  await db.$transaction(async (tx: any) => {
    if (holder) {
      await tx.posTerminal.update({ data: { boundDeviceId: null }, where: { id: holder.id } });
    }
    await tx.posTerminal.update({
      data: { boundDeviceId: deviceId, lastSeenAt: new Date() },
      where: { id: terminal.id },
    });
  });
  return listStoreTerminals(tenant);
}

export async function unbindTerminal(tenant: TenantContext, terminalId: string) {
  const terminal = await ownedTerminal(tenant, terminalId);
  const openShift = await db.cashSession.findFirst({
    where: { closedAt: null, companyId: tenant.companyId, terminalId: terminal.id },
  });
  if (openShift) throw new TerminalAccessError("Close this terminal's cash shift before unbinding the device.");
  await db.posTerminal.update({ data: { boundDeviceId: null }, where: { id: terminal.id } });
  return listStoreTerminals(tenant);
}

async function assertOwnerDeleteCredential(tenant: TenantContext, ownerPassword: unknown) {
  const secret = String(ownerPassword ?? "");
  if (!secret.trim()) throw new TerminalAccessError("Owner password is required.");
  const actor = await resolveTenantMembership(tenant);
  if (!actor.isOwner) throw new TerminalAccessError("Only the owner can delete a terminal.", 403);
  const ownerUser = await db.user.findFirst({
    select: { passwordHash: true },
    where: { id: actor.effectiveUserId, status: "active" },
  });
  if (!ownerUser?.passwordHash) throw new TerminalAccessError("Only the owner can delete a terminal.", 403);
  const passwordMatches = await compare(secret, ownerUser.passwordHash);
  if (!passwordMatches) throw new TerminalAccessError("Owner password is incorrect.");
}

export async function deleteStoreTerminal(tenant: TenantContext, terminalId: string, input: Record<string, unknown>) {
  await assertOwnerDeleteCredential(tenant, input.ownerPassword);
  const existing = await ownedTerminal(tenant, terminalId);
  const openShift = await db.cashSession.findFirst({
    where: { closedAt: null, companyId: tenant.companyId, terminalId: existing.id },
  });
  if (openShift) throw new TerminalAccessError("Close this terminal's cash shift before deleting it.");
  if (existing.boundDeviceId) throw new TerminalAccessError("Unbind this device before deleting the terminal.");

  const [sales, shifts, activity] = await Promise.all([
    db.sale.count({ where: { companyId: tenant.companyId, terminalId: existing.id } }),
    db.cashSession.count({ where: { companyId: tenant.companyId, terminalId: existing.id } }),
    db.storeActivityLog.count({ where: { businessId: tenant.companyId, terminalId: existing.id } }),
  ]);
  if (sales > 0 || shifts > 0 || activity > 0) {
    await db.posTerminal.update({
      data: { boundDeviceId: null, status: "ARCHIVED" },
      where: { id: existing.id },
    });
  } else {
    await db.posTerminal.delete({ where: { id: existing.id } });
  }
  return listStoreTerminals(tenant);
}

export async function recordTerminalActivity(
  tx: Record<string, any>,
  input: {
    action: string;
    amount?: number | null;
    branchId: string;
    companyId: string;
    targetId: string;
    targetName: string;
    targetType: string;
    terminalCode: string;
    terminalId: string;
    terminalName: string;
    userId: string;
  },
) {
  const actor = await tx.user.findFirst({
    select: { fullName: true, username: true },
    where: { id: input.userId },
  });
  await tx.storeActivityLog.create({
    data: {
      action: input.action,
      actorId: input.userId,
      actorName: String(actor?.fullName || actor?.username || "Staff"),
      actorRole: "staff",
      amount: input.amount ?? null,
      branchId: input.branchId,
      businessId: input.companyId,
      targetId: input.targetId,
      targetName: input.targetName,
      targetType: input.targetType,
      terminalId: input.terminalId,
      terminalName: `${input.terminalCode} · ${input.terminalName}`,
    },
  });
}

export async function resolveBoundTerminal(tenant: TenantContext, deviceId: string) {
  if (!deviceId) return null;
  const scope = await resolveTenantScope(tenant);
  const row = await db.posTerminal.findFirst({
    where: { boundDeviceId: deviceId, companyId: tenant.companyId, branchId: scope.branchId, status: { not: "ARCHIVED" } },
  });
  return row ?? null;
}

export async function requireActiveBoundTerminal(tx: Record<string, any>, tenant: TenantContext, claimedTerminalId?: string | null) {
  const deviceId = await readPosDeviceId();
  if (!deviceId) throw new TerminalAccessError("Bind this device to an active POS terminal before completing a sale.", 403);
  const scope = await resolveTenantScope(tenant, tx);
  const terminal = await tx.posTerminal.findFirst({
    where: { boundDeviceId: deviceId, branchId: scope.branchId, companyId: tenant.companyId },
  });
  if (!terminal) throw new TerminalAccessError("Bind this device to an active POS terminal before completing a sale.", 403);
  if (terminal.status !== "ACTIVE") throw new TerminalAccessError("A disabled terminal cannot be used.", 403);
  if (claimedTerminalId && claimedTerminalId !== terminal.id) {
    throw new TerminalAccessError("Terminal does not match this device.", 403);
  }
  await tx.posTerminal.update({ data: { lastSeenAt: new Date() }, where: { id: terminal.id } });
  return terminal;
}
