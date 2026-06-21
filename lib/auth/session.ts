import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth/options";

export async function getCurrentSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session?.user) {
    if (process.env.IGO_DEMO_MODE === "true") {
      return {
        user: {
          id: "demo-owner",
          username: "owner",
          name: "EGO Store Owner",
          email: "owner@igopos.local",
          activeBranchId: "gobox-main-branch",
          activeWarehouseId: "gobox-default-warehouse",
          activeCompanyId: "gobox-company",
          activeCompanyName: "GO BOX",
          locale: "lo",
          roles: ["Owner"],
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      } satisfies Session;
    }

    redirect("/login");
  }

  return session;
}
