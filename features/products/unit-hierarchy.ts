import { conversionMillis } from "@/features/products/unit-pricing-math";

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

export function multiplyQty(left: number, right: number) {
  const leftMillis = conversionMillis(left);
  const rightMillis = conversionMillis(right);
  if (leftMillis <= 0n || rightMillis <= 0n) return 0;
  return Number(leftMillis * rightMillis) / 1_000_000;
}

function findRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  return units.find((unit) => unitRole(unit.unitName) === role);
}

function enabledRole<T extends HierarchyUnit>(units: T[], role: UnitRole) {
  const unit = findRole(units, role);
  return unit && isUnitEnabled(unit) ? unit : undefined;
}

export function hydrateHierarchyQty<T extends HierarchyUnit>(units: T[]): T[] {
  const pack = findRole(units, "pack");
  const piece = findRole(units, "piece");
  return units.map((unit) => {
    if (parsePositiveQty(unit.hierarchyQty) !== null) return unit;
    const conversion = parsePositiveQty(unit.conversionQty) ?? 1;
    const role = unitRole(unit.unitName);
    if (role === "piece") {
      return { ...unit, conversionQty: conversion, hierarchyQty: conversion };
    }
    if (role === "pack") {
      const pieceQty = piece && isUnitEnabled(piece) ? (parsePositiveQty(piece.conversionQty) ?? 1) : 1;
      return { ...unit, hierarchyQty: conversion / pieceQty };
    }
    if (role === "box") {
      if (pack && isUnitEnabled(pack)) {
        const packQty = parsePositiveQty(pack.conversionQty) ?? 1;
        return { ...unit, hierarchyQty: conversion / packQty };
      }
      const pieceQty = piece && isUnitEnabled(piece) ? (parsePositiveQty(piece.conversionQty) ?? 1) : 1;
      return { ...unit, hierarchyQty: conversion / pieceQty };
    }
    return { ...unit, hierarchyQty: conversion };
  });
}

export function isHierarchyQtyLocked<T extends HierarchyUnit>(_unit: T, _units: T[]) {
  return false;
}

export function isHierarchyCostDerived(_unit?: HierarchyUnit, _units?: HierarchyUnit[]) {
  return false;
}

