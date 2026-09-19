import { completePrismaSale } from "@/features/pos/prisma-repository";
import { listPrismaRecentSales } from "@/features/pos/post-sale-repository";
import { clampRecentSalesLimit, type RecentSalesDatePreset } from "@/features/pos/recent-sales-query";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { runRead, runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";

const datePresets = new Set<RecentSalesDatePreset>(["today", "yesterday", "week", "month", "custom"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const rawPreset = url.searchParams.get("datePreset");
  const datePreset =
    rawPreset && datePresets.has(rawPreset as RecentSalesDatePreset)
      ? (rawPreset as RecentSalesDatePreset)
      : undefined;
  const dateFrom = url.searchParams.get("dateFrom") ?? url.searchParams.get("customStart") ?? undefined;
  const dateTo = url.searchParams.get("dateTo") ?? url.searchParams.get("customEnd") ?? undefined;
  const limit = url.searchParams.get("limit")
    ? clampRecentSalesLimit(Number(url.searchParams.get("limit")))
    : undefined;

  return runRead((tenant) =>
    listPrismaRecentSales(tenant, {
      cursor,
      dateFrom,
      datePreset,
      dateTo,
      limit,
      search,
    }),
  );
}

export async function POST(request: Request) {
  return runWrite(
    (tenant, body) => completePrismaSale(body, tenant),
    request,
    WRITE_PERMISSIONS.posSell,
    { route: "/api/pos/sales", storeAction: [STORE_ACTIONS.SALE_COMPLETE, STORE_ACTIONS.PAYMENT_RECEIVE, STORE_ACTIONS.PROMOTION_APPLY] },
  );
}
