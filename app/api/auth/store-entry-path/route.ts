import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getStoreMembershipsForSessionIdentity,
  resolveStorePostLoginRedirect,
} from "@/lib/auth/store-membership";
import { isDemoMode } from "@/lib/demo-mode";

export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Store authentication required.", ok: false }, { status: 401 });
  }

  const resolution = await getStoreMembershipsForSessionIdentity({
    email: session.user.email,
    userId: session.user.id,
    username: session.user.username,
  });
  const memberships = resolution.memberships;
  const resolved = resolveStorePostLoginRedirect(memberships, session.user.activeCompanyId);

  return NextResponse.json({
    businessTemplateKey: resolved.businessTemplateKey,
    companyId: resolved.companyId,
    companyName: resolved.companyName,
    ok: true,
    productionSource: "database",
    reason: resolved.reason,
    resolvedUserSource: resolution.source,
    redirectTo: resolved.redirectTo,
    usesLocalStorageTemplate: isDemoMode(),
  });
}
