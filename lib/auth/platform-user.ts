import { getAdminSession } from "@/lib/admin/session";
import { prisma } from "@/lib/db/prisma";

export type PlatformRole = "super_admin" | "support_admin" | "billing_admin" | "template_manager";

export type CurrentPlatformUser = {
  email: string;
  id: string;
  name: string;
  role: PlatformRole;
};

const PLATFORM_ROLES = new Set<PlatformRole>(["super_admin", "support_admin", "billing_admin", "template_manager"]);

export function normalizePlatformRole(role: string | null | undefined): PlatformRole {
  const normalized = String(role ?? "super_admin").trim().toLowerCase();
  return PLATFORM_ROLES.has(normalized as PlatformRole) ? (normalized as PlatformRole) : "super_admin";
}

export async function getCurrentPlatformUser(): Promise<CurrentPlatformUser | null> {
  const session = await getAdminSession();
  if (!session) {
    return null;
  }

  const admin = await prisma.superAdmin
    .findFirst({
      select: { email: true, id: true, role: true, status: true, username: true },
      where: { id: session.id, status: "active" },
    })
    .catch(() => null);

  if (!admin) {
    return {
      email: session.email,
      id: session.id,
      name: session.username,
      role: normalizePlatformRole(session.role),
    };
  }

  return {
    email: admin.email,
    id: admin.id,
    name: admin.username,
    role: normalizePlatformRole(admin.role),
  };
}

export async function requireCurrentPlatformUser(): Promise<CurrentPlatformUser> {
  const user = await getCurrentPlatformUser();
  if (!user) {
    throw new Error("Super admin authentication required.");
  }
  return user;
}
