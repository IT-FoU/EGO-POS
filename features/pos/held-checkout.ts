import {
  HOLD_RESERVING_STATUSES,
  HOLD_STATUS_COMPLETED,
} from "@/features/pos/stock-reservation";
import { numberValue } from "@/lib/db/write-context";

/**
 * Consume ACTIVE reservations for a held checkout and mark Hold completed.
 * Must run inside the same transaction as On Hand deduction.
 * Availability for the sale should exclude this Hold's own ACTIVE rows.
 */
export async function consumeHeldBillReservationsForCheckout(
  tx: any,
  input: {
    companyId: string;
    branchId: string;
    warehouseId: string;
    holdBillId: string;
    quantityByProduct: Map<string, number>;
  },
) {
  const hold = await tx.holdBill.findFirst({
    include: {
      items: true,
      reservations: { where: { status: "ACTIVE" } },
    },
    where: {
      branchId: input.branchId,
      companyId: input.companyId,
      id: input.holdBillId,
      status: { in: [...HOLD_RESERVING_STATUSES] },
    },
  });
  if (!hold) {
    throw new Error("This held bill is no longer available for checkout.");
  }
  if (String(hold.warehouseId ?? "") !== String(input.warehouseId)) {
    throw new Error("Held bill warehouse does not match checkout warehouse.");
  }

  const reservations: Array<Record<string, any>> = hold.reservations ?? [];
  if (reservations.length === 0) {
    throw new Error("This held bill has no active stock reservations.");
  }

  const reservedByProduct = new Map<string, number>();
  for (const reservation of reservations) {
    const productId = String(reservation.productId);
    reservedByProduct.set(productId, (reservedByProduct.get(productId) ?? 0) + numberValue(reservation.baseQuantity));
  }

  for (const [productId, requested] of input.quantityByProduct) {
    const reserved = reservedByProduct.get(productId) ?? 0;
    if (requested > reserved + 1e-9) {
      throw new Error(
        `Checkout quantity for product ${productId} exceeds held reservation (reserved ${reserved}, requested ${requested}).`,
      );
    }
  }
  for (const [productId, reserved] of reservedByProduct) {
    const requested = input.quantityByProduct.get(productId) ?? 0;
    if (Math.abs(reserved - requested) > 1e-9) {
      throw new Error(
        `Checkout lines must match held reservation for product ${productId} (reserved ${reserved}, checkout ${requested}).`,
      );
    }
  }

  const consumed = await tx.stockReservation.updateMany({
    data: { consumedAt: new Date(), status: "CONSUMED" },
    where: { holdBillId: input.holdBillId, status: "ACTIVE" },
  });
  if (consumed.count !== reservations.length) {
    throw new Error("Held bill reservation was already consumed or released.");
  }

  const completed = await tx.holdBill.updateMany({
    data: { status: HOLD_STATUS_COMPLETED },
    where: {
      companyId: input.companyId,
      id: input.holdBillId,
      status: { in: [...HOLD_RESERVING_STATUSES] },
    },
  });
  if (completed.count !== 1) {
    throw new Error("This held bill was already completed or cancelled.");
  }

  return { consumedCount: consumed.count, holdBillId: input.holdBillId };
}
