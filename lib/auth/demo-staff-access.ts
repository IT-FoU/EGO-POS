import { DemoStorageKeys } from "@/lib/demo/storage-keys";

export const DEMO_STAFF_ACCESS_STORAGE_KEY = DemoStorageKeys.staffUsers;
export const DEMO_STAFF_ACCESS_COOKIE_KEY = "ego_pos_staff_access_users";

export type DemoStaffRole = "Owner" | "Manager" | "Cashier" | "Custom";
export type DemoStaffStatus = "Active" | "Inactive";

export type DemoStaffAccessRecord = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  assignedTerminal: string;
  branch: string;
  createdAt: string;
  fullName: string;
  id: string;
  passwordHash: string;
  passwordSalt: string;
  requirePasswordChange: boolean;
  role: DemoStaffRole;
  status: DemoStaffStatus;
  updatedAt: string;
  username: string;
};

export type DemoStaffAccessDraft = Omit<
  DemoStaffAccessRecord,
  "createdAt" | "id" | "passwordHash" | "passwordSalt" | "updatedAt"
> & {
  confirmPassword: string;
  password: string;
};

export function buildEmptyDemoStaffDraft(): DemoStaffAccessDraft {
  return {
    allowBackOfficeAccess: false,
    allowPosAccess: true,
    assignedTerminal: "POS-01",
    branch: "Main Branch",
    confirmPassword: "",
    fullName: "",
    password: "",
    requirePasswordChange: true,
    role: "Cashier",
    status: "Active",
    username: "",
  };
}

export async function buildDemoStaffRecord(draft: DemoStaffAccessDraft): Promise<DemoStaffAccessRecord> {
  const now = new Date().toISOString();
  const passwordSalt = globalThis.crypto.randomUUID();
  return {
    allowBackOfficeAccess: draft.allowBackOfficeAccess,
    allowPosAccess: draft.allowPosAccess,
    assignedTerminal: draft.assignedTerminal,
    branch: draft.branch,
    createdAt: now,
    fullName: draft.fullName,
    id: `staff-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    passwordHash: await hashDemoStaffPassword(draft.password, passwordSalt),
    passwordSalt,
    requirePasswordChange: draft.requirePasswordChange,
    role: draft.role,
    status: draft.status,
    updatedAt: now,
    username: draft.username,
  };
}

export async function updateDemoStaffRecordPassword(
  existing: DemoStaffAccessRecord,
  draft: DemoStaffAccessDraft,
): Promise<DemoStaffAccessRecord> {
  const passwordSalt = globalThis.crypto.randomUUID();
  return {
    ...existing,
    allowBackOfficeAccess: draft.allowBackOfficeAccess,
    allowPosAccess: draft.allowPosAccess,
    assignedTerminal: draft.assignedTerminal,
    branch: draft.branch,
    fullName: draft.fullName,
    passwordHash: await hashDemoStaffPassword(draft.password, passwordSalt),
    passwordSalt,
    requirePasswordChange: draft.requirePasswordChange,
    role: draft.role,
    status: draft.status,
    updatedAt: new Date().toISOString(),
    username: draft.username,
  };
}

export function updateDemoStaffRecord(existing: DemoStaffAccessRecord, draft: DemoStaffAccessDraft): DemoStaffAccessRecord {
  return {
    ...existing,
    allowBackOfficeAccess: draft.allowBackOfficeAccess,
    allowPosAccess: draft.allowPosAccess,
    assignedTerminal: draft.assignedTerminal,
    branch: draft.branch,
    fullName: draft.fullName,
    requirePasswordChange: draft.requirePasswordChange,
    role: draft.role,
    status: draft.status,
    updatedAt: new Date().toISOString(),
    username: draft.username,
  };
}

export async function hashDemoStaffPassword(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyDemoStaffPassword(record: DemoStaffAccessRecord, password: string) {
  return hashDemoStaffPassword(password, record.passwordSalt).then((hash) => hash === record.passwordHash);
}

export function readDemoStaffFromCookieHeader(cookieHeader: string | null | undefined): DemoStaffAccessRecord[] {
  if (!cookieHeader) {
    return [];
  }
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${DEMO_STAFF_ACCESS_COOKIE_KEY}=`));
  if (!cookie) {
    return [];
  }
  return parseDemoStaffRecords(decodeURIComponent(cookie.slice(DEMO_STAFF_ACCESS_COOKIE_KEY.length + 1)));
}

export function parseDemoStaffRecords(value: string | null | undefined): DemoStaffAccessRecord[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isDemoStaffAccessRecord) : [];
  } catch {
    return [];
  }
}

export function writeDemoStaffCookie(records: DemoStaffAccessRecord[]) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${DEMO_STAFF_ACCESS_COOKIE_KEY}=${encodeURIComponent(JSON.stringify(records))}; path=/; max-age=31536000; SameSite=Lax`;
}

function isDemoStaffAccessRecord(value: unknown): value is DemoStaffAccessRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<DemoStaffAccessRecord>;
  return Boolean(
    record.id &&
      record.fullName &&
      record.username &&
      record.passwordHash &&
      record.passwordSalt &&
      record.role &&
      record.branch &&
      record.assignedTerminal &&
      record.status,
  );
}
