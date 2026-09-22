import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { PermissionMatrixDeniedError } from "@/features/permissions/platform-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { canViewBranchShiftReports } from "@/features/reports/own-shift-report-access";
import { buildStaffAttendanceExcel } from "@/features/reports/attendance-report-excel";
import {
  loadAttendanceDayDetail,
  loadAttendanceReportTable,
} from "@/features/reports/attendance-report-repository";
import { parseAttendanceReportTableQuery } from "@/features/reports/attendance-report-query";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireAttendanceReportTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canViewBranchShiftReports(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }
  return tenant;
}

export async function getAttendanceReportLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getAttendanceReportPageData(searchParams?: SearchParams) {
  const tenant = await requireAttendanceReportTenant();
  const query = parseAttendanceReportTableQuery(searchParams, { datePreset: "today" });
  return loadAttendanceReportTable(tenant, query);
}

async function loadStoreName(tenant: TenantContext) {
  const company = await (prisma as any).company.findFirst({
    select: { name: true },
    where: { id: tenant.companyId },
  });
  return String(company?.name || "EGO POS");
}

function searchParamsFromRequest(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}

function excelFileResponse(file: { buffer: ArrayBuffer; filename: string }) {
  return new NextResponse(file.buffer, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${file.filename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

export async function exportAttendanceReportExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewBranchShiftReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const locale = await getAttendanceReportLocale();
    const query = parseAttendanceReportTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadAttendanceReportTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildStaffAttendanceExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function getAttendanceDayDetailForReport(userId: string, businessDate: string) {
  const tenant = await requireAttendanceReportTenant();
  return loadAttendanceDayDetail(tenant, userId, businessDate);
}
