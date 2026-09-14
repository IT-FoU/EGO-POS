import { isUnitEnabled } from "@/features/products/unit-hierarchy";

export type UnitImageOrigin = "inherited" | "custom" | "none";
export type ProductImageAssignmentMode = "all" | "base";

export type AssignableProductImage = {
  id: string;
  storagePath?: string;
  url?: string;
};

export type AssignableUnit = {
  id: string;
  imageUrl?: string;
  isBaseUnit?: boolean;
  status?: "active" | "inactive";
  unitName?: string;
};

export function productImageRef(image: AssignableProductImage) {
  return image.storagePath ?? image.id;
}

export function unitUsesProductImage(unit: AssignableUnit, image?: AssignableProductImage | null) {
  if (!unit.imageUrl || !image) return false;
  return unit.imageUrl === image.id || Boolean(image.storagePath && unit.imageUrl === image.storagePath);
}

export function inferUnitImageOrigin(unit: AssignableUnit, productImage?: AssignableProductImage | null): UnitImageOrigin {
  if (!unit.imageUrl) return "none";
  if (unitUsesProductImage(unit, productImage)) return "inherited";
  return "custom";
}

export function inferAssignmentMode(
  units: AssignableUnit[],
  productImage?: AssignableProductImage | null,
): ProductImageAssignmentMode | null {
  if (!productImage) return null;
  const inheritedNonBase = units.some((unit) => !unit.isBaseUnit && inferUnitImageOrigin(unit, productImage) === "inherited");
  if (inheritedNonBase) return "all";
  const baseInherited = units.some((unit) => unit.isBaseUnit && inferUnitImageOrigin(unit, productImage) === "inherited");
  return baseInherited ? "base" : null;
}

export function inferUnitImageOrigins(
  units: AssignableUnit[],
  productImage?: AssignableProductImage | null,
): Record<string, UnitImageOrigin> {
  return Object.fromEntries(units.map((unit) => [unit.id, inferUnitImageOrigin(unit, productImage)]));
}

export function isProtectedCustomUnit(
  unitId: string,
  origins: Record<string, UnitImageOrigin>,
) {
  return origins[unitId] === "custom";
}

function isAssignableUnit(unit: AssignableUnit) {
  return isUnitEnabled(unit);
}

export function applyProductImageAssignment<T extends AssignableUnit>(options: {
  image: AssignableProductImage;
  mode: ProductImageAssignmentMode;
  origins: Record<string, UnitImageOrigin>;
  /** When true, leave units already marked custom untouched (main-image replace path). */
  protectCustom?: boolean;
  units: T[];
}): { origins: Record<string, UnitImageOrigin>; units: T[] } {
  const imageRef = productImageRef(options.image);
  const origins = { ...options.origins };
  const protectCustom = options.protectCustom ?? false;
  const units = options.units.map((unit) => {
    // Disabled units never receive new assignments and must not keep this image visible.
    if (!isAssignableUnit(unit)) {
      if (unitUsesProductImage(unit, options.image)) {
        origins[unit.id] = "none";
        return { ...unit, imageUrl: undefined };
      }
      return unit;
    }
    if (protectCustom && isProtectedCustomUnit(unit.id, origins)) return unit;
    const shouldAssign = options.mode === "all" || Boolean(unit.isBaseUnit);
    if (!shouldAssign) {
      // Base-only: clear this image from non-base units so Pack/Box do not keep it.
      if (options.mode === "base" && unitUsesProductImage(unit, options.image)) {
        origins[unit.id] = "none";
        return { ...unit, imageUrl: undefined };
      }
      return unit;
    }
    origins[unit.id] = "inherited";
    return { ...unit, imageUrl: imageRef };
  });
  return { origins, units };
}

export function replaceInheritedProductImage<T extends AssignableUnit>(options: {
  image: AssignableProductImage;
  origins: Record<string, UnitImageOrigin>;
  units: T[];
}): { origins: Record<string, UnitImageOrigin>; units: T[] } {
  const imageRef = productImageRef(options.image);
  const origins = { ...options.origins };
  const units = options.units.map((unit) => {
    if (origins[unit.id] !== "inherited") return unit;
    origins[unit.id] = "inherited";
    return { ...unit, imageUrl: imageRef };
  });
  return { origins, units };
}

