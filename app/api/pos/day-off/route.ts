import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  cancelDayOffRequest,
  createEmployeeQuotaRequest,
  getQuotaSummaryReadOnly,
  listOwnDayOffRequests,
  listWeeklyDayOffs,
} from "@/features/day-off/prisma-repository";

export async function GET() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const [quota, requests, weekly] = await Promise.all([
    getQuotaSummaryReadOnly(tenant, tenant.userId),
    listOwnDayOffRequests(tenant),
    listWeeklyDayOffs(tenant, tenant.userId),
  ]);
  return NextResponse.json({ ok: true, data: { quota, requests, weeklyWeekdays: weekly } });
}

export async function POST(request: Request) {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    reason?: string;
    requestDate?: string;
    requestId?: string;
    decisionNote?: string;
  };

  try {
    if (body.action === "cancel") {
      if (!body.requestId) return NextResponse.json({ ok: false, error: "requestId required" }, { status: 400 });
      const data = await cancelDayOffRequest(tenant, body.requestId, body.decisionNote);
      return NextResponse.json({ ok: true, data });
    }

    if (!body.requestDate) {
      return NextResponse.json({ ok: false, error: "requestDate required (YYYY-MM-DD)" }, { status: 400 });
    }
    const data = await createEmployeeQuotaRequest(tenant, {
      reason: body.reason,
      requestDate: body.requestDate,
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Day Off request failed." },
      { status: 400 },
    );
  }
}
