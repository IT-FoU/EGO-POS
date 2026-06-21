import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess } from "@/lib/db/write-context";
import { assertPermission, type PermissionKey } from "@/lib/auth/permissions";

export async function runWrite<T>(
  handler: (tenant: ReturnType<typeof tenantFromSession>, body: any) => Promise<T>,
  request?: Request,
  permission?: PermissionKey,
) {
  try {
    const session = await requireSession();
    const tenant = tenantFromSession(session);
    if (permission) {
      await assertPermission(tenant, permission);
    }
    const body = request ? await request.json().catch(() => ({})) : {};
    return NextResponse.json(writeSuccess(await handler(tenant, body)));
  } catch (error) {
    return NextResponse.json(writeFailure(error), { status: 400 });
  }
}
