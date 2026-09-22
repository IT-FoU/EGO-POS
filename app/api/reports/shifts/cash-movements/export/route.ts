import { exportCashMovementExcelResponse } from "@/features/reports/cash-report-service";

export async function GET(request: Request) {
  return exportCashMovementExcelResponse(request);
}
