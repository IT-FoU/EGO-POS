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

export async function updateActiveCompanySession(
  userId: string,
  companyId: string,
  currentSession?: Session,
  updatedCompanyName?: string,
) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured.");
  }

  const session = currentSession ?? (await getCurrentSession());
  if (!session?.user?.id || session.user.id !== userId) {
    return false;
  }

  const membershipFields = await getMembershipSessionFields(userId, companyId);
  const sessionFields =
    membershipFields ??
    (updatedCompanyName && session.user.activeCompanyId === companyId
      ? {
          activeBranchId: session.user.activeBranchId,
          activeCompanyId: companyId,
          activeCompanyName: updatedCompanyName,
          activeWarehouseId: session.user.activeWarehouseId,
          allowBackOfficeAccess: session.user.allowBackOfficeAccess ?? true,
          allowPOSAccess: session.user.allowPOSAccess ?? true,
          assignedTerminal: session.user.assignedTerminal ?? "POS-01",
          businessTemplateKey: session.user.businessTemplateKey,
          roles: session.user.roles ?? [],
        }
      : null);
  if (!sessionFields) {
    return false;
  }

  const nextToken = await encode({
    secret,
    token: {
      allowBackOfficeAccess: sessionFields.allowBackOfficeAccess,
      allowPOSAccess: sessionFields.allowPOSAccess,
      activeBranchId: sessionFields.activeBranchId,
      activeCompanyId: sessionFields.activeCompanyId,
      activeCompanyName: sessionFields.activeCompanyName,
      activeWarehouseId: sessionFields.activeWarehouseId,
      assignedTerminal: sessionFields.assignedTerminal,
      businessTemplateKey: sessionFields.businessTemplateKey,
      email: session.user.email,
      name: session.user.name,
      roles: sessionFields.roles,
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
