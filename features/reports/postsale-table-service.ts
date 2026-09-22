import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiSession, requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import { prisma } from "@/lib/db/prisma";
import { apiJsonFromError } from "@/lib/api/write-response";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { buildReceiptSalesExcel, buildRefundVoidExcel } from "@/features/reports/postsale-table-excel";
import { loadReceiptSalesTable, loadRefundVoidTable } from "@/features/reports/postsale-table-repository";
import { parsePostSaleTableQuery } from "@/features/reports/postsale-table-query";

type SearchParams = Record<string, string | string[] | undefined> | undefined;

async function requireReportsTenant() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return tenant;
}

export async function getPostSaleTableLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getRefundVoidPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parsePostSaleTableQuery(searchParams, { datePreset: "today" });
  return loadRefundVoidTable(tenant, query);
}

export async function getReceiptSalesPageData(searchParams?: SearchParams) {
  const tenant = await requireReportsTenant();
  const query = parsePostSaleTableQuery(searchParams, { datePreset: "today" });
  return loadReceiptSalesTable(tenant, query);
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

export async function exportRefundVoidExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getPostSaleTableLocale();
    const query = parsePostSaleTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadRefundVoidTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildRefundVoidExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}

export async function exportReceiptSalesExcelResponse(request: Request) {
  try {
    const tenant = await requireReportsApiTenant();
    const locale = await getPostSaleTableLocale();
    const query = parsePostSaleTableQuery(searchParamsFromRequest(request), { datePreset: "today" });
    const [data, storeName] = await Promise.all([
      loadReceiptSalesTable(tenant, query, undefined, { allRows: true }),
      loadStoreName(tenant),
    ]);
    return excelFileResponse(await buildReceiptSalesExcel({ data, locale, storeName }));
  } catch (error) {
    return apiJsonFromError(error);
  }
}
