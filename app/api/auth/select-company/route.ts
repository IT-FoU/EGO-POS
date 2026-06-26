import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveStorePostLoginRedirectForUser } from "@/lib/auth/store-membership";
import { updateActiveCompanySession } from "@/lib/auth/update-active-company-session";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Store authentication required.", ok: false }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { companyId?: unknown } | null;
  const companyId = typeof body?.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) {
    return NextResponse.json({ error: "Company id is required.", ok: false }, { status: 400 });
  }

  const updated = await updateActiveCompanySession(session.user.id, companyId);
  if (!updated) {
    return NextResponse.json({ error: "Company assignment was not found.", ok: false }, { status: 403 });
  }

  const resolved = await resolveStorePostLoginRedirectForUser(session.user.id, companyId);
  return NextResponse.json({
    businessTemplateKey: resolved.businessTemplateKey,
    companyId: resolved.companyId,
    ok: true,
    redirectTo: resolved.redirectTo,
  });
}
