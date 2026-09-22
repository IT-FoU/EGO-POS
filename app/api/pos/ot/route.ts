import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getMyOtStatus, listOwnOtApprovals } from "@/features/ot/prisma-repository";

export async function GET() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const [status, history] = await Promise.all([getMyOtStatus(tenant), listOwnOtApprovals(tenant)]);
  return NextResponse.json({ ok: true, data: { ...status, history } });
}
