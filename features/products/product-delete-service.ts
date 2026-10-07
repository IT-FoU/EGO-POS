import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { sanitizeAuditData } from "@/lib/audit/sanitize-audit-data";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import {
  permanentDeleteBlockReason,
  ProductDeleteBlockedError,
  type PermanentDeleteFacts,
  type ProductDeleteBlockReason,
} from "@/features/products/product-delete";

const db = prisma as any;

export type ProductDeleteSnapshot = {
  actorId: string;
  actorName: string;
  deletionType: "soft" | "permanent";
  productId: string;
  productName: string;
  sku: string;
  timestamp: string;
};

export type PermanentDeleteEligibility = {
  allowed: boolean;
  productId: string;
  productName: string;
  reason: ProductDeleteBlockReason | null;
  sku: string;
};

type ProductDeleteRow = {
  id: string;
  imageUrl: string | null;
  nameEn: string | null;
  nameLo: string;
  sku: string | null;
  status: string;
  images: Array<{ imageUrl: string }>;
  units: Array<{ imageUrl: string | null }>;
};

export type PermanentDeleteCommit = {
  images: { imageUrl?: string | null; units?: Array<{ imageUrl?: string | null }> };
  name: string;
  productId: string;
  sku: string;
  timings: { eligibilityMs: number; statementMs: number };
};

function productNameOf(row: { nameEn?: string | null; nameLo?: string | null }) {
  return row.nameLo || row.nameEn || "";
}

function snapshotOf(input: {
  actorId: string;
  actorName: string;
  deletionType: "soft" | "permanent";
  productId: string;
  productName: string;
  sku: string;
}): ProductDeleteSnapshot {
  return {
    actorId: input.actorId,
    actorName: input.actorName,
    deletionType: input.deletionType,
    productId: input.productId,
    productName: input.productName,
    sku: input.sku,
    timestamp: new Date().toISOString(),
  };
}

async function actorName(tenant: TenantContext) {
  const user = await db.user.findUnique({
    select: { fullName: true },
    where: { id: tenant.userId },
  });
  return String(user?.fullName ?? "").trim();
}

async function scopedProduct(productId: string, scope: BranchScope): Promise<ProductDeleteRow | null> {
  return db.product.findFirst({
    select: {
      id: true,
      imageUrl: true,
      images: { select: { imageUrl: true } },
      nameEn: true,
      nameLo: true,
      sku: true,
      status: true,
      units: { select: { imageUrl: true } },
    },
    where: {
      companyId: scope.companyId,
      id: productId,
      ...(scope.isOwner ? {} : { branchId: scope.branchId }),
    },
  });
}

function imageSnapshot(row: ProductDeleteRow) {
  return {
    imageUrl: row.imageUrl,
    units: [
      ...row.units.map((unit) => ({ imageUrl: unit.imageUrl })),
      ...row.images.map((image) => ({ imageUrl: image.imageUrl })),
    ],
  };
}

async function readFacts(productIds: string[], scope: BranchScope): Promise<Map<string, PermanentDeleteFacts & { productName: string; sku: string }>> {
  if (productIds.length === 0) return new Map();
  const rows = await db.$queryRaw<Array<PermanentDeleteFacts & { id: string; nameEn: string | null; nameLo: string; sku: string | null }>>`
    SELECT
      p.id,
      p.status,
      p.name_lo AS "nameLo",
      p.name_en AS "nameEn",
      p.sku,
      EXISTS (SELECT 1 FROM sale_items x WHERE x.product_id = p.id) AS "hasSaleItems",
      EXISTS (SELECT 1 FROM refund_items x WHERE x.product_id = p.id) AS "hasRefundItems",
      EXISTS (SELECT 1 FROM refund_exchange_items x WHERE x.product_id = p.id) AS "hasRefundExchangeItems",
      EXISTS (SELECT 1 FROM stock_movements x WHERE x.product_id = p.id) AS "hasMovements",
      EXISTS (SELECT 1 FROM stock_adjustments x WHERE x.product_id = p.id) AS "hasAdjustments",
      EXISTS (SELECT 1 FROM purchase_items x WHERE x.product_id = p.id) AS "hasPurchaseItems",
      EXISTS (SELECT 1 FROM goods_receipt_items x WHERE x.product_id = p.id) AS "hasGoodsReceiptItems",
      EXISTS (SELECT 1 FROM stock_transfer_items x WHERE x.product_id = p.id) AS "hasStockTransferItems",
      EXISTS (SELECT 1 FROM hold_bill_items x WHERE x.product_id = p.id) AS "hasHoldBillItems",
      EXISTS (SELECT 1 FROM stock_reservations x WHERE x.product_id = p.id AND x.status = 'ACTIVE') AS "hasActiveReservations",
      EXISTS (SELECT 1 FROM inventory_lots x WHERE x.product_id = p.id) AS "hasLots",
      EXISTS (SELECT 1 FROM inventory_lot_allocations x WHERE x.product_id = p.id) AS "hasLotAllocations",
      EXISTS (SELECT 1 FROM inventory_balances x WHERE x.product_id = p.id AND x.quantity <> 0) AS "hasNonZeroStock",
      EXISTS (SELECT 1 FROM inventory_balances x WHERE x.product_id = p.id AND x.recount_needed = true) AS "needsRecount"
    FROM products p
    WHERE p.company_id = ${scope.companyId}
      AND p.id IN (${Prisma.join(productIds)})
      AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
  `;
  return new Map(rows.map((row: PermanentDeleteFacts & { id: string; nameEn: string | null; nameLo: string; sku: string | null }) => [row.id, {
    ...row,
    productName: productNameOf(row),
    sku: row.sku ?? "",
  }]));
}

