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

function findRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  return units.find((unit) => unitRole(unit.unitName) === role);
}

function enabledRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  const unit = findRole(units, role);
  return unit && isUnitEnabled(unit) ? unit : undefined;
}

export function isHierarchyQtyLocked<T extends HierarchyUnit>(unit: T, _units?: T[]) {
  return unitRole(unit.unitName) === "piece";
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

function normalizeUnitQty<T extends HierarchyUnit>(unit: T): T {
  if (unitRole(unit.unitName) === "piece") {
    return { ...unit, conversionQty: 1 };
  }
  const qty = parsePositiveIntQty(unit.conversionQty);
  return qty === null ? unit : { ...unit, conversionQty: qty };
}

/** V2: load stored conversionQty as-is. Piece is always 1. Never reinterpret Box as Packs. */
export function hydrateHierarchyQty<T extends HierarchyUnit>(units: T[]): T[] {
  return assignBaseFlags(units.map((unit) => normalizeUnitQty(unit)));
}

/** V2: keep each unit's own cumulative Qty in Base. Do not multiply Pack/Box from parents. */
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
  const parsed = parsePositiveIntQty(raw);
  if (parsed === null) {
    return { committed: current.committed, draft: raw, error: true };
  }
  return { committed: parsed, draft: raw, error: false };
}

export function replaceConversionValue(from: string, to: string) {
  return applyConversionInput(applyConversionInput({
    committed: parsePositiveIntQty(from),
    draft: from,
    error: false,
  }, ""), to);
}

export function hierarchyQtyValue<T extends HierarchyUnit>(unit: T, _units?: T[]) {
  if (unitRole(unit.unitName) === "piece") return 1;
  return parsePositiveIntQty(unit.conversionQty) ?? 1;
}

export function hierarchyRelationText<T extends HierarchyUnit>(unit: T, _units?: T[]) {
  const qty = hierarchyQtyValue(unit);
  const role = unitRole(unit.unitName);
  if (role === "piece") return "Piece = 1";
  if (role === "pack") return `1 Pack = ${qty} Pieces`;
  if (role === "box") return `1 Box = ${qty} Pieces`;
  return `Quantity = ${qty}`;
}

export function hierarchyQtyEditor<T extends HierarchyUnit>(unit: T, _units?: T[]): {
  locked: boolean;
  prefix: "1 Pack =" | "1 Box =" | "Quantity";
  suffix: "Pieces" | "Packs" | "";
  value: number;
} {
  const qty = hierarchyQtyValue(unit);
  const role = unitRole(unit.unitName);
  if (role === "piece") return { locked: true, prefix: "Quantity", suffix: "", value: 1 };
  if (role === "pack") return { locked: false, prefix: "1 Pack =", suffix: "Pieces", value: qty };
  if (role === "box") return { locked: false, prefix: "1 Box =", suffix: "Pieces", value: qty };
  return { locked: false, prefix: "Quantity", suffix: "", value: qty };
}

export function retainInactiveUnit<T extends HierarchyUnit>(unit: T): T {
  return { ...unit };
}
