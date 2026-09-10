export function toLakInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
}

export function conversionMillis(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0n;
  return BigInt(Math.trunc(parsed * 1000 + 1e-9));
}

export function deriveSharedUnitCost(editedCostLak: number, editedConversion: number, targetConversion: number) {
  const editedCost = toLakInteger(editedCostLak);
  const from = conversionMillis(editedConversion);
  const to = conversionMillis(targetConversion);
  if (from <= 0n) return 0;
  return Number((BigInt(editedCost) * to) / from);
}
