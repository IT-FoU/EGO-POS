/**
 * Prisma reference snapshot provider (Phase 5, server-only).
 *
 * Builds the minimum Mini Mart reference entities for offline POS by REUSING the
 * existing tenant/branch/warehouse-scoped `getPrismaPosSnapshot` (isolation and
 * POS rules already enforced there) plus the Phase 3 terminal stock allocation.
 * Returns only POS-required, non-secret data — never admin data, tokens, or
 * secrets. The security snapshot is delivered separately by /api/offline/device/policy.
 */

import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { getPrismaPosSnapshot } from "@/features/pos/prisma-repository";
import {
  ReferenceEntityType,
  type ReferenceEntity,
  type ReferenceScope,
} from "../replica/reference-types";

const db = prisma as any;

const BOOTSTRAP_VERSION = 1;

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Assemble the full ordered reference entity list for a device's scope.
 * `deviceId` is the registered non-secret device id (used to attach the terminal
 * stock allocation lease). Throws if the device is not registered for the tenant.
 */
export async function buildReferenceEntities(
  tenant: TenantContext,
  deviceId: string,
): Promise<ReferenceEntity[]> {
  const trimmed = deviceId.trim();
  if (!trimmed) throw new Error("deviceId is required");

  const [snapshot, device] = await Promise.all([
    getPrismaPosSnapshot(tenant),
    db.terminalDevice.findUnique({
      where: { companyId_deviceId: { companyId: tenant.companyId, deviceId: trimmed } },
    }),
  ]);
  if (!device) throw new Error("Terminal device is not registered for this company");

  const branchId: string = snapshot.branchId;
  const warehouseId: string | null = snapshot.warehouseId || null;
  const scope: ReferenceScope = { companyId: tenant.companyId, branchId, warehouseId };

  // Terminal sellable leases for this device (respect allocation constraints).
  const allocations: Array<{ productId: string; allocatedQty: unknown; consumedQty: unknown; status: string }> =
    await db.terminalStockAllocation.findMany({
      where: { companyId: tenant.companyId, terminalDeviceId: device.id, status: "active" },
      select: { productId: true, allocatedQty: true, consumedQty: true, status: true },
    });
  const allocByProduct = new Map<string, number>();
  for (const row of allocations) {
    const remaining = num(row.allocatedQty) - num(row.consumedQty);
    allocByProduct.set(row.productId, (allocByProduct.get(row.productId) ?? 0) + Math.max(0, remaining));
  }

  const entities: ReferenceEntity[] = [];

  // Store context (singleton).
  entities.push({
    entityType: ReferenceEntityType.storeContext,
    entityId: "current",
    version: BOOTSTRAP_VERSION,
    deleted: false,
    scope,
    payload: {
      companyId: tenant.companyId,
      companyName: snapshot.companyName,
      branchId,
      branchName: snapshot.branchName,
      warehouseId,
      terminalId: device.terminalId,
      deviceId: trimmed,
    },
  });

  // Settings (singleton) — receipt/tax/loyalty/currency only.
  entities.push({
    entityType: ReferenceEntityType.settings,
    entityId: "current",
    version: BOOTSTRAP_VERSION,
    deleted: false,
    scope,
    payload: {
      taxRatePercent: num(snapshot.taxRatePercent),
      taxInclusive: Boolean(snapshot.taxInclusive),
      receiptPrefix: snapshot.receiptSettings?.receiptPrefix ?? "",
      receiptHeader: snapshot.receiptSettings?.receiptHeader ?? null,
      receiptFooter: snapshot.receiptSettings?.receiptFooter ?? null,
      loyaltyEnabled: Boolean(snapshot.loyaltySettings?.loyaltyEnabled),
      loyaltySpendPerPointLak: snapshot.loyaltySettings?.loyaltySpendPerPointLak ?? null,
      baseCurrency: "LAK",
    },
  });

  // Categories (derived from active products in scope).
  const categorySeen = new Map<string, string>();
  for (const product of snapshot.products as Array<Record<string, any>>) {
    const categoryId = product.categoryId;
    if (categoryId && !categorySeen.has(categoryId)) {
      categorySeen.set(categoryId, product.categoryName ?? "");
    }
  }
  for (const [id, name] of categorySeen) {
    entities.push({
      entityType: ReferenceEntityType.category,
      entityId: id,
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: { id, name, parentId: null },
    });
  }

  // Products (units, barcodes, prices, category link, stock-display).
  for (const product of snapshot.products as Array<Record<string, any>>) {
    const units = (product.units ?? []).map((unit: Record<string, any>) => ({
      unitId: String(unit.id),
      name: String(unit.unitName ?? ""),
      factor: num(unit.conversionQty) || 1,
      priceLak: num(unit.sellingPriceLak),
      barcode: unit.barcode || null,
    }));
    const barcodes = [product.barcode, ...units.map((u: any) => u.barcode)]
      .filter((b): b is string => typeof b === "string" && b.length > 0);
    entities.push({
      entityType: ReferenceEntityType.product,
      entityId: String(product.id),
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        id: String(product.id),
        name: product.nameEn || product.nameLo || "",
        sku: product.sku || null,
        categoryId: product.categoryId ?? null,
        retailPriceLak: num(product.priceLak),
        barcodes: [...new Set(barcodes)],
        units,
        stockDisplayMode: product.stockDisplayMode ?? null,
        imageUrl: product.imageUrl ?? null,
        isActive: product.isActive !== false,
      },
    });

    // Read-only stock level per product (respecting terminal allocation).
    entities.push({
      entityType: ReferenceEntityType.stockLevel,
      entityId: String(product.id),
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        productId: String(product.id),
        warehouseId: warehouseId ?? "",
        available: num(product.stockQty),
        lots: [],
        terminalAllocatedQty: allocByProduct.has(String(product.id))
          ? allocByProduct.get(String(product.id))!
          : null,
      },
    });
  }

  // Customers / member lookup needed for POS.
  for (const customer of snapshot.customers as Array<Record<string, any>>) {
    entities.push({
      entityType: ReferenceEntityType.customer,
      entityId: String(customer.id),
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        id: String(customer.id),
        code: customer.customerCode ?? customer.code ?? "",
        name: customer.fullName ?? customer.name ?? "",
        phone: customer.phone ?? null,
        membershipLevelId: customer.membershipLevelId ?? null,
        discountPercent: num(customer.discountPercent),
        pointsBalance: num(customer.pointsBalance ?? customer.availablePoints),
      },
    });
  }

  // Promotions — safe-offline snapshot; server remains authoritative at checkout.
  for (const promotion of snapshot.promotions as Array<Record<string, any>>) {
    entities.push({
      entityType: ReferenceEntityType.promotion,
      entityId: String(promotion.id),
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        id: String(promotion.id),
        name: promotion.promotionName ?? "",
        version: BOOTSTRAP_VERSION,
        type: promotion.promotionType ?? "percentage",
        status: promotion.status ?? "active",
        effectiveFrom: promotion.startDate ?? null,
        effectiveTo: promotion.endDate ?? null,
        rules: {
          discountPercent: promotion.discountPercent ?? null,
          discountAmountLak: promotion.discountAmountLak ?? null,
          comboPriceLak: promotion.comboPriceLak ?? null,
          buyQuantity: promotion.buyQuantity ?? null,
          getQuantity: promotion.getQuantity ?? null,
          products: promotion.products ?? [],
          categories: promotion.categories ?? [],
          membershipLevels: promotion.membershipLevels ?? [],
          priority: promotion.priority ?? 0,
        },
      },
    });
  }

  // QR banks.
  for (const bank of (snapshot.qrBanks ?? []) as Array<Record<string, any>>) {
    entities.push({
      entityType: ReferenceEntityType.qrBank,
      entityId: String(bank.id),
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        id: String(bank.id),
        bankName: bank.bankName ?? bank.name ?? "",
        shortCode: bank.shortCode ?? null,
        sortOrder: num(bank.sortOrder),
        isActive: bank.isActive !== false,
      },
    });
  }

  // Active cash-session context (singleton) — only when a session is open.
  if (snapshot.cashSession && snapshot.cashSession.sessionId) {
    entities.push({
      entityType: ReferenceEntityType.cashSession,
      entityId: "current",
      version: BOOTSTRAP_VERSION,
      deleted: false,
      scope,
      payload: {
        id: String(snapshot.cashSession.sessionId),
        status: snapshot.cashSession.status,
        openedAt: snapshot.cashSession.openedAt
          ? new Date(snapshot.cashSession.openedAt).toISOString()
          : null,
        openingFloatLak: num(snapshot.cashSession.openingCashLak),
      },
    });
  }

  return entities;
}
