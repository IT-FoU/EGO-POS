import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { authenticateMerchantUser } from "@/lib/auth/merchant-login";
import { isPinOnlySecret, PIN_NOT_ALLOWED_MESSAGE } from "@/lib/auth/portal-credentials";
import { createSetupAdminSession, DEMO_SETUP_ADMIN } from "@/lib/setup-admin/session";
import {
  isSetupAdminTableReady,
  SETUP_ADMIN_MIGRATION_GUIDANCE,
} from "@/lib/setup-admin/migration-status";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";

export const INVALID_SETUP_ADMIN_LOGIN = "Invalid EGO admin username or password.";
const DEMO_SETUP_ADMIN_PASSWORD = "SetupChangeMe123!";

export type SetupAdminLoginResult =
  | { ok: true; redirectTo: "/ego-admin" }
  | { ok: false; error: string; status: number };

function isSeededSetupAdminAttempt(identifier: string, password: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const matchesIdentifier =
    normalizedIdentifier === DEMO_SETUP_ADMIN.username.toLowerCase() ||
    normalizedIdentifier === DEMO_SETUP_ADMIN.email.toLowerCase();

  return matchesIdentifier && password === DEMO_SETUP_ADMIN_PASSWORD;
}

async function migrationUnavailableResult(): Promise<SetupAdminLoginResult | null> {
  const ready = await isSetupAdminTableReady();
  if (!ready) {
    return {
      error: SETUP_ADMIN_MIGRATION_GUIDANCE,
      ok: false,
      status: 503,
    };
  }
  return null;
}

async function rejectIfSuperAdminCredentialsWithoutSetupAdmin(
  identifier: string,
  password: string,
): Promise<SetupAdminLoginResult | null> {
  try {
    const superAdmin = await prisma.superAdmin.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!superAdmin || superAdmin.status !== "active") {
      return null;
    }

    const superPasswordValid = await compare(password, superAdmin.passwordHash);
    if (!superPasswordValid) {
      return null;
    }

    const setupAdmin = await prisma.setupAdmin.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!setupAdmin || setupAdmin.status !== "active") {
      return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
    }

    const setupPasswordValid = await compare(password, setupAdmin.passwordHash);
    if (!setupPasswordValid) {
      return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
    }

    return null;
  } catch {
    return null;
  }
}

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

  const tableReady = await isSetupAdminTableReady();
  if (!tableReady) {
    if (isSeededSetupAdminAttempt(normalizedIdentifier, password)) {
      return {
        error: SETUP_ADMIN_MIGRATION_GUIDANCE,
        ok: false,
        status: 503,
      };
    }

    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
  }

  const merchantUser = await authenticateMerchantUser(normalizedIdentifier, password).catch(() => null);
  if (merchantUser) {
    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 401 };
  }

  const superAdminBlocked = await rejectIfSuperAdminCredentialsWithoutSetupAdmin(
    normalizedIdentifier,
    password,
  );
  if (superAdminBlocked) {
    return superAdminBlocked;
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
    const migrationBlockedAfterError = await migrationUnavailableResult();
    if (migrationBlockedAfterError) {
      return migrationBlockedAfterError;
    }

    return verifyDemoSetupAdmin(normalizedIdentifier, password, "database query failed");
  }
}

async function verifyDemoSetupAdmin(
  identifier: string,
  password: string,
  reason: string,
): Promise<SetupAdminLoginResult> {
  if (!isDemoFallbackEnabled()) {
    if (reason === "database query failed") {
      const migrationBlocked = await migrationUnavailableResult();
      if (migrationBlocked) {
        return migrationBlocked;
      }
    }

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

  try {
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
  } catch {
    const migrationBlocked = await migrationUnavailableResult();
    if (migrationBlocked) {
      return migrationBlocked;
    }

    return { error: INVALID_SETUP_ADMIN_LOGIN, ok: false, status: 500 };
  }
}
