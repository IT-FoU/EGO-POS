import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { createAdminSession, DEMO_SUPER_ADMIN } from "@/lib/admin/session";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";

const INVALID_ADMIN_LOGIN = "Invalid admin username or password.";
const DEMO_SUPER_ADMIN_PASSWORD = "AdminChangeMe123!";

function logAdminLoginDebug(reason: string, error?: unknown) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn("[igo-admin-login]", reason, error instanceof Error ? error.message : "");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; identifier?: unknown; password?: unknown; username?: unknown }
    | null;
  const identifier =
    typeof body?.identifier === "string"
      ? body.identifier.trim()
      : typeof body?.username === "string"
        ? body.username.trim()
        : typeof body?.email === "string"
          ? body.email.trim()
          : "";
  const password = typeof body?.password === "string" ? body.password : "";

  logAdminLoginDebug("request body received");

  if (!identifier || !password) {
    return Response.json({ error: "Username and password are required.", ok: false }, { status: 400 });
  }

  try {
    const admin = await prisma.superAdmin.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!admin) {
      logAdminLoginDebug("admin not found");
      return loginWithDemoFallback(identifier, password, "admin not found");
    }

    logAdminLoginDebug(`admin found status=${admin.status}`);

    if (admin.status !== "active") {
      logAdminLoginDebug("inactive admin");
      return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: 401 });
    }

    const isValidPassword = await compare(password, admin.passwordHash);
    logAdminLoginDebug(`bcrypt compare result=${isValidPassword}`);
    if (!isValidPassword) {
      logAdminLoginDebug("bcrypt compare failed");
      return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: 401 });
    }

    try {
      await createAdminSession({
        email: admin.email,
        id: admin.id,
        username: admin.username,
      });
      logAdminLoginDebug("session cookie created");
    } catch (error) {
      logAdminLoginDebug("session create failed", error);
      return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: 500 });
    }

    return Response.json({ ok: true, redirectTo: "/igo-admin" });
  } catch (error) {
    logAdminLoginDebug("admin login query failed", error);
    return loginWithDemoFallback(identifier, password, "database query failed");
  }
}

async function loginWithDemoFallback(identifier: string, password: string, reason: string) {
  if (!isDemoFallbackEnabled()) {
    return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: reason === "database query failed" ? 500 : 401 });
  }

  const normalizedIdentifier = identifier.toLowerCase();
  const matchesIdentifier =
    normalizedIdentifier === DEMO_SUPER_ADMIN.username ||
    normalizedIdentifier === DEMO_SUPER_ADMIN.email.toLowerCase();
  const matchesPassword = password === DEMO_SUPER_ADMIN_PASSWORD;

  logAdminLoginDebug(
    `demo fallback reason=${reason} adminFound=${matchesIdentifier} status=${DEMO_SUPER_ADMIN.status} bcryptCompare=${matchesPassword}`,
  );

  if (!matchesIdentifier || !matchesPassword || DEMO_SUPER_ADMIN.status !== "active") {
    return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: 401 });
  }

  try {
    await createAdminSession({
      email: DEMO_SUPER_ADMIN.email,
      id: DEMO_SUPER_ADMIN.id,
      username: DEMO_SUPER_ADMIN.username,
    });
    logAdminLoginDebug("session cookie created");
  } catch (error) {
    logAdminLoginDebug("session create failed", error);
    return Response.json({ error: INVALID_ADMIN_LOGIN, ok: false }, { status: 500 });
  }

  return Response.json({ ok: true, redirectTo: "/igo-admin" });
}
