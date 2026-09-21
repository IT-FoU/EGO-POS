import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
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
