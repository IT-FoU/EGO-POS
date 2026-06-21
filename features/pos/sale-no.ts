const DEFAULT_RECEIPT_PREFIX = "INV";
const DEFAULT_PAD_LENGTH = 4;

export function normalizeReceiptPrefix(prefix: string | null | undefined) {
  const normalized = String(prefix ?? "").trim();
  return normalized || DEFAULT_RECEIPT_PREFIX;
}

export function formatPosSaleNo(prefix: string | null | undefined, sequence: number, padLength = DEFAULT_PAD_LENGTH) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  const safeSequence = Math.max(1, Math.floor(sequence));
  return `${normalizedPrefix}${String(safeSequence).padStart(padLength, "0")}`;
}

export function parsePosSaleNoSequence(saleNo: string, prefix: string | null | undefined) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  if (!saleNo.startsWith(normalizedPrefix)) {
    return null;
  }

  const suffix = saleNo.slice(normalizedPrefix.length);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }

  return Number.parseInt(suffix, 10);
}

export function getNextPosSaleNoFromExisting(existingSaleNos: string[], prefix: string | null | undefined, padLength = DEFAULT_PAD_LENGTH) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  let maxSequence = 0;

  for (const saleNo of existingSaleNos) {
    const sequence = parsePosSaleNoSequence(saleNo, normalizedPrefix);
    if (sequence !== null && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return formatPosSaleNo(normalizedPrefix, maxSequence + 1, padLength);
}

export function getFollowingPosSaleNo(currentSaleNo: string, prefix: string | null | undefined, padLength = DEFAULT_PAD_LENGTH) {
  const normalizedPrefix = normalizeReceiptPrefix(prefix);
  const currentSequence = parsePosSaleNoSequence(currentSaleNo, normalizedPrefix) ?? 0;
  return formatPosSaleNo(normalizedPrefix, currentSequence + 1, padLength);
}
