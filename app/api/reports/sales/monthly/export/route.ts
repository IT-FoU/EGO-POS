import { exportMonthlySalesExcelResponse } from "@/features/reports/sales-table-service";

export async function GET(request: Request) {
  return exportMonthlySalesExcelResponse(request);
}
