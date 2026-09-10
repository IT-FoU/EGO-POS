import {
  conversionMillis,
  deriveSharedUnitCost,
  toLakInteger,
} from "@/features/products/unit-pricing-math";

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
  const parsed = typeof value === "number" ? value : Number(value);
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
      return { ...unit, conversionQty: 1, hierarchyQty: 1 };
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

export function isHierarchyQtyLocked<T extends HierarchyUnit>(unit: T, units: T[]) {
  const role = unitRole(unit.unitName);
  const pieceOn = Boolean(enabledRole(units, "piece"));
  const packOn = Boolean(enabledRole(units, "pack"));
  const boxOn = Boolean(enabledRole(units, "box"));
  if (role === "piece" && pieceOn) return true;
  if (role === "pack" && packOn && !pieceOn) return true;
  if (role === "box" && boxOn && !packOn && !pieceOn) return true;
  return false;
}

export function isHierarchyCostDerived<T extends HierarchyUnit>(unit: T, units: T[]) {
  if (!isUnitEnabled(unit)) return false;
  const role = unitRole(unit.unitName);
  const pieceOn = Boolean(enabledRole(units, "piece"));
  const packOn = Boolean(enabledRole(units, "pack"));
  if (role === "pack" && pieceOn) return true;
  if (role === "box" && (packOn || pieceOn)) return true;
  return false;
}

export function hierarchyQtyLabelKey<T extends HierarchyUnit>(unit: T, units: T[]) {
  const role = unitRole(unit.unitName);
  if (role === "pack" && enabledRole(units, "piece")) return "piecesPerPack" as const;
  if (role === "box" && enabledRole(units, "pack")) return "packsPerBox" as const;
  if (role === "box" && enabledRole(units, "piece")) return "piecesPerBox" as const;
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

export function applyHierarchyConversionsAndCosts<T extends HierarchyUnit>(units: T[], shareStock = true): T[] {
  const next = assignBaseFlags(hydrateHierarchyQty(units));
  const piece = findRole(next, "piece");
  const pack = findRole(next, "pack");
  const box = findRole(next, "box");
  const pieceOn = Boolean(piece && isUnitEnabled(piece));
  const packOn = Boolean(pack && isUnitEnabled(pack));
  const boxOn = Boolean(box && isUnitEnabled(box));

  if (piece && pieceOn) {
    piece.hierarchyQty = 1;
    piece.conversionQty = 1;
    piece.costPriceLak = toLakInteger(piece.costPriceLak);
  }

  if (pack && packOn) {
    if (pieceOn && piece) {
      const piecesPerPack = parsePositiveQty(pack.hierarchyQty) ?? parsePositiveQty(pack.conversionQty) ?? 1;
      pack.hierarchyQty = piecesPerPack;
      pack.conversionQty = piecesPerPack;
      if (shareStock) {
        pack.costPriceLak = deriveSharedUnitCost(Number(piece.costPriceLak ?? 0), 1, piecesPerPack);
      }
    } else {
      pack.hierarchyQty = 1;
      pack.conversionQty = 1;
      pack.costPriceLak = toLakInteger(pack.costPriceLak);
    }
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
      if (shareStock) {
        box.costPriceLak = deriveSharedUnitCost(Number(pack.costPriceLak ?? 0), Number(pack.conversionQty), Number(box.conversionQty));
      }
    } else if (pieceOn && piece) {
      const piecesPerBox = parsePositiveQty(box.hierarchyQty) ?? parsePositiveQty(box.conversionQty) ?? 1;
      box.hierarchyQty = piecesPerBox;
      box.conversionQty = piecesPerBox;
      if (shareStock) {
        box.costPriceLak = deriveSharedUnitCost(Number(piece.costPriceLak ?? 0), 1, piecesPerBox);
      }
    } else {
      box.hierarchyQty = 1;
      box.conversionQty = 1;
      box.costPriceLak = toLakInteger(box.costPriceLak);
    }
  }

  if (shareStock) {
    const base = next.find((unit) => unit.isBaseUnit && isUnitEnabled(unit));
    if (base) {
      for (const unit of next) {
        if (!isUnitEnabled(unit) || unit.id === base.id) continue;
        if (unitRole(unit.unitName) !== "custom") continue;
        const qty = parsePositiveQty(unit.hierarchyQty) ?? parsePositiveQty(unit.conversionQty) ?? 1;
        unit.hierarchyQty = qty;
        unit.conversionQty = qty;
        unit.costPriceLak = deriveSharedUnitCost(Number(base.costPriceLak ?? 0), Number(base.conversionQty), qty);
      }
    }
  }

  return assignBaseFlags(next);
}

export function applyPersistedHierarchyCosts<T extends HierarchyUnit>(units: T[]): T[] {
  return applyHierarchyConversionsAndCosts(hydrateHierarchyQty(units), true);
}

export function hierarchyQtyValue<T extends HierarchyUnit>(unit: T, units: T[]) {
  if (isHierarchyQtyLocked(unit, units)) return 1;
  return parsePositiveQty(unit.hierarchyQty) ?? parsePositiveQty(unit.conversionQty) ?? 1;
}

export function hierarchyRelationText<T extends HierarchyUnit>(unit: T, units: T[]) {
  const qty = hierarchyQtyValue(unit, units);
  const role = unitRole(unit.unitName);
  if (role === "piece") return "Piece = 1";
  if (role === "pack" && enabledRole(units, "piece")) return `1 Pack = ${qty} Pieces`;
  if (role === "pack") return "Pack = 1";
  if (role === "box" && enabledRole(units, "pack")) return `1 Box = ${qty} Packs`;
  if (role === "box" && enabledRole(units, "piece")) return `1 Box = ${qty} Pieces`;
  if (role === "box") return "Box = 1";
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
  if (role === "piece") return { locked: true, prefix: "Quantity", suffix: "", value: 1 };
  if (role === "pack" && enabledRole(units, "piece")) {
    return { locked: false, prefix: "1 Pack =", suffix: "Pieces", value: qty };
  }
  if (role === "box" && enabledRole(units, "pack")) {
    return { locked: false, prefix: "1 Box =", suffix: "Packs", value: qty };
  }
  if (role === "box" && enabledRole(units, "piece")) {
    return { locked: false, prefix: "1 Box =", suffix: "Pieces", value: qty };
  }
  if (isHierarchyQtyLocked(unit, units)) {
    return { locked: true, prefix: "Quantity", suffix: "", value: 1 };
  }
  return { locked: false, prefix: "Quantity", suffix: "", value: qty };
}

export function derivedCostBreakdown<T extends HierarchyUnit>(unit: T, units: T[]) {
  if (!isHierarchyCostDerived(unit, units)) return null;
  const role = unitRole(unit.unitName);
  const qty = hierarchyQtyValue(unit, units);
  if (role === "pack") {
    const piece = enabledRole(units, "piece");
    if (!piece) return null;
    return {
      left: toLakInteger(piece.costPriceLak),
      qty,
      result: toLakInteger(unit.costPriceLak),
    };
  }
  if (role === "box") {
    const pack = enabledRole(units, "pack");
    const piece = enabledRole(units, "piece");
    const source = pack ?? piece;
    if (!source) return null;
    return {
      left: toLakInteger(source.costPriceLak),
      qty,
      result: toLakInteger(unit.costPriceLak),
    };
  }
  return null;
}
