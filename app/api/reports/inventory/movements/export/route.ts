import { exportStockMovementExcelResponse } from "@/features/reports/movement-table-service";

export async function GET(request: Request) {
  return exportStockMovementExcelResponse(request);
}
