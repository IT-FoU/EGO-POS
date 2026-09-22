import { NextResponse } from "next/server";
import { getAttendanceDayDetailForReport } from "@/features/reports/attendance-report-service";
import { apiJsonFromError } from "@/lib/api/write-response";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";
    const businessDate = url.searchParams.get("businessDate")?.trim() ?? "";
    if (!userId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
      return NextResponse.json({ error: "userId and businessDate are required.", ok: false }, { status: 400 });
    }
    const detail = await getAttendanceDayDetailForReport(userId, businessDate);
    return NextResponse.json({ data: detail, ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}
