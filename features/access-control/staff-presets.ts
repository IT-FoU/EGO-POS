import type { RolePermissionDraft } from "@/features/access-control/role-permission-v2";

export type StaffLastUsedPreset = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  branchId: string;
  companyId: string;
  roleId: string;
};

const LAST_USED_PREFIX = "ego-pos:staff-last-used:";
const SECRET_FIELDS = ["password", "passwordHash", "pin", "pinHash"];

export function readStaffLastUsed(companyId: string): StaffLastUsedPreset | null {
  if (typeof window === "undefined" || !companyId) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(lastUsedKey(companyId)) ?? "null") as unknown;
    return sanitizeLastUsed(parsed, companyId);
  } catch {
    return null;
  }
}

export function writeStaffLastUsed(preset: StaffLastUsedPreset) {
  if (typeof window === "undefined" || !preset.companyId) return;
  const safe = sanitizeLastUsed(preset, preset.companyId);
  if (!safe) return;
  window.localStorage.setItem(lastUsedKey(preset.companyId), JSON.stringify(safe));
}

export function readRetainedRoleDraft(roleId: string): RolePermissionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(retainedKey(roleId)) ?? "null") as RolePermissionDraft | null;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRetainedRoleDraft(roleId: string, draft: RolePermissionDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(retainedKey(roleId), JSON.stringify(draft));
}

export function sanitizeLastUsed(value: unknown, companyId: string): StaffLastUsedPreset | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (SECRET_FIELDS.some((field) => field in record)) return null;
  if (record.companyId !== companyId) return null;
  if (typeof record.roleId !== "string" || !record.roleId) return null;
  if (typeof record.allowPosAccess !== "boolean" || typeof record.allowBackOfficeAccess !== "boolean") return null;
  return {
    allowBackOfficeAccess: record.allowBackOfficeAccess,
    allowPosAccess: record.allowPosAccess,
    branchId: typeof record.branchId === "string" ? record.branchId : "",
    companyId,
    roleId: record.roleId,
  };
}

function lastUsedKey(companyId: string) {
  return `${LAST_USED_PREFIX}${companyId}`;
}

function retainedKey(roleId: string) {
  return `ego-pos:role-v2:${roleId}`;
}
