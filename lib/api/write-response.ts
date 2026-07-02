import { NextResponse } from "next/server";
import { ApiUnauthorizedError, requireApiSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess, type TenantContext } from "@/lib/db/write-context";
import { assertPermission, PermissionDeniedError, type PermissionKey } from "@/lib/auth/permissions";
import { PermissionMatrixDeniedError, type PermissionContext } from "@/features/permissions/platform-permissions";
import { requireStoreActionPermissions } from "@/lib/auth/store-permission-guard";
import type { StoreAction } from "@/features/permissions/store-permissions";
import {
  STORE_MANAGER_APPROVAL_BODY_KEY,
  auditStoreManagerPinApproval,
  requireStoreActionPermissionsOrManagerPinApproval,
  type StoreManagerPinApprovalBody,
} from "@/lib/auth/store-manager-approval";

type StoreActionResolver = StoreAction | StoreAction[] | ((body: Record<string, unknown>) => StoreAction | StoreAction[]);

type StorePermissionOptions = PermissionContext & {
  allowManagerPinApproval?: boolean;
  storeAction?: StoreActionResolver;
};

function apiStatusFromError(error: unknown): number {
  if (error instanceof ApiUnauthorizedError) {
    return 401;
  }
  if (error instanceof PermissionDeniedError || error instanceof PermissionMatrixDeniedError) {
    return 403;
  }
  return 400;
}

function apiJsonFromError(error: unknown) {
  if (error instanceof PermissionDeniedError || error instanceof PermissionMatrixDeniedError) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You do not have permission to perform this action.",
        ok: false,
      },
      { status: 403 },
    );
  }
  return NextResponse.json(writeFailure(error), { status: apiStatusFromError(error) });
}

function resolveStoreActions(storeAction: StoreActionResolver | undefined, body: Record<string, unknown>) {
  if (!storeAction) return [];
  const resolved = typeof storeAction === "function" ? storeAction(body) : storeAction;
  return Array.isArray(resolved) ? resolved : [resolved];
}

export async function runRead<T>(
  handler: (tenant: TenantContext) => Promise<T>,
  permission?: PermissionKey,
  options: StorePermissionOptions = {},
) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    const storeActions = resolveStoreActions(options.storeAction, {});
    if (storeActions.length) {
      await requireStoreActionPermissions({ actions: storeActions, context: options, session, tenant });
    }
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
  options: StorePermissionOptions = {},
) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    const body = request ? await request.json().catch(() => ({})) : {};
    const storeActions = resolveStoreActions(options.storeAction, body);
    let managerPinApproval = null;
    if (storeActions.length) {
      if (options.allowManagerPinApproval) {
        managerPinApproval = await requireStoreActionPermissionsOrManagerPinApproval({
          actions: storeActions,
          approval: body.approval as StoreManagerPinApprovalBody | undefined,
          context: options,
          session,
          tenant,
        });
        if (managerPinApproval) {
          body[STORE_MANAGER_APPROVAL_BODY_KEY] = managerPinApproval;
        }
      } else {
        await requireStoreActionPermissions({ actions: storeActions, context: options, session, tenant });
      }
    }
    if (permission) {
      await assertPermission(tenant, permission);
    }
    const data = await handler(tenant, body);
    if (managerPinApproval) {
      await auditStoreManagerPinApproval({ actions: storeActions, approval: managerPinApproval, context: options });
    }
    return NextResponse.json(writeSuccess(data));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
