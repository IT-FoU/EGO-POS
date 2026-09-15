export type UnitRole = "piece" | "pack" | "box" | "custom";

export type HierarchyUnit = {
  conversionQty: number;
  costPriceLak?: number;
  hierarchyQty?: number;
  id?: string;
  isBaseUnit?: boolean;
  status?: "active" | "inactive";
  unitName: string;
};

export type ConversionDraftState = {
  committed: number | null;
  draft: string;
  error: boolean;
};

export function unitRole(unitName: unknown): UnitRole {
  const key = String(unitName ?? "").trim().toLowerCase();
  if (key === "piece" || key === "pcs" || key === "pc") return "piece";
  if (key === "pack") return "pack";
  if (key === "box") return "box";
  return "custom";
}

export function isUnitEnabled(unit: Pick<HierarchyUnit, "status">) {
  return (unit.status ?? "active") !== "inactive";
}

export function parsePositiveQty(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function parsePositiveIntQty(value: unknown) {
  const parsed = parsePositiveQty(value);
  if (parsed === null || !Number.isInteger(parsed)) return null;
  return parsed;
}

/** Integers including 0 and negatives. Blank/invalid → null. Never coalesces to 1. */
export function parseIntegerQty(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    return value;
  }
  const text = String(value ?? "").trim();
  if (text === "" || !/^-?\d+$/.test(text)) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return null;
  return parsed;
}

export function isActiveUnitQtyInvalid(unit: Pick<HierarchyUnit, "conversionQty" | "status">) {
  return isUnitEnabled(unit) && parsePositiveIntQty(unit.conversionQty) === null;
}

function findRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  return units.find((unit) => unitRole(unit.unitName) === role);
}

function enabledRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  const unit = findRole(units, role);
  return unit && isUnitEnabled(unit) ? unit : undefined;
}

export function isHierarchyQtyLocked(_unit?: HierarchyUnit, _units?: HierarchyUnit[]) {
  return false;
}

export function isHierarchyCostDerived(_unit?: HierarchyUnit, _units?: HierarchyUnit[]) {
  return false;
}

function assignBaseFlags<T extends HierarchyUnit>(units: T[]): T[] {
  const piece = enabledRole(units, "piece");
  const pack = enabledRole(units, "pack");
  const box = enabledRole(units, "box");
  const baseId = piece?.id ?? pack?.id ?? box?.id;
  if (!baseId) {
    const fallback = units.find((unit) => isUnitEnabled(unit)) ?? units[0];
    return units.map((unit) => ({ ...unit, isBaseUnit: Boolean(fallback && unit.id === fallback.id) }));
  }
  return units.map((unit) => ({ ...unit, isBaseUnit: unit.id === baseId }));
}

/** Load stored conversionQty as-is. Never force Piece/Pack/Box to 1. */
export function hydrateHierarchyQty<T extends HierarchyUnit>(units: T[]): T[] {
  return assignBaseFlags(units);
}

/** Keep each unit's own Qty in Base. Do not multiply or min-1. */
export function applyHierarchyConversions<T extends HierarchyUnit>(units: T[]): T[] {
  return hydrateHierarchyQty(units);
}

export function applyHierarchyConversionsAndCosts<T extends HierarchyUnit>(units: T[], _shareStock = true): T[] {
  return applyHierarchyConversions(units);
}

export function applyPersistedHierarchyCosts<T extends HierarchyUnit>(units: T[]): T[] {
  return applyHierarchyConversions(units);
}

export function applyConversionInput(current: ConversionDraftState, raw: string): ConversionDraftState {
  if (raw.trim() === "") {
    return { committed: null, draft: raw, error: true };
  }
  const parsed = parseIntegerQty(raw);
  if (parsed === null) {
    return { committed: current.committed, draft: raw, error: true };
  }
  return { committed: parsed, draft: raw, error: parsed <= 0 };
}

export function replaceConversionValue(from: string, to: string) {
  return applyConversionInput(applyConversionInput({
    committed: parseIntegerQty(from),
    draft: from,
    error: false,
  }, ""), to);
}

export function hierarchyQtyValue<T extends HierarchyUnit>(unit: T, _units?: T[]) {
  return parseIntegerQty(unit.conversionQty);
}

export function hierarchyRelationText<T extends HierarchyUnit>(unit: T, _units?: T[]) {
  const qty = hierarchyQtyValue(unit);
  const shown = qty === null ? "" : String(qty);
  const role = unitRole(unit.unitName);
  if (role === "piece") return `Piece = ${shown}`;
  if (role === "pack") return `1 Pack = ${shown} Pieces`;
  if (role === "box") return `1 Box = ${shown} Pieces`;
  return `Quantity = ${shown}`;
}

export function hierarchyQtyEditor<T extends HierarchyUnit>(unit: T, _units?: T[]): {
  locked: boolean;
  prefix: "1 Pack =" | "1 Box =" | "Quantity";
  suffix: "Pieces" | "Packs" | "";
  value: number | null;
} {
  const qty = hierarchyQtyValue(unit);
  const role = unitRole(unit.unitName);
  if (role === "piece") return { locked: false, prefix: "Quantity", suffix: "", value: qty };
  if (role === "pack") return { locked: false, prefix: "1 Pack =", suffix: "Pieces", value: qty };
  if (role === "box") return { locked: false, prefix: "1 Box =", suffix: "Pieces", value: qty };
  return { locked: false, prefix: "Quantity", suffix: "", value: qty };
}

export function retainInactiveUnit<T extends HierarchyUnit>(unit: T): T {
  return { ...unit };
}

export function persistUnitConversionQty(unit: Pick<HierarchyUnit, "conversionQty" | "status">) {
  const parsed = parseIntegerQty(unit.conversionQty);
  if (isUnitEnabled(unit)) {
    return parsePositiveIntQty(unit.conversionQty);
  }
  return parsed;
}
