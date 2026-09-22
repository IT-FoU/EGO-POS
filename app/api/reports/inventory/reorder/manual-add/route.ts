import { addManualReorderResponse } from "@/features/reports/reorder-report-service";

export async function POST(request: Request) {
  return addManualReorderResponse(request);
}
