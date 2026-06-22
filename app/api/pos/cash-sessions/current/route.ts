import { getOpenCashSession } from "@/features/cash-sessions/prisma-repository";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";

export async function GET() {
  return runRead((tenant) => getOpenCashSession(tenant), READ_PERMISSIONS.posCashSessionView);
}
