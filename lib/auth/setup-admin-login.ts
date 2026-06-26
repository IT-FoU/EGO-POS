import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authenticateMerchantUser } from "@/lib/auth/merchant-login";
import { isPinOnlySecret, PIN_NOT_ALLOWED_MESSAGE } from "@/lib/auth/portal-credentials";
import { createSetupAdminSession, DEMO_SETUP_ADMIN } from "@/lib/setup-admin/session";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";

export const INVALID_SETUP_ADMIN_LOGIN = "Invalid EGO admin username or password.";
const DEMO_SETUP_ADMIN_PASSWORD = "SetupChangeMe123!";

export type SetupAdminLoginResult =
  | { ok: true; redirectTo: "/ego-admin" }
  | { ok: false; error: string; status: number };

export async function verifySetupAdminCredentials(
  identifier: string,
  password: string,
): Promise<SetupAdminLoginResult> {
  const normalizedIdentifier = identifier.trim();

  if (!normalizedIdentifier || !password) {
    return { error: "Username or email and password are required.", ok: false, status: 400 };
  }

  if (isPinOnlySecret(password)) {
    return { error: PIN_NOT_ALLOWED_MESSAGE, ok: false, status: 401 };
  }

  const merchantUser = await authenticateMerchantUser(normalizedIdentifier, password).catch(() => null);
  if (merchantUser) {
    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
  }

  try {
    const admin = await prisma.setupAdmin.findFirst({
      where: {
        OR: [{ email: normalizedIdentifier }, { username: normalizedIdentifier }],
      },
    });

    if (!admin) {
      return verifyDemoSetupAdmin(normalizedIdentifier, password, "admin not found");
    }

    if (admin.status !== "active") {
      return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
    }

    const isValidPassword = await compare(password, admin.passwordHash);
    if (!isValidPassword) {
      return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
    }

    return { ok: true, redirectTo: "/ego-admin" };
  } catch {
    return verifyDemoSetupAdmin(normalizedIdentifier, password, "database query failed");
  }
}

async function verifyDemoSetupAdmin(
  identifier: string,
  password: string,
  reason: string,
): Promise<SetupAdminLoginResult> {
  if (!isDemoFallbackEnabled()) {
    return {
      error: INVALID_SETUP_ADMIN_LOGIN,
      ok: false,
      status: reason === "database query failed" ? 500 : 401,
    };
  }

  const normalizedIdentifier = identifier.toLowerCase();
  const matchesIdentifier =
    normalizedIdentifier === DEMO_SETUP_ADMIN.username ||
    normalizedIdentifier === DEMO_SETUP_ADMIN.email.toLowerCase();
  const matchesPassword = password === DEMO_SETUP_ADMIN_PASSWORD;

  if (!matchesIdentifier || !matchesPassword || DEMO_SETUP_ADMIN.status !== "active") {
    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
  }

  return { ok: true, redirectTo: "/ego-admin" };
}

export async function authenticateSetupAdminLogin(
  identifier: string,
  password: string,
): Promise<SetupAdminLoginResult> {
  const verified = await verifySetupAdminCredentials(identifier, password);
  if (!verified.ok) {
    return verified;
  }

  if (isDemoFallbackEnabled()) {
    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (
      normalizedIdentifier === DEMO_SETUP_ADMIN.username ||
      normalizedIdentifier === DEMO_SETUP_ADMIN.email.toLowerCase()
    ) {
      await createSetupAdminSession({
        email: DEMO_SETUP_ADMIN.email,
        id: DEMO_SETUP_ADMIN.id,
        username: DEMO_SETUP_ADMIN.username,
      });
      return verified;
    }
  }

  const admin = await prisma.setupAdmin.findFirst({
    select: { email: true, id: true, username: true },
    where: {
      OR: [{ email: identifier.trim() }, { username: identifier.trim() }],
    },
  });

  if (!admin) {
    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
  }

  await createSetupAdminSession({
    email: admin.email,
    id: admin.id,
    username: admin.username,
  });

  return verified;
}
