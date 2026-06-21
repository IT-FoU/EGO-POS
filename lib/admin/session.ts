import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { isDemoMode } from "@/lib/demo-mode";

const ADMIN_COOKIE = "igo_super_admin_session";
export const DEMO_SUPER_ADMIN = {
  email: "admin@igopos.local",
  id: "demo-super-admin",
  status: "active",
  username: "igo-admin",
} as const;

export type AdminSession = {
  email: string;
  id: string;
  username: string;
};

export async function createAdminSession(admin: AdminSession) {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, admin.id, {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "lax",
    secure: process.env.NEXTAUTH_URL?.startsWith("https://") ?? false,
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const adminId = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!adminId) {
    return null;
  }

  if (isDemoMode() && adminId === DEMO_SUPER_ADMIN.id) {
    return {
      email: DEMO_SUPER_ADMIN.email,
      id: DEMO_SUPER_ADMIN.id,
      username: DEMO_SUPER_ADMIN.username,
    } satisfies AdminSession;
  }

  const admin = await prisma.superAdmin
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
  } satisfies AdminSession;
}

export async function requireAdminSession() {
  const session = await getAdminSession();

  if (!session) {
    redirect("/igo-admin/login");
  }

  return session;
}
