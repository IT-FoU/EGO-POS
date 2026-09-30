import { getOpenCashSession } from "@/features/cash-sessions/prisma-repository";
import { getOpenAttendanceSession } from "@/features/attendance/prisma-repository";
import { readRequireCashShiftBeforeSaleFromJson } from "@/features/products/unit-pricing-defaults";
import { runRead } from "@/lib/api/write-response";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

const db = prisma as any;

export async function GET() {
  return runRead(async (tenant) => {
    const [session, attendance, settings] = await Promise.all([
      getOpenCashSession(tenant),
      getOpenAttendanceSession(tenant),
      db.companySetting.findUnique({
        select: { unitPricingDefaults: true },
        where: { companyId: tenant.companyId },
      }),
    ]);
    return {
      attendanceCashSessionId: attendance?.cashSessionId ?? null,
      attendanceOpen: attendance?.status === "open",
      requireCashShiftBeforeSale: readRequireCashShiftBeforeSaleFromJson(settings?.unitPricingDefaults),
      session,
    };
  }, READ_PERMISSIONS.posCashSessionView);
}
