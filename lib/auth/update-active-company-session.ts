import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";
import type { Session } from "next-auth";
import { getCurrentSession } from "@/lib/auth/session";
import { getMembershipSessionFields } from "@/lib/auth/store-membership";

function sessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export async function updateActiveCompanySession(userId: string, companyId: string, currentSession?: Session) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured.");
  }

  const session = currentSession ?? (await getCurrentSession());
  if (!session?.user?.id || session.user.id !== userId) {
    return false;
  }

  const membershipFields = await getMembershipSessionFields(userId, companyId);
  if (!membershipFields) {
    return false;
  }

  const nextToken = await encode({
    secret,
    token: {
      allowBackOfficeAccess: membershipFields.allowBackOfficeAccess,
      allowPOSAccess: membershipFields.allowPOSAccess,
      activeBranchId: membershipFields.activeBranchId,
      activeCompanyId: membershipFields.activeCompanyId,
      activeCompanyName: membershipFields.activeCompanyName,
      activeWarehouseId: membershipFields.activeWarehouseId,
      assignedTerminal: membershipFields.assignedTerminal,
      businessTemplateKey: membershipFields.businessTemplateKey,
      email: session.user.email,
      name: session.user.name,
      roles: membershipFields.roles,
      sub: session.user.id,
      username: session.user.username,
      locale: session.user.locale,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), nextToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return true;
}
