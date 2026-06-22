import { getPrismaReportsSnapshot } from "@/features/reports/prisma-repository";
import { parseReportFilters } from "@/features/reports/report-filters";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET(request: Request) {
  const filters = parseReportFilters(new URL(request.url).searchParams);
  return runRead((tenant) => getPrismaReportsSnapshot(tenant, filters), READ_PERMISSIONS.reportsView);
}
