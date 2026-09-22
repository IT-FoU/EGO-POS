import { NextResponse } from "next/server";
import { getCashCountDetailForReport } from "@/features/reports/cash-report-service";
import { apiJsonFromError } from "@/lib/api/write-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const detail = await getCashCountDetailForReport(id);
    if (!detail) {
      return NextResponse.json({ error: "Cash count was not found.", ok: false }, { status: 404 });
    }
    return NextResponse.json({ data: detail, ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}
