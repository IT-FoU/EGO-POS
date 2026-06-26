import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authenticateMerchantUser } from "@/lib/auth/merchant-login";
import {
  isEmailIdentifier,
  isPinOnlySecret,
  PIN_NOT_ALLOWED_MESSAGE,
} from "@/lib/auth/portal-credentials";
import { createAdminSession, DEMO_SUPER_ADMIN } from "@/lib/admin/session";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";

export const INVALID_SUPER_ADMIN_LOGIN = "Invalid super admin email or password.";
const DEMO_SUPER_ADMIN_PASSWORD = "AdminChangeMe123!";

export type SuperAdminLoginResult =
  | { ok: true; redirectTo: "/super-admin" }
  | { ok: false; error: string; status: number };

export async function verifySuperAdminCredentials(
  identifier: string,
  password: string,
): Promise<SuperAdminLoginResult> {
  const email = identifier.trim();

  if (!email || !password) {
    return { error: "Email and password are required.", ok: false, status: 400 };
  }

  if (!isEmailIdentifier(email)) {
    return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
  }

  if (isPinOnlySecret(password)) {
    return { error: PIN_NOT_ALLOWED_MESSAGE, ok: false, status: 401 };
  }

  const merchantUser = await authenticateMerchantUser(email, password).catch(() => null);
  if (merchantUser) {
    return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
  }

  try {
    const admin = await prisma.superAdmin.findFirst({
      where: { email },
    });

    if (!admin) {
      return verifyDemoSuperAdmin(email, password, "admin not found");
    }

    if (admin.status !== "active") {
      return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
    }

    const isValidPassword = await compare(password, admin.passwordHash);
    if (!isValidPassword) {
      return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
    }

    return { ok: true, redirectTo: "/super-admin" };
  } catch {
    return verifyDemoSuperAdmin(email, password, "database query failed");
  }
}

async function verifyDemoSuperAdmin(
  email: string,
  password: string,
  reason: string,
): Promise<SuperAdminLoginResult> {
  if (!isDemoFallbackEnabled()) {
    return {
      error: INVALID_SUPER_ADMIN_LOGIN,
      ok: false,
      status: reason === "database query failed" ? 500 : 401,
    };
  }

  const normalizedEmail = email.toLowerCase();
  const matchesIdentifier = normalizedEmail === DEMO_SUPER_ADMIN.email.toLowerCase();
  const matchesPassword = password === DEMO_SUPER_ADMIN_PASSWORD;

  if (!matchesIdentifier || !matchesPassword || DEMO_SUPER_ADMIN.status !== "active") {
    return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
  }

  return { ok: true, redirectTo: "/super-admin" };
}

export async function authenticateSuperAdminLogin(
  identifier: string,
  password: string,
): Promise<SuperAdminLoginResult> {
  const verified = await verifySuperAdminCredentials(identifier, password);
  if (!verified.ok) {
    return verified;
  }

  if (isDemoFallbackEnabled() && identifier.trim().toLowerCase() === DEMO_SUPER_ADMIN.email.toLowerCase()) {
    await createAdminSession({
      email: DEMO_SUPER_ADMIN.email,
      id: DEMO_SUPER_ADMIN.id,
      username: DEMO_SUPER_ADMIN.username,
    });
    return verified;
  }

  const admin = await prisma.superAdmin.findFirst({
    select: { email: true, id: true, username: true },
    where: { email: identifier.trim() },
  });

  if (!admin) {
    return { error: INVALID_SUPER_ADMIN_LOGIN, ok: false, status: 401 };
  }

  await createAdminSession({
    email: admin.email,
    id: admin.id,
    username: admin.username,
  });

  return verified;
}
