export type UnitImageOrigin = "inherited" | "custom" | "none";
export type ProductImageAssignmentMode = "all" | "base";

export type AssignableProductImage = {
  id: string;
  storagePath?: string;
};

export type AssignableUnit = {
  id: string;
  imageUrl?: string;
  isBaseUnit?: boolean;
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

export function applyProductImageAssignment<T extends AssignableUnit>(options: {
  image: AssignableProductImage;
  mode: ProductImageAssignmentMode;
  origins: Record<string, UnitImageOrigin>;
  units: T[];
}): { origins: Record<string, UnitImageOrigin>; units: T[] } {
  const imageRef = productImageRef(options.image);
  const origins = { ...options.origins };
  const units = options.units.map((unit) => {
    if (isProtectedCustomUnit(unit.id, origins)) {
      return unit;
    }
    const shouldAssign = options.mode === "all" || Boolean(unit.isBaseUnit);
    if (!shouldAssign) {
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
  unitId: string,
  nextImageUrl: string | undefined,
  image: AssignableProductImage | undefined,
): UnitImageOrigin {
  if (!nextImageUrl) return "none";
  if (image && (nextImageUrl === image.id || nextImageUrl === image.storagePath)) {
    return "custom";
  }
  return "custom";
}

export function unitImageSelectValue(unit: AssignableUnit, images: AssignableProductImage[]) {
  if (!unit.imageUrl) return "";
  const match = images.find((image) => unit.imageUrl === image.id || (image.storagePath && unit.imageUrl === image.storagePath));
  return match ? productImageRef(match) : unit.imageUrl;
}

export function inheritedUnitIds(units: AssignableUnit[], origins: Record<string, UnitImageOrigin>) {
  return units.filter((unit) => origins[unit.id] === "inherited").map((unit) => unit.id);
}
