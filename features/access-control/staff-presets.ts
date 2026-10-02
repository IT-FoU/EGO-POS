import type { RolePermissionDraft } from "@/features/access-control/role-permission-v2";

export type StaffLastUsedPreset = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  roleId: string;
};

const LAST_USED_KEY = "ego-pos:staff-last-used";

export function readStaffLastUsed(): StaffLastUsedPreset | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LAST_USED_KEY) ?? "null") as StaffLastUsedPreset | null;
    if (!parsed || typeof parsed.roleId !== "string") return null;
    if (typeof parsed.allowPosAccess !== "boolean" || typeof parsed.allowBackOfficeAccess !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStaffLastUsed(preset: StaffLastUsedPreset) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_USED_KEY, JSON.stringify(preset));
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

function retainedKey(roleId: string) {
  return `ego-pos:role-v2:${roleId}`;
}
