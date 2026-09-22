import { createReorderPoResponse } from "@/features/reports/reorder-report-service";

export async function POST(request: Request) {
  return createReorderPoResponse(request);
}
