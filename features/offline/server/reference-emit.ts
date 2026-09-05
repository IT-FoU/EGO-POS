/**
 * Reference emit helpers (Phase 5.1, server-only).
 *
 * Thin, transaction-scoped helpers that read the just-written entity and emit the
 * corresponding OfflineServerChange. Called from `withTenantTransaction`'s
 * `afterWrite` hook so emission is atomic with the business write + audit and
 * reuses the existing tenant/branch scope. Only POS-relevant reference data is
 * emitted; no secrets/tokens/admin data.
 */

import type { TenantContext } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import {
  categoryPayloadFromRow,
  customerPayloadFromRow,
  emitReferenceChanges,
  productPayloadFromRow,
  promotionPayloadFromRow,
  ReferenceEntityType,
  settingsPayloadFromRow,
  stockLevelPayloadFromRow,
  tombstone,
} from "./reference-change";
import type { StockLotPayload } from "../replica/reference-types";

type Tx = any;

export async function emitProductUpsert(tx: Tx, tenant: TenantContext, productId: string): Promise<void> {
  const scope = await resolveTenantScope(tenant, tx);
  const row = await tx.product.findFirst({
    include: { units: true },
    where: { companyId: tenant.companyId, id: productId, ...branchOwnedWhere(scope) },
  });
  if (!row) return;
  // Archived/deleted products are tombstoned so they disappear from offline POS.
  if (row.isActive === false || row.status === "deleted") {
    await emitProductTombstone(tx, tenant, productId, row.branchId ?? scope.branchId);
    return;
  }
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.product,
      entityId: productId,
      deleted: false,
      branchId: row.branchId ?? scope.branchId,
      warehouseId: null,
      payload: productPayloadFromRow(row),
    },
  ]);
}

export async function emitProductTombstone(
  tx: Tx,
  tenant: TenantContext,
  productId: string,
  branchId?: string | null,
): Promise<void> {
  const scope = branchId ? { branchId } : { branchId: (await resolveTenantScope(tenant, tx)).branchId };
  await emitReferenceChanges(tx, tenant.companyId, [
    tombstone(ReferenceEntityType.product, productId, scope),
  ]);
}

export async function emitCategoryUpsert(tx: Tx, tenant: TenantContext, categoryId: string): Promise<void> {
  const scope = await resolveTenantScope(tenant, tx);
  const row = await tx.category.findFirst({
    where: { companyId: tenant.companyId, id: categoryId, ...branchOwnedWhere(scope) },
  });
  if (!row) return;
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.category,
      entityId: categoryId,
      deleted: false,
      branchId: row.branchId ?? scope.branchId,
      warehouseId: null,
      payload: categoryPayloadFromRow(row),
    },
  ]);
}

export async function emitCategoryTombstone(
  tx: Tx,
  tenant: TenantContext,
  categoryId: string,
  branchId?: string | null,
): Promise<void> {
  const resolvedBranch = branchId ?? (await resolveTenantScope(tenant, tx)).branchId;
  await emitReferenceChanges(tx, tenant.companyId, [
    tombstone(ReferenceEntityType.category, categoryId, { branchId: resolvedBranch }),
  ]);
}

export async function emitCustomerUpsert(tx: Tx, tenant: TenantContext, customerId: string): Promise<void> {
  const row = await tx.customer.findFirst({
    where: { companyId: tenant.companyId, id: customerId },
  });
  if (!row) return;
  // Customers are company-scoped for POS lookup (branchId null = all branches).
  if (row.status === "inactive" || row.status === "deleted") {
    await emitReferenceChanges(tx, tenant.companyId, [
      tombstone(ReferenceEntityType.customer, customerId, { branchId: null }),
    ]);
    return;
  }
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.customer,
      entityId: customerId,
      deleted: false,
      branchId: null,
      warehouseId: null,
      payload: customerPayloadFromRow(row),
    },
  ]);
}

export async function emitPromotionUpsert(tx: Tx, tenant: TenantContext, promotionId: string): Promise<void> {
  const row = await tx.promotion.findFirst({
    where: { companyId: tenant.companyId, id: promotionId },
  });
  if (!row) return;
  if (row.isActive === false || row.status === "inactive" || row.status === "deleted") {
    await emitReferenceChanges(tx, tenant.companyId, [
      tombstone(ReferenceEntityType.promotion, promotionId, { branchId: null }),
    ]);
    return;
  }
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.promotion,
      entityId: promotionId,
      deleted: false,
      branchId: null,
      warehouseId: null,
      payload: promotionPayloadFromRow(row),
    },
  ]);
}

export async function emitPromotionTombstone(
  tx: Tx,
  tenant: TenantContext,
  promotionId: string,
): Promise<void> {
  await emitReferenceChanges(tx, tenant.companyId, [
    tombstone(ReferenceEntityType.promotion, promotionId, { branchId: null }),
  ]);
}

export async function emitSettingsChange(tx: Tx, tenant: TenantContext): Promise<void> {
  const [company, settings] = await Promise.all([
    tx.company.findUnique({ where: { id: tenant.companyId } }),
    tx.companySetting.findUnique({ where: { companyId: tenant.companyId } }),
  ]);
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.settings,
      entityId: "current",
      deleted: false,
      branchId: null,
      warehouseId: null,
      payload: settingsPayloadFromRow(company, settings),
    },
  ]);
}

export async function emitStockLevelChange(
  tx: Tx,
  tenant: TenantContext,
  productId: string,
  warehouseId: string,
): Promise<void> {
  const scope = await resolveTenantScope(tenant, tx);
  if (!scope.warehouseIds.includes(warehouseId)) return;
  const balance = await tx.inventoryBalance.findFirst({
    where: { companyId: tenant.companyId, productId, warehouseId },
  });
  const lotRows = await tx.inventoryLot.findMany({
    where: { companyId: tenant.companyId, productId, warehouseId, quantity: { gt: 0 } },
  });
  const lots: StockLotPayload[] = lotRows.map((lot: Record<string, any>) => ({
    lotId: String(lot.id),
    quantity: Number(lot.quantity) || 0,
    expiryDate: lot.expiryDate instanceof Date ? lot.expiryDate.toISOString() : (lot.expiryDate ?? null),
  }));
  await emitReferenceChanges(tx, tenant.companyId, [
    {
      entityType: ReferenceEntityType.stockLevel,
      entityId: productId,
      deleted: false,
      branchId: scope.branchId,
      warehouseId,
      payload: stockLevelPayloadFromRow(productId, warehouseId, Number(balance?.quantity ?? 0), lots),
    },
  ]);
}
