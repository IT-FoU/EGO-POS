import { permissionKeysForCheck } from "@/features/access-control/permission-catalog";
import {
  assembleDashboardSalesKpis,
  type DashboardSalesKpis,
} from "@/features/reports/prisma-repository";
import { PermissionDeniedError, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { resolveTenantMembership } from "@/lib/db/resolve-tenant-user";
import type { BranchScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

export type DashboardCriticalSalesLoad = {
  bounds: {
    payments: number;
    refunds: number;
    saleItems: number;
    sales: number;
  };
  kpis: DashboardSalesKpis;
};

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  }
  return [];
}

function asDate(value: unknown) {
  if (value instanceof Date) {
    return value;
  }
  return new Date(String(value));
}

export async function resolveDashboardCriticalContext(
  tenant: TenantContext,
  client: any,
): Promise<BranchScope> {
  const { effectiveUserId, isOwner } = await resolveTenantMembership(tenant, client);
  const scopedTenant: TenantContext = { ...tenant, userId: effectiveUserId };

  if (!isOwner) {
    const rows = await client.userRole.findMany({
      select: {
        role: {
          select: {
            permissions: {
              select: {
                permission: { select: { key: true } },
              },
            },
          },
        },
      },
      where: {
        companyId: tenant.companyId,
        userId: effectiveUserId,
      },
    });
    const grantedKeys = new Set(
      rows.flatMap((row: Record<string, unknown>) => {
        const role = row.role as Record<string, unknown>;
        const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
        return permissions.map((entry: Record<string, unknown>) =>
          String((entry.permission as Record<string, unknown>)?.key ?? ""),
        );
      }).filter(Boolean),
    );
    const keysToCheck = permissionKeysForCheck(READ_PERMISSIONS.dashboardView);
    if (!grantedKeys.has("*") && !keysToCheck.some((key) => grantedKeys.has(key))) {
      throw new PermissionDeniedError(READ_PERMISSIONS.dashboardView);
    }
  }

  const branches = await client.branch.findMany({
    orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
    where: { companyId: scopedTenant.companyId },
  }) as Array<{ id: string; name: string }>;
  if (branches.length === 0) {
    throw new Error("Active branch was not found for this user.");
  }

  const selected = scopedTenant.branchId
    ? branches.find((branch) => branch.id === scopedTenant.branchId)
    : branches[0];
  if (!selected) {
    throw new Error("Active branch was not found for this user.");
  }

  const branchIds = isOwner ? branches.map((branch) => branch.id) : [selected.id];
  const warehouses = await client.warehouse.findMany({
    orderBy: { createdAt: "asc" },
    where: isOwner
      ? { companyId: scopedTenant.companyId }
      : { branchId: selected.id, companyId: scopedTenant.companyId },
  }) as Array<{ id: string }>;
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);

  if (scopedTenant.warehouseId && !warehouseIds.includes(scopedTenant.warehouseId)) {
    throw new Error("Active warehouse is outside the assigned branch.");
  }

  return {
    ...scopedTenant,
    branchId: selected.id,
    branchIds,
    branchName: selected.name,
    isOwner,
    warehouseId: scopedTenant.warehouseId ?? warehouseIds[0],
    warehouseIds,
  };
}

