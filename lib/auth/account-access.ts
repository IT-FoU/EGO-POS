import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const DEMO_LOGIN_USER_IDS: Record<string, string> = {
  "demo-cashier-login": "cashier",
  "demo-manager-login": "manager",
  "demo-owner": "igo-admin",
  "demo-owner-login": "igo-admin",
};

const db = prisma as any;

export class AccountAccessDeniedError extends Error {
  constructor() {
    super("You do not have permission to perform this action.");
    this.name = "AccountAccessDeniedError";
  }
}

export type AccountAccess = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  isOwner: boolean;
  membershipStatus: string;
  userId: string;
  userStatus: string;
};

export type AccountGate = "back-office" | "pos";

const POS_PERMISSION_KEYS = new Set([
  "pos.approve",
  "pos.cash_session.manage",
  "pos.cash_session.view",
  "pos.create",
  "pos.delete",
  "pos.edit",
  "pos.print",
  "pos.sell",
  "pos.view",
]);

const BACK_OFFICE_API_PREFIXES = [
  "/api/approvals",
  "/api/customers",
  "/api/inventory",
  "/api/membership-levels",
  "/api/products",
  "/api/promotions",
  "/api/purchasing",
  "/api/reports",
  "/api/settings",
  "/api/staff",
  "/api/store/",
  "/api/suppliers",
];

export function isProtectedOwnerRole(role: { name?: string | null; templateKey?: string | null } | null | undefined) {
  const templateKey = String(role?.templateKey ?? "").trim().toLowerCase();
  const name = String(role?.name ?? "").trim().toLowerCase();
  return templateKey === "owner" || name === "owner";
}

/** UI may say inactive. The database enum stores disabled. */
export function staffStatusForStorage(status: string | null | undefined): "active" | "disabled" {
  return String(status ?? "active").trim().toLowerCase() === "active" ? "active" : "disabled";
}

export function staffStatusForDisplay(status: string | null | undefined): "active" | "inactive" {
  return String(status ?? "active").trim().toLowerCase() === "active" ? "active" : "inactive";
}

export function accountGateForPermission(permission: string | null | undefined): AccountGate | null {
  const key = String(permission ?? "").trim();
  if (!key) return null;
  return POS_PERMISSION_KEYS.has(key) ? "pos" : "back-office";
}

export function accountGateForApiPath(pathname: string | null | undefined): AccountGate | null {
  const path = String(pathname ?? "");
  if (path === "/api/pos" || path.startsWith("/api/pos/")) return "pos";
  if (BACK_OFFICE_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix))) {
    return "back-office";
  }
  return null;
}

async function effectiveUserId(tenant: TenantContext, client: any) {
  const direct = await client.companyUser.findFirst({
    select: { userId: true },
    where: { companyId: tenant.companyId, userId: tenant.userId },
  });
  if (direct) return tenant.userId;

  const demoUsername = DEMO_LOGIN_USER_IDS[tenant.userId];
  if (!demoUsername) return tenant.userId;
  const user = await client.user.findFirst({
    select: { id: true },
    where: { username: demoUsername },
  });
  return user?.id ? String(user.id) : tenant.userId;
}

async function readAccountAccessUncached(tenant: TenantContext, client: any = db): Promise<AccountAccess | null> {
  const userId = await effectiveUserId(tenant, client);
  const row = await client.companyUser.findFirst({
    select: {
      allowBackOfficeAccess: true,
      allowPosAccess: true,
      isOwner: true,
      status: true,
      user: { select: { status: true } },
      userId: true,
    },
    where: { companyId: tenant.companyId, userId },
  });
  if (!row) return null;
  return {
    allowBackOfficeAccess: row.allowBackOfficeAccess !== false,
    allowPosAccess: row.allowPosAccess !== false,
    isOwner: Boolean(row.isOwner),
    membershipStatus: String(row.status ?? ""),
    userId: String(row.userId),
    userStatus: String(row.user?.status ?? ""),
  };
}

const readAccountAccessCached = cache(async (companyId: string, userId: string) =>
  readAccountAccessUncached({ companyId, userId }, db),
);

export async function readAccountAccess(tenant: TenantContext, client: any = db) {
  if (client === db) return readAccountAccessCached(tenant.companyId, tenant.userId);
  return readAccountAccessUncached(tenant, client);
}

export async function requireActiveMembership(tenant: TenantContext, client: any = db) {
  const access = await readAccountAccess(tenant, client);
  if (!access || access.membershipStatus !== "active" || access.userStatus !== "active") {
    throw new AccountAccessDeniedError();
  }
  return access;
}

export async function requirePosAccess(tenant: TenantContext, client: any = db) {
  const access = await requireActiveMembership(tenant, client);
  if (!access.allowPosAccess) throw new AccountAccessDeniedError();
  return access;
}

export async function requireBackOfficeAccess(tenant: TenantContext, client: any = db) {
  const access = await requireActiveMembership(tenant, client);
  if (!access.allowBackOfficeAccess) throw new AccountAccessDeniedError();
  return access;
}

export async function requireAccountGate(tenant: TenantContext, gate: AccountGate | null, client: any = db) {
  if (gate === "pos") return requirePosAccess(tenant, client);
  if (gate === "back-office") return requireBackOfficeAccess(tenant, client);
  return requireActiveMembership(tenant, client);
}
