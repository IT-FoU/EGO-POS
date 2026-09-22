import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  approveDayOffRequest,
  cancelDayOffRequest,
  grantSpecialDayOff,
  listPendingDayOffRequests,
  rejectDayOffRequest,
  removeWeeklyDayOff,
  upsertQuotaPolicy,
  upsertWeeklyDayOff,
} from "@/features/day-off/prisma-repository";

export async function GET() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  try {
    const data = await listPendingDayOffRequests(tenant);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Forbidden" },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const body = (await request.json().catch(() => ({}))) as Record<string, any>;

  try {
    switch (String(body.action ?? "")) {
      case "approve":
        return NextResponse.json({
          ok: true,
          data: await approveDayOffRequest(tenant, String(body.requestId), body.decisionNote),
        });
      case "reject":
        return NextResponse.json({
          ok: true,
          data: await rejectDayOffRequest(tenant, String(body.requestId), body.decisionNote),
        });
      case "cancel":
        return NextResponse.json({
          ok: true,
          data: await cancelDayOffRequest(tenant, String(body.requestId), body.decisionNote),
        });
      case "grant_special":
        return NextResponse.json({
          ok: true,
          data: await grantSpecialDayOff(tenant, {
            reason: body.reason,
            requestDate: String(body.requestDate),
            userId: String(body.userId),
          }),
        });
      case "upsert_weekly":
        return NextResponse.json({
          ok: true,
          data: await upsertWeeklyDayOff(tenant, {
            userId: String(body.userId),
            weekday: Number(body.weekday),
          }),
        });
      case "remove_weekly":
        return NextResponse.json({
          ok: true,
          data: await removeWeeklyDayOff(tenant, {
            userId: String(body.userId),
            weekday: Number(body.weekday),
          }),
        });
      case "upsert_quota_policy":
        return NextResponse.json({
          ok: true,
          data: await upsertQuotaPolicy(tenant, {
            monthlyQuotaDays: Number(body.monthlyQuotaDays),
            userId: body.userId === undefined ? null : body.userId ? String(body.userId) : null,
          }),
        });
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Day Off action failed." },
      { status: 400 },
    );
  }
}
