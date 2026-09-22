import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { buildLowStockExcel, buildStockOnHandExcel } from "@/features/reports/inventory-table-excel";
import { loadLowStockTable, loadStockOnHandTable } from "@/features/reports/inventory-table-repository";
import { parseInventoryTableQuery } from "@/features/reports/inventory-table-query";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireReportsTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return tenant;
}

export async function getInventoryTableLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getStockOnHandPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseInventoryTableQuery(searchParams, { status: "all" });
  return loadStockOnHandTable(tenant, query);
}

export async function getLowStockPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseInventoryTableQuery(searchParams, { status: "all" });
  return loadLowStockTable(tenant, query);
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

async function requireReportsApiTenant() {
  const session = await requireApiSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return tenant;
}

export async function exportStockOnHandExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getInventoryTableLocale();
    const query = parseInventoryTableQuery(searchParamsFromRequest(request), { status: "all" });
    const [data, storeName] = await Promise.all([
      loadStockOnHandTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildStockOnHandExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportLowStockExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getInventoryTableLocale();
    const query = parseInventoryTableQuery(searchParamsFromRequest(request), { status: "all" });
    const [data, storeName] = await Promise.all([
      loadLowStockTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildLowStockExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
