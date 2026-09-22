import { exportRefundVoidExcelResponse } from "@/features/reports/postsale-table-service";

export async function GET(request: Request) {
  return exportRefundVoidExcelResponse(request);
}
