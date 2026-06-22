import { getPrismaReportsSnapshot } from "@/features/reports/prisma-repository";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getPrismaReportsSnapshot(tenant), READ_PERMISSIONS.reportsView);
}
