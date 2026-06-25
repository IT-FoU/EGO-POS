import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/options";
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
      id: "demo-owner",
      locale: "lo",
      name: "EGO Store Owner",
      roles: ["Owner"],
      username: "owner",
    },
  };
}

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

/** API routes: return 401 JSON instead of redirecting unauthenticated callers. */
export async function requireApiSession() {
  const session = await getCurrentSession();
  if (!session?.user) {
    if (isDemoFallbackEnabled()) {
      return demoSession();
    }
    throw new ApiUnauthorizedError();
  }
  return session;
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    if (isDemoFallbackEnabled()) {
      return demoSession();
    }

    redirect("/login");
  }

  return session;
}
