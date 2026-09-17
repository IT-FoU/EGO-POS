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

export function isActiveUnitQtyInvalid(unit: Pick<HierarchyUnit, "conversionQty" | "status" | "unitName">) {
  if (!isUnitEnabled(unit)) return false;
  if (unitRole(unit.unitName) === "piece") return false;
  return parsePositiveIntQty(unit.conversionQty) === null;
}

function findRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  return units.find((unit) => unitRole(unit.unitName) === role);
}

function enabledRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  const unit = findRole(units, role);
  return unit && isUnitEnabled(unit) ? unit : undefined;
}

/** Piece is the base unit: quantity is always 1 and never editable. */
export function isHierarchyQtyLocked(unit?: HierarchyUnit, _units?: HierarchyUnit[]) {
  if (!unit) return false;
  return unitRole(unit.unitName) === "piece" && isUnitEnabled(unit);
}

/** Owner rule: costs stay independent per enabled unit. */
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

function isBlankQty(value: unknown) {
  return typeof value === "number" && Number.isNaN(value);
}

function resolvePackPieces<T extends HierarchyUnit>(units: T[]) {
  const pack = enabledRole(units, "pack");
  if (!pack) return null;
  return parsePositiveIntQty(pack.hierarchyQty) ?? parsePositiveIntQty(pack.conversionQty);
}

/**
 * Normalize hierarchy editor qty ↔ persisted base conversionQty.
 * Piece is always forced to 1 (including stale legacy Piece≠1).
 * Pack qty is Pieces. Box qty is Packs when Pack is enabled, else Pieces.
 * Stock math always uses conversionQty in base Pieces.
 */
export function hydrateHierarchyQty<T extends HierarchyUnit>(units: T[]): T[] {
  const withPieceAndPack = units.map((unit) => {
    const role = unitRole(unit.unitName);
    if (role === "piece") {
      return { ...unit, conversionQty: 1, hierarchyQty: 1 };
    }
    if (role === "pack") {
      if (isBlankQty(unit.hierarchyQty) || isBlankQty(unit.conversionQty)) {
        return { ...unit, conversionQty: Number.NaN, hierarchyQty: Number.NaN };
      }
      if (unit.hierarchyQty !== undefined) {
        const asInt = parseIntegerQty(unit.hierarchyQty);
        if (asInt === null) {
          return { ...unit, conversionQty: Number.NaN, hierarchyQty: Number.NaN };
        }
        return { ...unit, hierarchyQty: asInt, conversionQty: asInt };
      }
      const qty = parsePositiveIntQty(unit.conversionQty);
      if (qty === null) {
        const asInt = parseIntegerQty(unit.conversionQty);
        return { ...unit, conversionQty: asInt ?? unit.conversionQty, hierarchyQty: asInt ?? unit.hierarchyQty };
      }
      return { ...unit, hierarchyQty: qty, conversionQty: qty };
    }
    return unit;
  });

  const packPieces = resolvePackPieces(withPieceAndPack);

  const normalized = withPieceAndPack.map((unit) => {
    if (unitRole(unit.unitName) !== "box") return unit;
    if (isBlankQty(unit.hierarchyQty) || isBlankQty(unit.conversionQty)) {
      return { ...unit, conversionQty: Number.NaN, hierarchyQty: Number.NaN };
    }

    if (packPieces) {
      if (unit.hierarchyQty !== undefined) {
        const packsFromEditor = parseIntegerQty(unit.hierarchyQty);
        if (packsFromEditor === null) {
          return { ...unit, conversionQty: Number.NaN, hierarchyQty: Number.NaN };
        }
        if (packsFromEditor <= 0) {
          return { ...unit, hierarchyQty: packsFromEditor, conversionQty: packsFromEditor };
        }
        const expectedBase = packsFromEditor * packPieces;
        const basePieces = parsePositiveIntQty(unit.conversionQty);
        if (basePieces === null || basePieces !== expectedBase) {
          return { ...unit, hierarchyQty: packsFromEditor, conversionQty: expectedBase };
        }
        return { ...unit, hierarchyQty: packsFromEditor, conversionQty: basePieces };
      }
      const basePieces = parsePositiveIntQty(unit.conversionQty);
      if (basePieces !== null) {
        const packs = basePieces % packPieces === 0
          ? basePieces / packPieces
          : Math.max(1, Math.floor(basePieces / packPieces));
        return { ...unit, hierarchyQty: packs, conversionQty: basePieces };
      }
      const asInt = parseIntegerQty(unit.conversionQty);
      return { ...unit, conversionQty: asInt ?? unit.conversionQty, hierarchyQty: asInt ?? unit.hierarchyQty };
    }

    // Pack disabled: Box quantity is Pieces. Prefer stock conversionQty over stale pack count.
    if (unit.hierarchyQty !== undefined && parsePositiveIntQty(unit.conversionQty) === null) {
      const asInt = parseIntegerQty(unit.hierarchyQty);
      if (asInt === null) {
        return { ...unit, conversionQty: Number.NaN, hierarchyQty: Number.NaN };
      }
      return { ...unit, hierarchyQty: asInt, conversionQty: asInt };
    }
    const pieces = parsePositiveIntQty(unit.conversionQty) ?? parsePositiveIntQty(unit.hierarchyQty);
    if (pieces !== null) {
      return { ...unit, hierarchyQty: pieces, conversionQty: pieces };
    }
    const asInt = parseIntegerQty(unit.hierarchyQty) ?? parseIntegerQty(unit.conversionQty);
    return { ...unit, conversionQty: asInt ?? unit.conversionQty, hierarchyQty: asInt ?? unit.hierarchyQty };
  });

  return assignBaseFlags(normalized);
}

