import { exportOwnShiftHistoryExcelResponse } from "@/features/reports/shift-table-service";

export async function GET(request: Request) {
  return exportOwnShiftHistoryExcelResponse(request);
}
