import { exportProductPerformanceExcelResponse } from "@/features/reports/product-table-service";

export async function GET(request: Request) {
  return exportProductPerformanceExcelResponse(request);
}