export async function loadPermanentDeleteEligibility(productIds: string[], tenant: TenantContext): Promise<PermanentDeleteEligibility[]> {
  const scope = await resolveTenantScope(tenant, db);
  const unique = Array.from(new Set(productIds.map((id) => id.trim()).filter(Boolean))).slice(0, 200);
  const facts = await readFacts(unique, scope);
  return unique.map((productId) => {
    const row = facts.get(productId);
    if (!row) {
      return { allowed: false, productId, productName: "", reason: "NOT_DELETED" as const, sku: "" };
    }
    const reason = permanentDeleteBlockReason(row);
    return {
      allowed: reason === null,
      productId,
      productName: row.productName,
      reason,
      sku: row.sku,
    };
  });
}

async function writeSoftAudit(tenant: TenantContext, actor: string, row: ProductDeleteRow) {
  const data = sanitizeAuditData(snapshotOf({
    actorId: tenant.userId,
    actorName: actor,
    deletionType: "soft",
    productId: row.id,
    productName: productNameOf(row),
    sku: row.sku ?? "",
  }));
  await db.auditLog.create({
    data: {
      action: "delete",
      companyId: tenant.companyId,
      module: "products",
      newData: data,
      oldData: data,
      userId: tenant.userId,
    },
  });
}

export async function softDeletePrismaProduct(productId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant, db);
  const existing = await scopedProduct(productId, scope);
  if (!existing) throw new Error("Product was not found.");
  const actor = await actorName(tenant);
  const updated = await db.product.update({
    data: { isActive: false, status: "deleted" },
    where: { id: existing.id },
  });
  await writeSoftAudit(tenant, actor, { ...existing, status: "deleted" }).catch((error: unknown) => {
    console.error("product-soft-delete-audit-failed", error instanceof Error ? error.message : error);
  });
  return {
    deleteMode: "soft" as const,
    product: {
      id: updated.id,
      isActive: false,
      nameEn: existing.nameEn ?? "",
      nameLo: existing.nameLo,
      sku: existing.sku ?? "",
      status: "deleted" as const,
    },
  };
}

export async function commitPermanentDelete(productId: string, tenant: TenantContext): Promise<PermanentDeleteCommit> {
  const eligibilityStarted = Date.now();
  const scope = await resolveTenantScope(tenant, db);
  const existing = await scopedProduct(productId, scope);
  if (!existing) throw new Error("Product was not found.");
  const facts = await readFacts([existing.id], scope);
  const fact = facts.get(existing.id);
  const reason = fact ? permanentDeleteBlockReason(fact) : "NOT_DELETED";
  const eligibilityMs = Date.now() - eligibilityStarted;
  if (reason) throw new ProductDeleteBlockedError(reason);

  const actor = await actorName(tenant);
  const auditId = randomUUID();
  const statementStarted = Date.now();
  const removed = await db.$queryRaw<Array<{ id: string }>>`
    WITH gate AS (
      SELECT p.id, p.name_lo, p.name_en, p.sku
      FROM products p
      WHERE p.id = ${existing.id}
        AND p.company_id = ${scope.companyId}
        AND p.status = 'deleted'
        AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
        AND NOT EXISTS (SELECT 1 FROM sale_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM refund_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM refund_exchange_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stock_movements x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stock_adjustments x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM purchase_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM goods_receipt_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stock_transfer_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM hold_bill_items x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM stock_reservations x WHERE x.product_id = p.id AND x.status = 'ACTIVE')
        AND NOT EXISTS (SELECT 1 FROM inventory_lots x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM inventory_lot_allocations x WHERE x.product_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM inventory_balances x WHERE x.product_id = p.id AND (x.quantity <> 0 OR x.recount_needed = true))
    ),
    audited AS (
      INSERT INTO audit_logs (id, company_id, user_id, module, action, old_data, new_data, created_at)
      SELECT
        ${auditId},
        ${scope.companyId},
        ${tenant.userId},
        'products',
        'permanent_delete',
        jsonb_build_object(
          'actorId', ${tenant.userId},
          'actorName', ${actor},
          'deletionType', 'permanent',
          'productId', gate.id,
          'productName', COALESCE(NULLIF(gate.name_lo, ''), gate.name_en, ''),
          'sku', COALESCE(gate.sku, ''),
          'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
        jsonb_build_object(
          'actorId', ${tenant.userId},
          'actorName', ${actor},
          'deletionType', 'permanent',
          'productId', gate.id,
          'productName', COALESCE(NULLIF(gate.name_lo, ''), gate.name_en, ''),
          'sku', COALESCE(gate.sku, ''),
          'timestamp', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ),
        NOW()
      FROM gate
      RETURNING id
    ),
    cleared AS (
      DELETE FROM inventory_balances b
      USING gate
      WHERE b.product_id = gate.id
        AND b.quantity = 0
        AND b.recount_needed = false
      RETURNING b.id
    ),
    removed AS (
      DELETE FROM products p
      USING gate
      WHERE p.id = gate.id
        AND EXISTS (SELECT 1 FROM audited)
        AND (SELECT COUNT(*) FROM cleared) >= 0
      RETURNING p.id
    )
    SELECT id FROM removed
  `;
  const statementMs = Date.now() - statementStarted;
  if (!removed[0]?.id) {
    const again = await readFacts([existing.id], scope);
    const next = again.get(existing.id);
    throw new ProductDeleteBlockedError(next ? permanentDeleteBlockReason(next) ?? "REFERENCED_RECORD" : "NOT_DELETED");
  }
  return {
    images: imageSnapshot(existing),
    name: productNameOf(existing),
    productId: existing.id,
    sku: existing.sku ?? "",
    timings: { eligibilityMs, statementMs },
  };
}
