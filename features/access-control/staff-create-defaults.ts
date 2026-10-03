import { allowsFine, FINE, reportVisibility } from "@/features/access-control/fine-permissions";
import { isCanonicalModuleEnabled } from "@/features/access-control/module-access";

export const STAFF_CREATE_DEFAULTS_KEY = "__staffCreateDefaults";

export type StaffSetupFlags = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  branchId: string;
};

export type StaffCreateDefaults = {
  cashier: StaffSetupFlags;
  manager: StaffSetupFlags;
};

export type StaffAccessPreview = {
  backOffice: "allowed" | "blocked";
  cost: "hidden" | "visible";
  pos: "allowed" | "blocked";
  profit: "hidden" | "visible";
  refund: "allowed" | "denied";
  reports: "hidden" | "historical" | "today";
};

const SECRET_FIELDS = ["password", "passwordHash", "pin", "pinHash", "username", "fullName", "name"];

export function recommendedStaffSetup(kind: "cashier" | "manager", branches: Array<{ id: string }>): StaffSetupFlags {
  return {
    allowBackOfficeAccess: kind === "manager",
    allowPosAccess: true,
    branchId: branches[0]?.id ?? "",
  };
}

export function parseStaffCreateDefaults(current: unknown, branches: Array<{ id: string }>): StaffCreateDefaults {
  const cashierFallback = recommendedStaffSetup("cashier", branches);
  const managerFallback = recommendedStaffSetup("manager", branches);
  const record = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
  const stored = record[STAFF_CREATE_DEFAULTS_KEY];
  const bag = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  const branchIds = new Set(branches.map((branch) => branch.id));
  return {
    cashier: readFlags(bag.cashier, cashierFallback, branchIds),
    manager: readFlags(bag.manager, managerFallback, branchIds),
  };
}

export function withStaffCreateDefaults(current: unknown, defaults: StaffCreateDefaults): Record<string, unknown> {
  const base = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  return {
    ...base,
    [STAFF_CREATE_DEFAULTS_KEY]: {
      cashier: flagsOnly(defaults.cashier),
      manager: flagsOnly(defaults.manager),
    },
  };
}

export function previewStaffAccess(input: {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  permissionKeys: readonly string[];
}): StaffAccessPreview {
  const keys = input.permissionKeys;
  const reportsOpen = isCanonicalModuleEnabled("reports", keys);
  const visibility = reportVisibility(keys);
  let reports: StaffAccessPreview["reports"] = "hidden";
  if (reportsOpen && visibility.historical) reports = "historical";
  else if (reportsOpen && visibility.today) reports = "today";
  return {
    backOffice: input.allowBackOfficeAccess ? "allowed" : "blocked",
    cost: reportsOpen && visibility.cost ? "visible" : "hidden",
    pos: input.allowPosAccess ? "allowed" : "blocked",
    profit: reportsOpen && visibility.profit ? "visible" : "hidden",
    refund: input.allowPosAccess && allowsFine(keys, FINE.posRefund) ? "allowed" : "denied",
    reports,
  };
}

function readFlags(value: unknown, fallback: StaffSetupFlags, branchIds: Set<string>): StaffSetupFlags {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  if (SECRET_FIELDS.some((field) => field in record)) return fallback;
  const branchId = typeof record.branchId === "string" && branchIds.has(record.branchId) ? record.branchId : fallback.branchId;
  return {
    allowBackOfficeAccess: typeof record.allowBackOfficeAccess === "boolean" ? record.allowBackOfficeAccess : fallback.allowBackOfficeAccess,
    allowPosAccess: typeof record.allowPosAccess === "boolean" ? record.allowPosAccess : fallback.allowPosAccess,
    branchId,
  };
}

function flagsOnly(flags: StaffSetupFlags) {
  return {
    allowBackOfficeAccess: Boolean(flags.allowBackOfficeAccess),
    allowPosAccess: Boolean(flags.allowPosAccess),
    branchId: String(flags.branchId ?? ""),
  };
}