export async function loadDashboardCriticalSalesKpis(
  scope: BranchScope,
  range: { dateFrom: Date; dateTo: Date },
  client: any,
): Promise<DashboardCriticalSalesLoad> {
  const rows = await client.$queryRaw<Array<{
    items: unknown;
    payments: unknown;
    refunds: unknown;
    sales: unknown;
  }>>`
    SELECT
      (
        SELECT COALESCE(json_agg(sale_row ORDER BY sale_row."createdAt" DESC), '[]'::json)
        FROM (
          SELECT
            s.id,
            s.created_at AS "createdAt",
            s.discount_amount AS "discountAmount",
            s.profit_amount AS "profitAmount",
            s.sale_no AS "saleNo",
            s.sale_status AS "saleStatus",
            s.tax_amount AS "taxAmount",
            s.total_amount AS "totalAmount"
          FROM sales s
          WHERE s.company_id = ${scope.companyId}
            AND s.branch_id = ${scope.branchId}
            AND s.created_at >= ${range.dateFrom}
            AND s.created_at <= ${range.dateTo}
            AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
        ) sale_row
      ) AS sales,
      (
        SELECT COALESCE(json_agg(item_row), '[]'::json)
        FROM (
          SELECT
            si.id,
            si.product_id AS "productId",
            si.cost_price AS "costPrice",
            si.profit_amount AS "profitAmount",
            si.quantity,
            si.total_amount AS "totalAmount",
            p.name_en AS "nameEn",
            p.name_lo AS "nameLo"
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          LEFT JOIN products p ON p.id = si.product_id
          WHERE s.company_id = ${scope.companyId}
            AND s.branch_id = ${scope.branchId}
            AND s.created_at >= ${range.dateFrom}
            AND s.created_at <= ${range.dateTo}
            AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
        ) item_row
      ) AS items,
      (
        SELECT COALESCE(json_agg(payment_row), '[]'::json)
        FROM (
          SELECT
            sp.amount,
            sp.change_amount AS "changeAmount",
            sp.payment_method AS "paymentMethod",
            sp.sale_id AS "saleId"
          FROM sale_payments sp
          JOIN sales s ON s.id = sp.sale_id
          WHERE s.company_id = ${scope.companyId}
            AND s.branch_id = ${scope.branchId}
            AND s.created_at >= ${range.dateFrom}
            AND s.created_at <= ${range.dateTo}
            AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
        ) payment_row
      ) AS payments,
      (
        SELECT COALESCE(json_agg(refund_row), '[]'::json)
        FROM (
          SELECT
            r.kind,
            r.payment_amount AS "paymentAmount",
            r.refund_amount AS "refundAmount",
            r.refund_method AS "refundMethod",
            r.sale_id AS "saleId",
            r.total_amount AS "totalAmount",
            (
              SELECT COALESCE(json_agg(json_build_object(
                'amount', ri.amount,
                'productId', ri.product_id,
                'quantity', ri.quantity,
                'saleItemId', ri.sale_item_id
              )), '[]'::json)
              FROM refund_items ri
              WHERE ri.refund_id = r.id
            ) AS items,
            (
              SELECT COALESCE(json_agg(json_build_object(
                'costPrice', ei.cost_price,
                'productId', ei.product_id,
                'quantity', ei.quantity,
                'totalAmount', ei.total_amount,
                'nameEn', ep.name_en,
                'nameLo', ep.name_lo
              )), '[]'::json)
              FROM refund_exchange_items ei
              LEFT JOIN products ep ON ep.id = ei.product_id
              WHERE ei.refund_id = r.id
            ) AS "exchangeItems"
          FROM refunds r
          JOIN sales s ON s.id = r.sale_id
          WHERE s.company_id = ${scope.companyId}
            AND s.branch_id = ${scope.branchId}
            AND s.created_at >= ${range.dateFrom}
            AND s.created_at <= ${range.dateTo}
            AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
        ) refund_row
      ) AS refunds
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("Dashboard critical sales query returned no result.");
  }

  const salesByPeriod: Array<Record<string, any>> = parseJsonArray<Record<string, any>>(row.sales).map((sale) => ({
    ...sale,
    createdAt: asDate(sale.createdAt),
  }));
  const saleItemCostRows = parseJsonArray<Record<string, any>>(row.items);
  const paymentRows = parseJsonArray<DashboardSalesKpis["paymentRows"][number]>(row.payments);
  const refundRows = parseJsonArray<Record<string, any>>(row.refunds).map((refund) => ({
    ...refund,
    exchangeItems: parseJsonArray<Record<string, any>>(refund.exchangeItems),
    items: parseJsonArray<Record<string, any>>(refund.items),
  }));

  const paymentMethodBySaleId = new Map<string, string>();
  for (const payment of paymentRows) {
    if (!paymentMethodBySaleId.has(payment.saleId)) {
      paymentMethodBySaleId.set(payment.saleId, String(payment.paymentMethod ?? "cash"));
    }
  }
  for (const sale of salesByPeriod) {
    sale.payments = [{ paymentMethod: paymentMethodBySaleId.get(String(sale.id)) ?? "cash" }];
  }

  const productsById = new Map<string, { id: string; nameEn: string; nameLo: string }>();
  for (const item of saleItemCostRows) {
    const id = String(item.productId ?? "");
    if (id && !productsById.has(id)) {
      productsById.set(id, {
        id,
        nameEn: String(item.nameEn ?? ""),
        nameLo: String(item.nameLo ?? ""),
      });
    }
  }
  for (const refund of refundRows) {
    for (const exchange of refund.exchangeItems ?? []) {
      const id = String(exchange.productId ?? "");
      if (id && !productsById.has(id)) {
        productsById.set(id, {
          id,
          nameEn: String(exchange.nameEn ?? ""),
          nameLo: String(exchange.nameLo ?? ""),
        });
      }
    }
  }

  return {
    bounds: {
      payments: paymentRows.length,
      refunds: refundRows.length,
      saleItems: saleItemCostRows.length,
      sales: salesByPeriod.length,
    },
    kpis: assembleDashboardSalesKpis({
      paymentRows,
      products: Array.from(productsById.values()),
      refundRows,
      saleItemCostRows,
      salesByPeriod,
    }),
  };
}
