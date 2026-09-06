import { cache } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { normalizeLocale } from "@/lib/i18n/locale";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";

export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "ApiUnauthorizedError";
  }
}

function demoSession(): Session {
  return {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user: {
      activeBranchId: "gobox-main-branch",
      activeCompanyId: "gobox-company",
      activeCompanyName: "GO BOX",
      activeWarehouseId: "gobox-default-warehouse",
      email: "owner@igopos.local",
      id: "demo-owner-login",
      locale: DEFAULT_LOCALE,
      name: "EGO Store Owner",
      roles: ["Owner"],
      username: "igo-admin",
    },
  };
}

async function demoSessionFromDatabase(): Promise<Session | null> {
  const { prisma } = await import("@/lib/db/prisma");
  const owner = await prisma.user.findFirst({
    include: {
      companies: {
        include: { company: true },
        where: { companyId: "gobox-company", status: "active" },
      },
    },
    where: { username: "igo-admin" },
  });
  const membership = owner?.companies[0];
  if (!owner || !membership?.company) {
    return null;
  }

  return {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    user: {
      activeBranchId: membership.branchId ?? "gobox-main-branch",
      activeCompanyId: membership.company.id,
      activeCompanyName: membership.company.name,
      activeWarehouseId: "gobox-default-warehouse",
      email: owner.email,
      id: owner.id,
      locale: normalizeLocale(owner.preferredLocale),
      name: owner.fullName,
      roles: ["Owner"],
      username: owner.username,
    },
  };
}

export const getCurrentSession = cache(async () => getServerSession(authOptions));

/** API routes: return 401 JSON instead of redirecting unauthenticated callers. */
export async function requireApiSession() {
  const session = await getCurrentSession();
  if (!session?.user) {
    if (isDemoFallbackEnabled()) {
      return (await demoSessionFromDatabase()) ?? demoSession();
    }
    throw new ApiUnauthorizedError();
  }
  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    if (isDemoFallbackEnabled()) {
      return (await demoSessionFromDatabase()) ?? demoSession();
    }

    redirect("/login");
  }

  return session;
}
