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
import { buildOwnShiftHistoryExcel, buildShiftSummaryExcel } from "@/features/reports/shift-table-excel";
import { loadOwnShiftHistoryTable, loadShiftDetail, loadShiftSummaryTable } from "@/features/reports/shift-table-repository";
import { parseShiftTableQuery } from "@/features/reports/shift-table-query";
import {
  canAccessOwnShiftReport,
  canViewBranchShiftReports,
} from "@/features/reports/own-shift-report-access";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireShiftSummaryTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canViewBranchShiftReports(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }
  return tenant;
}

async function requireOwnShiftHistoryTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canAccessOwnShiftReport(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT);
  }
  return tenant;
}

export async function getShiftTableLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getShiftSummaryPageData(searchParams?: SearchParams) {
  const tenant = await requireShiftSummaryTenant();
  const query = parseShiftTableQuery(searchParams, { datePreset: "today" });
  return loadShiftSummaryTable(tenant, query);
}

export async function getOwnShiftHistoryPageData(searchParams?: SearchParams) {
  const tenant = await requireOwnShiftHistoryTenant();
  const query = parseShiftTableQuery(searchParams, { datePreset: "this_month" });
  // Strip any attempted foreign cashier override before load.
  delete (query as { cashierId?: string }).cashierId;
  return loadOwnShiftHistoryTable(tenant, query);
}

async function loadStoreName(tenant: TenantContext) {
  const company = await (prisma as any).company.findFirst({
    select: { name: true },
    where: { id: tenant.companyId },
  });
  return String(company?.name || "EGO POS");
}

async function loadCashierLabel(tenant: TenantContext) {
  const user = await (prisma as any).user.findFirst({
    select: { fullName: true, username: true },
    where: { id: tenant.userId },
  });
  return String(user?.fullName || user?.username || tenant.userId);
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

export async function exportShiftSummaryExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewBranchShiftReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const locale = await getShiftTableLocale();
    const query = parseShiftTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadShiftSummaryTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildShiftSummaryExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportOwnShiftHistoryExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canAccessOwnShiftReport(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT);
    }
    const locale = await getShiftTableLocale();
    const query = parseShiftTableQuery(searchParamsFromRequest(request), { datePreset: "this_month" });
    delete (query as { cashierId?: string }).cashierId;
    const [data, storeName, cashierLabel] = await Promise.all([
      loadOwnShiftHistoryTable(tenant, query, undefined, { allRows: true, ownUserId: tenant.userId }),
      loadStoreName(tenant),
      loadCashierLabel(tenant),
    ]);
    return excelFileResponse(await buildOwnShiftHistoryExcel({ cashierLabel, data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function getShiftDetailForReport(shiftId: string, ownOnly: boolean) {
  const tenant = ownOnly ? await requireOwnShiftHistoryTenant() : await requireShiftSummaryTenant();
  return loadShiftDetail(tenant, shiftId, { ownOnly });
}
