import { NextResponse } from "next/server";

import { PermissionMatrixDeniedError } from "@/features/permissions/platform-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import {
  canAccessOwnShiftReport,
} from "@/features/reports/own-shift-report-access";
import {
  getOwnShiftCapabilities,
  getOwnShiftReport,
  listBranchShiftSessions,
} from "@/features/reports/own-shift-report-service";
import { requireApiSession, ApiUnauthorizedError } from "@/lib/auth/session";
import { currentStoreUserFromSession } from "@/lib/auth/store-permission-guard";
import { auditStoreAccessDenied } from "@/features/permissions/denied-audit";
import { tenantFromSession } from "@/lib/db/write-context";

const forbiddenOverrideParams = ["businessId", "companyId", "cashierId", "userId", "actorId"];

function apiJsonFromError(error: unknown) {
  if (error instanceof ApiUnauthorizedError) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Authentication required.", ok: false },
      { status: 401 },
    );
  }
  if (error instanceof PermissionMatrixDeniedError) {
    return NextResponse.json(
      {
        error: "Forbidden",
        message: "You do not have permission to perform this action.",
        ok: false,
      },
      { status: 403 },
    );
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message, ok: false }, { status: 400 });
}

/**
 * GET /api/pos/own-shift-report
 * Query:
 *   mode=my|branch (default my)
 *   shiftId=<id> for session detail (MY SHIFT or BRANCH SHIFTS detail)
 *
 * Permissions: reports.view_own_shift OR reports.view_full
 * Branch list / other-cashier detail: reports.view_full only
 */
export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const attemptedOverride = forbiddenOverrideParams.find((key) => searchParams.has(key));
    if (attemptedOverride) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have permission to perform this action.",
          ok: false,
        },
        { status: 403 },
      );
    }

    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    const currentStoreUser = currentStoreUserFromSession(session, tenant);

    if (!canAccessOwnShiftReport(currentStoreUser.role)) {
      await auditStoreAccessDenied(currentStoreUser, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT, {
        businessId: tenant.companyId,
        route: "/api/pos/own-shift-report",
        targetType: "own_shift_report",
      });
      throw new PermissionMatrixDeniedError(currentStoreUser.role, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT);
    }

    const mode = (searchParams.get("mode")?.trim().toLowerCase() || "my") as "my" | "branch";
    const shiftId = searchParams.get("shiftId")?.trim() || undefined;
    const capabilities = await getOwnShiftCapabilities(tenant);

    if (mode === "branch" && !shiftId) {
      const listed = await listBranchShiftSessions(tenant);
      return NextResponse.json({
        data: {
          capabilities: listed.capabilities,
          mode: "branch" as const,
          report: null,
          sessions: listed.sessions,
        },
        ok: true,
      });
    }

    const report = await getOwnShiftReport(tenant, { shiftId });
    return NextResponse.json({
      data: {
        capabilities,
        mode: shiftId ? ("detail" as const) : ("my" as const),
        report,
        sessions: null,
      },
      ok: true,
    });
  } catch (error) {
    return apiJsonFromError(error);
  }
}
