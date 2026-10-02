import { NextResponse } from "next/server";
import { AccountAccessDeniedError, requirePosAccess } from "@/lib/auth/account-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getMyOtStatus, listOwnOtApprovals } from "@/features/ot/prisma-repository";

export async function GET() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  try {
    await requirePosAccess(tenant);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    throw error;
  }
  const [status, history] = await Promise.all([getMyOtStatus(tenant), listOwnOtApprovals(tenant)]);
  return NextResponse.json({ ok: true, data: { ...status, history } });
}
