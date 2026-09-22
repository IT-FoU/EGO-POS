import { endAttendanceWork } from "@/features/attendance/prisma-repository";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) =>
      endAttendanceWork(tenant, {
        note: typeof body.note === "string" ? body.note : undefined,
      }),
    request,
    WRITE_PERMISSIONS.posCashSessionManage,
    { route: "/api/pos/attendance/end-work", storeAction: STORE_ACTIONS.SHIFT_CLOSE, targetType: "attendance" },
  );
}
