import { exportCategorySalesExcelResponse } from "@/features/reports/product-table-service";

export async function GET(request: Request) {
  return exportCategorySalesExcelResponse(request);
}
