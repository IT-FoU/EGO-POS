/** Normalize master-data display names (Category / Brand / Supplier). */
export function normalizeMasterName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function masterNamesEqual(a: unknown, b: unknown) {
  return normalizeMasterName(a).toLocaleLowerCase("en-US") === normalizeMasterName(b).toLocaleLowerCase("en-US");
}
