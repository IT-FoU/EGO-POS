import type { TenantContext } from "@/lib/db/write-context";

export const ESSENTIAL_ACTIVITY_ACTIONS = [
  "pos.sale.complete",
  "pos.sale.refund",
  "pos.sale.void",
  "pos.cash.in",
  "pos.cash.out",
  "product.create",
  "product.update",
  "inventory.adjust",
  "staff.create",
  "staff.delete",
  "staff.role_change",
  "settings.update",
  "terminal.bind",
  "terminal.unbind",
  "terminal.edit",
  "terminal.delete",
] as const;

export const ESSENTIAL_ACTIVITY_MODULES = ["pos", "products", "inventory", "staff", "settings"] as const;

const MODULE_PREFIXES: Record<string, string[]> = {
  inventory: ["inventory."],
  pos: ["pos."],
  products: ["product."],
  settings: ["settings.", "terminal."],
  staff: ["staff."],
};

export function activityModuleForAction(action: string) {
  const match = Object.entries(MODULE_PREFIXES).find(([, prefixes]) => prefixes.some((prefix) => action.startsWith(prefix)));
  return match?.[0] ?? "pos";
}

export function activityActionMatchesModule(action: string, module: string) {
  const prefixes = MODULE_PREFIXES[module];
  if (!prefixes) return false;
  return prefixes.some((prefix) => action.startsWith(prefix));
}

type ActivityClient = any;

export type EssentialActivityInput = {
  action: string;
  after?: Record<string, string | number | boolean | null>;
  amount?: number | null;
  before?: Record<string, string | number | boolean | null>;
  branchId?: string | null;
  companyId: string;
  deviceId?: string | null;
  entityId?: string | null;
  entityType: string;
  fallbackTerminalId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  module: string;
  summary: string;
  terminalCode?: string | null;
  terminalId?: string | null;
  terminalName?: string | null;
  userId?: string | null;
};

function compact(value: Record<string, string | number | boolean | null> | undefined) {
  if (!value) return undefined;
  const next: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value).slice(0, 6)) {
    next[key] = typeof item === "string" ? item.slice(0, 80) : item;
  }
  return next;
}

async function readBoundDeviceId() {
  try {
    const mod = await import("@/features/terminals/device-cookie");
    return await mod.readPosDeviceId();
  } catch {
    return "";
  }
}

async function resolveTerminal(tx: ActivityClient, input: EssentialActivityInput) {
  if (input.terminalId && input.terminalCode) {
    return {
      deviceId: input.deviceId ?? null,
      id: input.terminalId,
      terminalCode: input.terminalCode,
      terminalName: input.terminalName ?? "",
    };
  }

  try {
    const deviceId = input.deviceId || await readBoundDeviceId();
    if (deviceId) {
      const bound = await tx.posTerminal.findFirst({
        select: { boundDeviceId: true, id: true, terminalCode: true, terminalName: true },
        where: { boundDeviceId: deviceId, companyId: input.companyId, status: { not: "ARCHIVED" } },
      });
      if (bound) return { ...bound, deviceId };
    }

    const terminalId = input.terminalId || input.fallbackTerminalId;
    if (!terminalId) return null;
    const row = await tx.posTerminal.findFirst({
      select: { boundDeviceId: true, id: true, terminalCode: true, terminalName: true },
      where: { companyId: input.companyId, id: terminalId },
    });
    if (!row) return null;
    return { ...row, deviceId: input.deviceId ?? row.boundDeviceId ?? null };
  } catch {
    return null;
  }
}

export async function recordEssentialActivity(tx: ActivityClient, input: EssentialActivityInput) {
  const actor = input.userId
    ? await tx.user.findFirst({
      select: { fullName: true, username: true },
      where: { id: input.userId },
    })
    : null;
  const terminal = await resolveTerminal(tx, input);
  const summary = String(input.summary || input.action).slice(0, 180);
  await tx.storeActivityLog.create({
    data: {
      action: input.action,
      actorId: input.userId ?? null,
      actorName: String(actor?.fullName || actor?.username || "Staff"),
      actorRole: "staff",
      afterValue: compact(input.after),
      amount: input.amount ?? null,
      beforeValue: compact(input.before),
      branchId: input.branchId ?? null,
      businessId: input.companyId,
      deviceName: terminal?.deviceId ?? input.deviceId ?? null,
      metadata: {
        deviceId: terminal?.deviceId ?? input.deviceId ?? null,
        module: input.module,
        ...(input.metadata ?? {}),
      },
      targetId: input.entityId ?? null,
      targetName: summary,
      targetType: input.entityType,
      terminalId: terminal?.id ?? null,
      terminalName: terminal ? `${terminal.terminalCode}${terminal.terminalName ? ` · ${terminal.terminalName}` : ""}` : null,
    },
  });
}

export function essentialActivityFromTenant(tenant: TenantContext, input: Omit<EssentialActivityInput, "companyId" | "userId" | "branchId"> & { branchId?: string | null }) {
  return {
    ...input,
    branchId: input.branchId ?? tenant.branchId ?? null,
    companyId: tenant.companyId,
    userId: tenant.userId,
  };
}