export function hierarchyQtyLabelKey<T extends HierarchyUnit>(unit: T, units: T[]) {
  const role = unitRole(unit.unitName);
  if (role === "pack") return "piecesPerPack" as const;
  if (role === "box" && enabledRole(units, "pack")) return "packsPerBox" as const;
  if (role === "box") return "piecesPerBox" as const;
  return "qtyInBase" as const;
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

export function applyHierarchyConversions<T extends HierarchyUnit>(units: T[]): T[] {
  const next = assignBaseFlags(hydrateHierarchyQty(units));
  const piece = findRole(next, "piece");
  const pack = findRole(next, "pack");
  const box = findRole(next, "box");
  const pieceOn = Boolean(piece && isUnitEnabled(piece));
  const packOn = Boolean(pack && isUnitEnabled(pack));
  const boxOn = Boolean(box && isUnitEnabled(box));

  if (piece && pieceOn) {
    const qty = parsePositiveQty(piece.hierarchyQty) ?? parsePositiveQty(piece.conversionQty) ?? 1;
    piece.hierarchyQty = qty;
    piece.conversionQty = qty;
  }

  if (pack && packOn) {
    const piecesPerPack = parsePositiveQty(pack.hierarchyQty) ?? parsePositiveQty(pack.conversionQty) ?? 1;
    pack.hierarchyQty = piecesPerPack;
    pack.conversionQty = pieceOn && piece
      ? multiplyQty(Number(piece.conversionQty), piecesPerPack)
      : piecesPerPack;
  }

  if (box && boxOn) {
    if (packOn && pack) {
      const packsPerBox = parsePositiveQty(box.hierarchyQty) ?? (
        (parsePositiveQty(pack.conversionQty) ?? 1) > 0
          ? (parsePositiveQty(box.conversionQty) ?? 1) / (parsePositiveQty(pack.conversionQty) ?? 1)
          : 1
      );
      box.hierarchyQty = packsPerBox;
      box.conversionQty = multiplyQty(Number(pack.conversionQty), packsPerBox);
    } else if (pieceOn && piece) {
      const piecesPerBox = parsePositiveQty(box.hierarchyQty) ?? parsePositiveQty(box.conversionQty) ?? 1;
      box.hierarchyQty = piecesPerBox;
      box.conversionQty = multiplyQty(Number(piece.conversionQty), piecesPerBox);
    } else {
      const piecesPerBox = parsePositiveQty(box.hierarchyQty) ?? parsePositiveQty(box.conversionQty) ?? 1;
      box.hierarchyQty = piecesPerBox;
      box.conversionQty = piecesPerBox;
    }
  }

  for (const unit of next) {
    if (!isUnitEnabled(unit) || unitRole(unit.unitName) !== "custom") continue;
    const qty = parsePositiveQty(unit.hierarchyQty) ?? parsePositiveQty(unit.conversionQty) ?? 1;
    unit.hierarchyQty = qty;
    unit.conversionQty = qty;
  }

  return assignBaseFlags(next);
}

export function applyHierarchyConversionsAndCosts<T extends HierarchyUnit>(units: T[], _shareStock = true): T[] {
  return applyHierarchyConversions(units);
}

export function applyPersistedHierarchyCosts<T extends HierarchyUnit>(units: T[]): T[] {
  return applyHierarchyConversions(hydrateHierarchyQty(units));
}

export function applyConversionInput(current: ConversionDraftState, raw: string): ConversionDraftState {
  const parsed = parsePositiveQty(raw);
  if (parsed === null) {
    return { committed: current.committed, draft: raw, error: true };
  }
  return { committed: parsed, draft: raw, error: false };
}

export function replaceConversionValue(from: string, to: string) {
  return applyConversionInput(applyConversionInput({
    committed: parsePositiveQty(from),
    draft: from,
    error: false,
  }, ""), to);
}

export function hierarchyQtyValue<T extends HierarchyUnit>(unit: T, _units: T[]) {
  return parsePositiveQty(unit.hierarchyQty) ?? parsePositiveQty(unit.conversionQty) ?? 1;
}

export function hierarchyRelationText<T extends HierarchyUnit>(unit: T, units: T[]) {
  const qty = hierarchyQtyValue(unit, units);
  const role = unitRole(unit.unitName);
  if (role === "piece") return `Piece = ${qty}`;
  if (role === "pack") return `1 Pack = ${qty} Pieces`;
  if (role === "box" && enabledRole(units, "pack")) return `1 Box = ${qty} Packs`;
  if (role === "box") return `1 Box = ${qty} Pieces`;
  return `Quantity = ${qty}`;
}

export function hierarchyQtyEditor<T extends HierarchyUnit>(unit: T, units: T[]): {
  locked: boolean;
  prefix: "1 Pack =" | "1 Box =" | "Quantity";
  suffix: "Pieces" | "Packs" | "";
  value: number;
} {
  const qty = hierarchyQtyValue(unit, units);
  const role = unitRole(unit.unitName);
  if (role === "piece") return { locked: false, prefix: "Quantity", suffix: "", value: qty };
  if (role === "pack") return { locked: false, prefix: "1 Pack =", suffix: "Pieces", value: qty };
  if (role === "box" && enabledRole(units, "pack")) {
    return { locked: false, prefix: "1 Box =", suffix: "Packs", value: qty };
  }
  if (role === "box") return { locked: false, prefix: "1 Box =", suffix: "Pieces", value: qty };
  return { locked: false, prefix: "Quantity", suffix: "", value: qty };
}
