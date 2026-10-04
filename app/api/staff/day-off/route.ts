import { NextResponse } from "next/server";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  approveDayOffRequest,
  cancelDayOffRequest,
  getDayOffSettingsSnapshot,
  grantSpecialDayOff,
  listPendingDayOffRequests,
  rejectDayOffRequest,
  removeWeeklyDayOff,
  upsertQuotaPolicy,
  upsertWeeklyDayOff,
} from "@/features/day-off/prisma-repository";

function employeeId(value: unknown) {
  if (value === undefined || value === null || value === "" || value === "null" || value === "undefined") {
    throw new Error("Select an employee first.");
  }
  return String(value);
}

function nullableEmployeeId(value: unknown) {
  if (value === undefined || value === null || value === "" || value === "null" || value === "undefined") return null;
  return String(value);
}

export async function GET(request: Request) {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  try {
    await requireModuleAccess(tenant, "staff");
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    throw error;
  }
  try {
    const view = new URL(request.url).searchParams.get("view");
    if (view === "settings") {
      const rawUserId = new URL(request.url).searchParams.get("userId");
      const data = await getDayOffSettingsSnapshot(tenant, nullableEmployeeId(rawUserId));
      return NextResponse.json({ ok: true, data });
    }
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
  try {
    await requireModuleAccess(tenant, "staff");
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    throw error;
  }
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
            userId: employeeId(body.userId),
          }),
        });
      case "upsert_weekly":
        return NextResponse.json({
          ok: true,
          data: await upsertWeeklyDayOff(tenant, {
            userId: employeeId(body.userId),
            weekday: Number(body.weekday),
          }),
        });
      case "remove_weekly":
        return NextResponse.json({
          ok: true,
          data: await removeWeeklyDayOff(tenant, {
            userId: employeeId(body.userId),
            weekday: Number(body.weekday),
          }),
        });
      case "upsert_quota_policy":
        return NextResponse.json({
          ok: true,
          data: await upsertQuotaPolicy(tenant, {
            monthlyQuotaDays: Number(body.monthlyQuotaDays),
            userId: nullableEmployeeId(body.userId),
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
