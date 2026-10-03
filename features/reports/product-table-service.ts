import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { assertReportQueryAllowed, readReportVisibility, redactReportPayload, requireReportExport } from "@/lib/auth/fine-access";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import {
  buildCategorySalesExcel,
  buildProductPerformanceExcel,
  buildProductSalesExcel,
} from "@/features/reports/product-table-excel";
import {
  loadCategorySalesTable,
  loadProductPerformanceTable,
  loadProductSalesTable,
} from "@/features/reports/product-table-repository";
import { parseProductTableQuery, type ProductTableDatePreset } from "@/features/reports/product-table-query";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireReportsTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return tenant;
}

export async function getProductTableLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

async function presentProductReport<T extends { showCostProfit: boolean }>(
  tenant: TenantContext,
  query: { dateFrom?: Date | string | null; datePreset?: string | null },
  data: T,
) {
  const parsedFrom = query.dateFrom instanceof Date
    ? query.dateFrom
    : typeof query.dateFrom === "string" && query.dateFrom
      ? new Date(query.dateFrom)
      : null;
  await assertReportQueryAllowed(tenant, {
    dateFrom: parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : null,
    datePreset: query.datePreset,
  });
  const visibility = await readReportVisibility(tenant);
  return redactReportPayload(tenant, {
    ...data,
    showCostProfit: visibility.cost && visibility.profit && visibility.margin,
  });
}

export async function getProductSalesPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseProductTableQuery(searchParams, { datePreset: "today" });
  return presentProductReport(tenant, query, await loadProductSalesTable(tenant, query));
}

export async function getCategorySalesPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseProductTableQuery(searchParams, { datePreset: "this_month" });
  return presentProductReport(tenant, query, await loadCategorySalesTable(tenant, query));
}

export async function getProductPerformancePageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseProductTableQuery(searchParams, { datePreset: "this_month" });
  return presentProductReport(tenant, query, await loadProductPerformanceTable(tenant, query));
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
  await requireReportExport(tenant);
  return tenant;
}

export async function exportProductSalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getProductTableLocale();
    const defaults: { datePreset: ProductTableDatePreset } = { datePreset: "today" };
    const query = parseProductTableQuery(searchParamsFromRequest(request), defaults);
    const [loaded, storeName] = await Promise.all([
      loadProductSalesTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    const data = await presentProductReport(tenant, query, loaded);
    return excelFileResponse(await buildProductSalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportCategorySalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getProductTableLocale();
    const query = parseProductTableQuery(searchParamsFromRequest(request), { datePreset: "this_month" });
    const [loaded, storeName] = await Promise.all([
      loadCategorySalesTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    const data = await presentProductReport(tenant, query, loaded);
    return excelFileResponse(await buildCategorySalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportProductPerformanceExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getProductTableLocale();
    const query = parseProductTableQuery(searchParamsFromRequest(request), { datePreset: "this_month" });
    const [loaded, storeName] = await Promise.all([
      loadProductPerformanceTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    const data = await presentProductReport(tenant, query, loaded);
    return excelFileResponse(await buildProductPerformanceExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
