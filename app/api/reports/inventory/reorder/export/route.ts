import { exportReorderExcelResponse } from "@/features/reports/reorder-report-service";

export async function GET(request: Request) {
  return exportReorderExcelResponse(request);
}
