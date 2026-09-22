import { exportLowStockExcelResponse } from "@/features/reports/inventory-table-service";

export async function GET(request: Request) {
  return exportLowStockExcelResponse(request);
}
