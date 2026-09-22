import { exportAttendanceReportExcelResponse } from "@/features/reports/attendance-report-service";

export async function GET(request: Request) {
  return exportAttendanceReportExcelResponse(request);
}
