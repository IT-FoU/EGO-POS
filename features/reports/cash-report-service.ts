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
import { buildCashMovementExcel, buildCashShiftCountExcel } from "@/features/reports/cash-report-excel";
import {
  loadCashCountDetail,
  loadCashCountTable,
  loadCashMovementDetail,
  loadCashMovementTable,
} from "@/features/reports/cash-report-repository";
import { parseCashCountTableQuery, parseCashMovementTableQuery } from "@/features/reports/cash-report-query";
import { canViewBranchShiftReports } from "@/features/reports/own-shift-report-access";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireCashReportTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canViewBranchShiftReports(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }
  return tenant;
}

export async function getCashReportLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getCashCountPageData(searchParams?: SearchParams) {
  const tenant = await requireCashReportTenant();
  const query = parseCashCountTableQuery(searchParams, { datePreset: "today" });
  return loadCashCountTable(tenant, query);
}

export async function getCashMovementPageData(searchParams?: SearchParams) {
  const tenant = await requireCashReportTenant();
  const query = parseCashMovementTableQuery(searchParams, { datePreset: "today" });
  return loadCashMovementTable(tenant, query);
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

export async function exportCashCountExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewBranchShiftReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const locale = await getCashReportLocale();
    const query = parseCashCountTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadCashCountTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildCashShiftCountExcel({ data, locale, storeName, tenant }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportCashMovementExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewBranchShiftReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const locale = await getCashReportLocale();
    const query = parseCashMovementTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadCashMovementTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildCashMovementExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function getCashCountDetailForReport(sessionId: string) {
  const tenant = await requireCashReportTenant();
  return loadCashCountDetail(tenant, sessionId);
}

export async function getCashMovementDetailForReport(movementId: string) {
  const tenant = await requireCashReportTenant();
  return loadCashMovementDetail(tenant, movementId);
}