export function assignImageToNewUnit<T extends AssignableUnit>(options: {
  image?: AssignableProductImage | null;
  mode: ProductImageAssignmentMode | null;
  origins: Record<string, UnitImageOrigin>;
  unit: T;
}): { origin: UnitImageOrigin; unit: T } {
  if (!options.image || !options.mode) {
    return { origin: "none", unit: options.unit };
  }
  if (options.mode === "all" || options.unit.isBaseUnit) {
    return {
      origin: "inherited",
      unit: { ...options.unit, imageUrl: productImageRef(options.image) },
    };
  }
  return { origin: "none", unit: { ...options.unit, imageUrl: undefined } };
}

export function markUnitImageChoice(
  _unitId: string,
  nextImageUrl: string | undefined,
  image: AssignableProductImage | undefined,
): UnitImageOrigin {
  if (!nextImageUrl) return "none";
  if (image && (nextImageUrl === image.id || nextImageUrl === image.storagePath)) {
    return "custom";
  }
  return "custom";
}

/** Toggle one ACTIVE unit on/off for a specific uploaded image. Disabled units are ignored. */
export function toggleUnitImageAssignment<T extends AssignableUnit>(options: {
  assign: boolean;
  image: AssignableProductImage;
  mainImage?: AssignableProductImage | null;
  origins: Record<string, UnitImageOrigin>;
  unitId: string;
  units: T[];
}): { origins: Record<string, UnitImageOrigin>; units: T[] } {
  const imageRef = productImageRef(options.image);
  const origins = { ...options.origins };
  const units = options.units.map((unit) => {
    if (unit.id !== options.unitId) return unit;
    if (!isAssignableUnit(unit)) return unit;
    if (options.assign) {
      const inherited = Boolean(options.mainImage && productImageRef(options.mainImage) === imageRef);
      origins[unit.id] = inherited ? "inherited" : "custom";
      return { ...unit, imageUrl: imageRef };
    }
    origins[unit.id] = "none";
    return { ...unit, imageUrl: undefined };
  });
  return { origins, units };
}

export function clearImageAssignments<T extends AssignableUnit>(options: {
  image: AssignableProductImage;
  origins: Record<string, UnitImageOrigin>;
  units: T[];
}): { origins: Record<string, UnitImageOrigin>; units: T[] } {
  const origins = { ...options.origins };
  const units = options.units.map((unit) => {
    if (!unitUsesProductImage(unit, options.image)) return unit;
    origins[unit.id] = "none";
    return { ...unit, imageUrl: undefined };
  });
  return { origins, units };
}

export function unitImageSelectValue(unit: AssignableUnit, images: AssignableProductImage[]) {
  if (!unit.imageUrl) return "";
  const match = images.find((image) => unit.imageUrl === image.id || (image.storagePath && unit.imageUrl === image.storagePath));
  return match ? productImageRef(match) : unit.imageUrl;
}

export function findImageForUnit(unit: AssignableUnit, images: AssignableProductImage[]) {
  if (!unit.imageUrl) return undefined;
  return images.find((image) => unit.imageUrl === image.id || (image.storagePath && unit.imageUrl === image.storagePath));
}

/** Display priority: unit-specific → main product image fallback → none. */
export function resolveUnitImageDisplay(
  unit: AssignableUnit,
  images: AssignableProductImage[],
  mainImage?: AssignableProductImage | null,
  options?: {
    /** When false, skip main-image fallback (Create/Edit assignment UI). Default true for POS. */
    allowMainFallback?: boolean;
    /** When true, disabled units never show an assigned/fallback image. */
    hideDisabledAssignment?: boolean;
  },
): {
  image?: AssignableProductImage;
  origin: UnitImageOrigin | "fallback";
} {
  if (options?.hideDisabledAssignment && !isAssignableUnit(unit)) {
    return { origin: "none" };
  }
  const assigned = findImageForUnit(unit, images);
  if (assigned) {
    const inherited = Boolean(mainImage && unitUsesProductImage(unit, mainImage));
    return { image: assigned, origin: inherited ? "inherited" : "custom" };
  }
  const allowFallback = options?.allowMainFallback !== false;
  if (allowFallback && mainImage && (mainImage.url || mainImage.storagePath || mainImage.id)) {
    return { image: mainImage, origin: "fallback" };
  }
  return { origin: "none" };
}

export function inheritedUnitIds(units: AssignableUnit[], origins: Record<string, UnitImageOrigin>) {
  return units.filter((unit) => origins[unit.id] === "inherited").map((unit) => unit.id);
}

export function unitsAssignedToImage(units: AssignableUnit[], image: AssignableProductImage) {
  return units.filter((unit) => unitUsesProductImage(unit, image));
}

export function activeAssignableUnits<T extends AssignableUnit>(units: T[]) {
  return units.filter((unit) => isAssignableUnit(unit));
}
