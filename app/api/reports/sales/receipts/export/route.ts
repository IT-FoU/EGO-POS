import { exportReceiptSalesExcelResponse } from "@/features/reports/postsale-table-service";

export async function GET(request: Request) {
  return exportReceiptSalesExcelResponse(request);
}
