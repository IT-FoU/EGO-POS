import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { PermissionMatrixDeniedError } from "@/features/permissions/platform-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { tenantFromSession, writeFailure, writeSuccess, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { parseReorderTableQuery } from "@/features/reports/reorder-report-query";
import {
  addManualReorderItem,
  createReorderPurchaseOrders,
  loadReorderExportData,
  loadReorderPage,
  removeManualReorderItem,
  type CreateReorderPoLine,
} from "@/features/reports/reorder-report-repository";
import { buildReorderExcel } from "@/features/reports/reorder-report-excel";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireReorderViewTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canViewFullStoreReports(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }
  return { session, tenant };
}

export async function getReorderReportLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getReorderPageData(searchParams?: SearchParams) {
  const { tenant } = await requireReorderViewTenant();
  const query = parseReorderTableQuery(searchParams, { tab: "need" });
  return loadReorderPage(tenant, query);
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

export async function exportReorderExcelResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewFullStoreReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const locale = await getReorderReportLocale();
    const query = parseReorderTableQuery(searchParamsFromRequest(request), { tab: "need" });
    const [data, storeName] = await Promise.all([loadReorderExportData(tenant, query), loadStoreName(tenant)]);
    return excelFileResponse(await buildReorderExcel({ data, locale, storeName, tab: query.tab }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function addManualReorderResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewFullStoreReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const body = (await request.json()) as { note?: string; productId?: string; warehouseId?: string };
    if (!body.productId || !body.warehouseId) {
      throw new Error("productId and warehouseId are required.");
    }
    const result = await addManualReorderItem(
      tenant,
      { note: body.note, productId: body.productId, warehouseId: body.warehouseId },
      session.user.id,
    );
    return NextResponse.json(writeSuccess(result));
  } catch (error) {
    return NextResponse.json(writeFailure(error), { status: 400 });
  }
}

export async function removeManualReorderResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, READ_PERMISSIONS.reportsView);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (!canViewFullStoreReports(role)) {
      throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
    }
    const body = (await request.json()) as { productId?: string; warehouseId?: string };
    if (!body.productId || !body.warehouseId) {
      throw new Error("productId and warehouseId are required.");
    }
    const result = await removeManualReorderItem(tenant, {
      productId: body.productId,
      warehouseId: body.warehouseId,
    });
    return NextResponse.json(writeSuccess(result));
  } catch (error) {
    return NextResponse.json(writeFailure(error), { status: 400 });
  }
}

export async function createReorderPoResponse(request: Request) {
  try {
    const session = await requireApiSession();
    const tenant = tenantFromSession(session);
    await assertPermission(tenant, WRITE_PERMISSIONS.purchasingCreate);
    const body = (await request.json()) as { lines?: CreateReorderPoLine[] };
    const result = await createReorderPurchaseOrders(tenant, Array.isArray(body.lines) ? body.lines : []);
    return NextResponse.json(writeSuccess(result));
  } catch (error) {
    return NextResponse.json(writeFailure(error), { status: 400 });
  }
}
