import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import {
  buildDailySalesExcel,
  buildMonthlySalesExcel,
  buildPaymentMethodSalesExcel,
} from "@/features/reports/sales-table-excel";
import {
  loadDailySalesTable,
  loadMonthlySalesTable,
  loadPaymentMethodSalesTable,
} from "@/features/reports/sales-table-repository";
import {
  parseSalesTableQuery,
  type SalesTableDatePreset,
} from "@/features/reports/sales-table-query";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireReportsTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return tenant;
}

export async function getSalesTableLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getDailySalesTablePageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseSalesTableQuery(searchParams, { datePreset: "today" });
  return loadDailySalesTable(tenant, query);
}

export async function getMonthlySalesTablePageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parseSalesTableQuery(searchParams, { datePreset: "this_month" });
  return loadMonthlySalesTable(tenant, query);
}

export async function getPaymentMethodSalesTablePageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const defaults: { datePreset: SalesTableDatePreset } = { datePreset: "today" };
  const query = parseSalesTableQuery(searchParams, defaults);
  return loadPaymentMethodSalesTable(tenant, query);
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

export async function exportDailySalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getSalesTableLocale();
    const query = parseSalesTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadDailySalesTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildDailySalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportMonthlySalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getSalesTableLocale();
    const query = parseSalesTableQuery(searchParamsFromRequest(request), { datePreset: "this_month" });
    const [data, storeName] = await Promise.all([
      loadMonthlySalesTable(tenant, query),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildMonthlySalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportPaymentMethodSalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getSalesTableLocale();
    const query = parseSalesTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadPaymentMethodSalesTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildPaymentMethodSalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
