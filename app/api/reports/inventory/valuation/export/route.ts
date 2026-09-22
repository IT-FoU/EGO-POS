import { exportStockValuationExcelResponse } from "@/features/reports/movement-table-service";

export async function GET(request: Request) {
  return exportStockValuationExcelResponse(request);
}
