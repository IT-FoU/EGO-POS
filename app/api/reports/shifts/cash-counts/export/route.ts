import { exportCashCountExcelResponse } from "@/features/reports/cash-report-service";

export async function GET(request: Request) {
  return exportCashCountExcelResponse(request);
}
