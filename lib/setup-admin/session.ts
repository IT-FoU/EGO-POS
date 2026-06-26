import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { isDemoMode } from "@/lib/demo-mode";

const SETUP_ADMIN_COOKIE = "ego_setup_admin_session";

export const DEMO_SETUP_ADMIN = {
  email: "setup@igopos.local",
  id: "demo-setup-admin",
  status: "active",
  username: "ego-setup",
} as const;

export type SetupAdminSession = {
  email: string;
  id: string;
  username: string;
};

export async function createSetupAdminSession(admin: SetupAdminSession) {
  const cookieStore = await cookies();
  cookieStore.set(SETUP_ADMIN_COOKIE, admin.id, {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "lax",
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });
}

export async function clearSetupAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SETUP_ADMIN_COOKIE);
}

export async function getSetupAdminSession() {
  const cookieStore = await cookies();
  const adminId = cookieStore.get(SETUP_ADMIN_COOKIE)?.value;

  if (!adminId) {
    return null;
  }

  if (isDemoMode() && adminId === DEMO_SETUP_ADMIN.id) {
    return {
      email: DEMO_SETUP_ADMIN.email,
      id: DEMO_SETUP_ADMIN.id,
      username: DEMO_SETUP_ADMIN.username,
    } satisfies SetupAdminSession;
  }

  const admin = await prisma.setupAdmin
    .findFirst({
      select: { email: true, id: true, status: true, username: true },
      where: { id: adminId, status: "active" },
    })
    .catch(() => null);

  if (!admin) {
    return null;
  }

  return {
    email: admin.email,
    id: admin.id,
    username: admin.username,
  } satisfies SetupAdminSession;
}

export async function requireSetupAdminSession() {
  const session = await getSetupAdminSession();

  if (!session) {
    redirect("/ego-admin/login");
  }

  return session;
}
