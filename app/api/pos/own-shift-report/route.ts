import { NextResponse } from "next/server";

import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { getOwnShiftReport } from "@/features/reports/own-shift-report-service";
import { runRead } from "@/lib/api/write-response";

const forbiddenOverrideParams = ["businessId", "companyId", "cashierId", "userId", "actorId"];

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const attemptedOverride = forbiddenOverrideParams.find((key) => searchParams.has(key));
  if (attemptedOverride) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You do not have permission to perform this action.",
        ok: false,
      },
      { status: 403 },
    );
  }

  const shiftId = searchParams.get("shiftId")?.trim() || undefined;
  return runRead(
    (tenant) => getOwnShiftReport(tenant, { shiftId }),
    undefined,
    {
      route: "/api/pos/own-shift-report",
      storeAction: STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT,
      targetType: "own_shift_report",
    },
  );
}
