"use server";

import { STORE_ACTIONS, type StoreAction } from "@/features/permissions/store-permissions";
import {
  adjustProductStockToActual,
  createStockAdjustment,
  createStockCount,
  createStockIn,
  getPrismaInventoryListPage,
  getPrismaProductStockSnapshot,
} from "@/features/inventory/prisma-repository";
import {
  assertPermission,
  READ_PERMISSIONS,
  WRITE_PERMISSIONS,
  type WritePermissionKey,
} from "@/lib/auth/permissions";
import type { InventoryListQuery } from "@/features/inventory/list-query";
import { requireSession } from "@/lib/auth/session";
import { requireStoreActionPermission } from "@/lib/auth/store-permission-guard";
import { parseQuickStockFixQuantity, quickStockFixNote, QUICK_STOCK_FIX_REASON } from "@/features/pos/quick-stock-fix";
import { tenantFromSession, writeFailure, writeSuccess } from "@/lib/db/write-context";

async function tenant(permission: WritePermissionKey, storeAction: StoreAction) {
  const session = await requireSession();
  const nextTenant = tenantFromSession(session);
  await requireStoreActionPermission({ action: storeAction, session, tenant: nextTenant });
  await assertPermission(nextTenant, permission);
  return nextTenant;
}

export async function loadInventoryListAction(query: InventoryListQuery = {}) {
  try {
    const session = await requireSession();
    const nextTenant = tenantFromSession(session);
    await assertPermission(nextTenant, READ_PERMISSIONS.inventoryView);
    return writeSuccess(await getPrismaInventoryListPage(nextTenant, query));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function stockInAction(input: Parameters<typeof createStockIn>[0]) {
  try {
    return writeSuccess(
      await createStockIn(input, await tenant(WRITE_PERMISSIONS.inventoryStockIn, STORE_ACTIONS.INVENTORY_STOCK_IN)),
    );
  } catch (error) {
    return writeFailure(error);
  }
}

export async function stockAdjustmentAction(input: Parameters<typeof createStockAdjustment>[0]) {
  try {
    return writeSuccess(
      await createStockAdjustment(input, await tenant(WRITE_PERMISSIONS.inventoryAdjust, STORE_ACTIONS.INVENTORY_ADJUST)),
    );
  } catch (error) {
    return writeFailure(error);
  }
}

export async function quickStockFixAction(input: {
  conversionQty?: number;
  productId: string;
  quantity: number;
  saleUnitName?: string | null;
  terminalCode?: string | null;
  warehouseId: string;
}) {
  try {
    const quantity = parseQuickStockFixQuantity(input.quantity);
    return writeSuccess(
      await createStockAdjustment(
        {
          note: quickStockFixNote({
            conversionQty: Number(input.conversionQty) > 0 ? Number(input.conversionQty) : 1,
            saleUnitName: input.saleUnitName?.trim() || "Piece",
            terminalCode: input.terminalCode,
          }),
          productId: input.productId,
          quantity,
          reason: QUICK_STOCK_FIX_REASON,
          warehouseId: input.warehouseId,
        },
        await tenant(WRITE_PERMISSIONS.inventoryAdjust, STORE_ACTIONS.INVENTORY_ADJUST),
        { markRecountNeeded: true },
      ),
    );
  } catch (error) {
    return writeFailure(error);
  }
}

export async function stockCountAction(input: Parameters<typeof createStockCount>[0]) {
  try {
    return writeSuccess(
      await createStockCount(input, await tenant(WRITE_PERMISSIONS.inventoryCount, STORE_ACTIONS.INVENTORY_COUNT), { clearRecountNeeded: true }),
    );
  } catch (error) {
    return writeFailure(error);
  }
}

export async function loadProductStockSnapshotAction(productId: string) {
  try {
    const session = await requireSession();
    const nextTenant = tenantFromSession(session);
    await assertPermission(nextTenant, READ_PERMISSIONS.productsView);
    return writeSuccess(await getPrismaProductStockSnapshot(productId, nextTenant));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function adjustProductStockAction(input: Parameters<typeof adjustProductStockToActual>[0]) {
  try {
    return writeSuccess(
      await adjustProductStockToActual(
        input,
        await tenant(WRITE_PERMISSIONS.inventoryAdjust, STORE_ACTIONS.INVENTORY_ADJUST),
      ),
    );
  } catch (error) {
    return writeFailure(error);
  }
}
