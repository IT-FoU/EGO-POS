/**
 * Offline rollout configuration (Phase 5.2).
 *
 * The current Mini Mart rollout is intentionally single-warehouse per terminal.
 * This is enforced in code (not merely assumed): the sync context rejects a
 * terminal bound to more than one sellable warehouse while the flag is on, and
 * the sync status surfaces the flag + resolved warehouse scope for diagnostics.
 */

export const SINGLE_WAREHOUSE_ROLLOUT = true;

export class SingleWarehouseRolloutError extends Error {
  constructor(public readonly warehouseIds: string[]) {
    super(
      `Single-warehouse rollout is enforced but this terminal resolves to ${warehouseIds.length} warehouses ` +
        `(${warehouseIds.join(", ")}). Assign the device to exactly one warehouse.`,
    );
    this.name = "SingleWarehouseRolloutError";
  }
}

/**
 * Enforce the single-warehouse limitation. Returns the (validated) warehouse
 * scope. Throws {@link SingleWarehouseRolloutError} when more than one warehouse
 * would be in scope under a single-warehouse rollout.
 */
export function assertSingleWarehouseRollout(warehouseIds: string[]): string[] {
  if (SINGLE_WAREHOUSE_ROLLOUT && warehouseIds.length > 1) {
    throw new SingleWarehouseRolloutError(warehouseIds);
  }
  return warehouseIds;
}
