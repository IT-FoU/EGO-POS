const PURCHASE_NO_PREFIX = "PO";

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

/**
 * Builds the next sequential purchase number for a company from the latest stored value.
 * Falls back to a date-based seed when no prior purchase order exists.
 */
export function buildNextPurchaseNo(latestPurchaseNo: string | null | undefined): string {
  const prefix = PURCHASE_NO_PREFIX;
  if (latestPurchaseNo) {
    const match = latestPurchaseNo.match(/(\d+)\s*$/);
    if (match) {
      const next = Number(match[1]) + 1;
      const width = Math.max(match[1].length, 4);
      return `${prefix}-${pad(next, width)}`;
    }
  }
  return `${prefix}-0001`;
}

/**
 * Resolves the next purchase number for a company. Prefers the provided client value
 * when present and non-empty; otherwise generates a sequential number from the database
 * and guarantees uniqueness against existing purchase orders.
 */
export async function resolvePurchaseNo(
  db: any,
  companyId: string,
  provided?: string | null,
): Promise<string> {
  const trimmed = typeof provided === "string" ? provided.trim() : "";
  if (trimmed.length > 0) {
    return trimmed;
  }

  const latest = await db.purchase.findFirst({
    orderBy: { purchaseNo: "desc" },
    select: { purchaseNo: true },
    where: { companyId },
  });

  let candidate = buildNextPurchaseNo(latest?.purchaseNo ?? null);
  // Guard against collisions when historical numbers are non-sequential.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const existing = await db.purchase.findFirst({
      select: { id: true },
      where: { companyId, purchaseNo: candidate },
    });
    if (!existing) {
      return candidate;
    }
    candidate = buildNextPurchaseNo(candidate);
  }

  // Extremely unlikely fallback.
  return `${candidate}-${Date.now()}`;
}