/** Recompute base conversionQty from hierarchy editor values. Costs are never derived. */
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

export function hierarchyQtyValue<T extends HierarchyUnit>(unit: T, units?: T[]) {
  if (isHierarchyQtyLocked(unit, units)) return 1;
  const fromHierarchy = parseIntegerQty(unit.hierarchyQty);
  if (fromHierarchy !== null) return fromHierarchy;
  return parseIntegerQty(unit.conversionQty);
}

export function hierarchyRelationText<T extends HierarchyUnit>(unit: T, units: T[] = []) {
  const qty = hierarchyQtyValue(unit, units);
  const shown = qty === null ? "" : String(qty);
  const role = unitRole(unit.unitName);
  if (role === "piece") return `Piece = ${shown}`;
  if (role === "pack") return `1 Pack = ${shown} Pieces`;
  if (role === "box") {
    return enabledRole(units, "pack")
      ? `1 Box = ${shown} Packs`
      : `1 Box = ${shown} Pieces`;
  }
  return `Quantity = ${shown}`;
}

export function hierarchyQtyEditor<T extends HierarchyUnit>(unit: T, units: T[] = []): {
  locked: boolean;
  prefix: "1 Pack =" | "1 Box =" | "Quantity";
  suffix: "Pieces" | "Packs" | "";
  value: number | null;
} {
  const qty = hierarchyQtyValue(unit, units);
  const role = unitRole(unit.unitName);
  if (role === "piece") return { locked: true, prefix: "Quantity", suffix: "", value: 1 };
  if (role === "pack") return { locked: false, prefix: "1 Pack =", suffix: "Pieces", value: qty };
  if (role === "box") {
    if (enabledRole(units, "pack")) {
      return { locked: false, prefix: "1 Box =", suffix: "Packs", value: qty };
    }
    return { locked: false, prefix: "1 Box =", suffix: "Pieces", value: qty };
  }
  return { locked: false, prefix: "Quantity", suffix: "", value: qty };
}

export function retainInactiveUnit<T extends HierarchyUnit>(unit: T): T {
  return { ...unit };
}

export function persistUnitConversionQty(unit: Pick<HierarchyUnit, "conversionQty" | "status" | "unitName">) {
  if (unitRole(unit.unitName) === "piece") return 1;
  const parsed = parseIntegerQty(unit.conversionQty);
  if (isUnitEnabled(unit)) {
    return parsePositiveIntQty(unit.conversionQty);
  }
  return parsed;
}
