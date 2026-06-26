import { cookies } from "next/headers";
import { getToken } from "next-auth/jwt";
import { encode } from "next-auth/jwt";
import { getMembershipSessionFields } from "@/lib/auth/store-membership";

function sessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export async function updateActiveCompanySession(userId: string, companyId: string) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not configured.");
  }

  const cookieStore = await cookies();
  const token = await getToken({
    req: {
      headers: {
        cookie: cookieStore.toString(),
      },
    } as never,
    secret,
  });

  if (!token?.sub || token.sub !== userId) {
    return false;
  }

  const membershipFields = await getMembershipSessionFields(userId, companyId);
  if (!membershipFields) {
    return false;
  }

  const nextToken = await encode({
    secret,
    token: {
      ...token,
      activeBranchId: membershipFields.activeBranchId,
      activeCompanyId: membershipFields.activeCompanyId,
      activeCompanyName: membershipFields.activeCompanyName,
      activeWarehouseId: membershipFields.activeWarehouseId,
      allowBackOfficeAccess: membershipFields.allowBackOfficeAccess,
      allowPOSAccess: membershipFields.allowPOSAccess,
      assignedTerminal: membershipFields.assignedTerminal,
      businessTemplateKey: membershipFields.businessTemplateKey,
      roles: membershipFields.roles,
    },
  });

  cookieStore.set(sessionCookieName(), nextToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return true;
}
