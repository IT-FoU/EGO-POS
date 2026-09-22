import { NextResponse } from "next/server";
import { getShiftDetailForReport } from "@/features/reports/shift-table-service";
import { apiJsonFromError } from "@/lib/api/write-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const ownOnly = new URL(request.url).searchParams.get("own") === "1";
    const detail = await getShiftDetailForReport(id, ownOnly);
    if (!detail) {
      return NextResponse.json({ error: "Shift was not found.", ok: false }, { status: 404 });
    }
    return NextResponse.json({ data: detail, ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}
