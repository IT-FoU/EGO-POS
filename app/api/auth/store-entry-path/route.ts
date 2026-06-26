import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import {
  getStoreMembershipsForUser,
  resolveStorePostLoginRedirect,
} from "@/lib/auth/store-membership";
import { isDemoMode } from "@/lib/demo-mode";

export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Store authentication required.", ok: false }, { status: 401 });
  }

  const memberships = await getStoreMembershipsForUser(session.user.id);
  const resolved = resolveStorePostLoginRedirect(memberships, session.user.activeCompanyId);

  return NextResponse.json({
    businessTemplateKey: resolved.businessTemplateKey,
    companyId: resolved.companyId,
    companyName: resolved.companyName,
    ok: true,
    productionSource: "database",
    reason: resolved.reason,
    redirectTo: resolved.redirectTo,
    usesLocalStorageTemplate: isDemoMode(),
  });
}
