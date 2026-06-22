import { NextResponse } from "next/server";
import { ApiUnauthorizedError, requireApiSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess, type TenantContext } from "@/lib/db/write-context";
import { assertPermission, PermissionDeniedError, type PermissionKey } from "@/lib/auth/permissions";

function apiStatusFromError(error: unknown): number {
  if (error instanceof ApiUnauthorizedError) {
    return 401;
  }
  if (error instanceof PermissionDeniedError) {
    return 403;
  }
  return 400;
}

function apiJsonFromError(error: unknown) {
  return NextResponse.json(writeFailure(error), { status: apiStatusFromError(error) });
}

export async function runRead<T>(
  handler: (tenant: TenantContext) => Promise<T>,
  permission?: PermissionKey,
) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    if (permission) {
      await assertPermission(tenant, permission);
    }
    return NextResponse.json({ data: await handler(tenant), ok: true });
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function runWrite<T>(
  handler: (tenant: TenantContext, body: any) => Promise<T>,
  request?: Request,
  permission?: PermissionKey,
) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    if (permission) {
      await assertPermission(tenant, permission);
    }
    const body = request ? await request.json().catch(() => ({})) : {};
    return NextResponse.json(writeSuccess(await handler(tenant, body)));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
