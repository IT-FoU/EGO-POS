import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  cancelOtApproval,
  grantOtApproval,
  listBranchOtApprovals,
  listOtWeeklyPolicies,
  upsertOtWeeklyPolicy,
} from "@/features/ot/prisma-repository";

export async function GET(request: Request) {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  try {
    if (view === "policies") {
      const userId = url.searchParams.get("userId");
      const data = await listOtWeeklyPolicies(tenant, userId);
      return NextResponse.json({ ok: true, data });
    }
    const data = await listBranchOtApprovals(tenant);
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
      case "grant":
        return NextResponse.json({
          ok: true,
          data: await grantOtApproval(tenant, {
            businessDate: String(body.businessDate),
            endMinute: Number(body.endMinute),
            note: body.note,
            startMinute: Number(body.startMinute),
            userId: String(body.userId),
          }),
        });
      case "cancel":
        return NextResponse.json({
          ok: true,
          data: await cancelOtApproval(tenant, String(body.approvalId), body.note),
        });
      case "upsert_policy":
        return NextResponse.json({
          ok: true,
          data: await upsertOtWeeklyPolicy(tenant, {
            enabled: body.enabled !== false,
            endMinute: Number(body.endMinute),
            startMinute: Number(body.startMinute),
            userId: body.userId === undefined || body.userId === "" ? null : String(body.userId),
            weekday: Number(body.weekday),
          }),
        });
      default:
        return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "OT action failed." },
      { status: 400 },
    );
  }
}
