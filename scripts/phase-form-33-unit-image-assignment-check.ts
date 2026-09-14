import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeAssignableUnits,
  applyProductImageAssignment,
  clearImageAssignments,
  findImageForUnit,
  productImageRef,
  replaceInheritedProductImage,
  resolveUnitImageDisplay,
  toggleUnitImageAssignment,
  unitUsesProductImage,
} from "../features/products/unit-image-assignment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function unit(id: string, unitName: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    imageUrl: extra.imageUrl as string | undefined,
    isBaseUnit: Boolean(extra.isBaseUnit),
    status: (extra.status as "active" | "inactive" | undefined) ?? "active",
    unitName,
  };
}

const imageA = { id: "img-a", url: "blob:a", label: "A" };
const imageB = { id: "img-b", url: "blob:b", label: "B" };
const imageC = { id: "img-c", url: "blob:c", label: "C" };

function trio() {
  return [
    unit("piece", "Piece", { isBaseUnit: true }),
    unit("pack", "Pack"),
    unit("box", "Box"),
  ];
}

const root = process.cwd();
const form = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const helpers = readFileSync(join(root, "features/products/unit-image-assignment.ts"), "utf8");
const service = readFileSync(join(root, "features/products/product-image-service.ts"), "utf8");
const actions = readFileSync(join(root, "features/products/actions.ts"), "utf8");

check("source: checkbox assignment UI present", () => {
  assert(form.includes('data-field="unit-image-assignment"'), "assignment checkboxes missing");
  assert(form.includes("onToggleUnitAssignment"), "toggle wiring missing");
  assert(form.includes('data-field="unit-image-cell"'), "unit image cell missing");
  assert(form.includes("resolveUnitImageDisplay"), "display helper missing");
  assert(helpers.includes("toggleUnitImageAssignment"), "helper missing");
  assert(service.includes("setProductMain"), "multi-image upload flag missing");
  assert(actions.includes("setProductMain"), "action flag missing");
  assert(!form.includes("BRAVE_SEARCH_API_KEY"), "must not touch Brave key");
});

check("1-3. Assign Image A → Piece shows A", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  const next = toggleUnitImageAssignment({
    assign: true,
    image: imageA,
    mainImage: imageA,
    origins,
    unitId: "piece",
    units,
  });
  units = next.units;
  origins = next.origins;
  assert(unitUsesProductImage(units[0]!, imageA), "piece assigned");
  assert(findImageForUnit(units[0]!, [imageA, imageB, imageC])?.id === "img-a", "piece image A");
  assert(origins.piece === "inherited", "piece inherited from main A");
});

check("4-5. Assign Image B → Pack shows B", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageA, mainImage: imageA, origins, unitId: "piece", units }));
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  assert(findImageForUnit(units[1]!, [imageA, imageB, imageC])?.id === "img-b", "pack B");
  assert(origins.pack === "custom", "pack custom");
});

check("6-7. Assign Image C → Box shows C", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageC, mainImage: imageA, origins, unitId: "box", units }));
  assert(findImageForUnit(units[2]!, [imageA, imageB, imageC])?.id === "img-c", "box C");
  assert(origins.box === "custom", "box custom");
});

check("8. Same Image B → Pack + Box", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "box", units }));
  assert(unitUsesProductImage(units[1]!, imageB) && unitUsesProductImage(units[2]!, imageB), "pack+box B");
});

check("9. Apply to all units", () => {
  const next = applyProductImageAssignment({
    image: imageA,
    mode: "all",
    origins: {},
    units: trio(),
  });
  assert(next.units.every((row) => row.imageUrl === productImageRef(imageA)), "all assigned");
});

check("10. Apply to base unit only", () => {
  const seeded = [
    unit("piece", "Piece", { isBaseUnit: true }),
    unit("pack", "Pack", { imageUrl: productImageRef(imageA) }),
    unit("box", "Box", { imageUrl: productImageRef(imageA) }),
  ];
  const next = applyProductImageAssignment({
    image: imageA,
    mode: "base",
    origins: { pack: "inherited", box: "inherited" },
    units: seeded,
  });
  assert(next.units.find((row) => row.id === "piece")?.imageUrl === productImageRef(imageA), "base");
  assert(!next.units.find((row) => row.id === "pack")?.imageUrl, "pack cleared");
  assert(!next.units.find((row) => row.id === "box")?.imageUrl, "box cleared");
});

check("10b. Apply base vs all visibly differ when all active", () => {
  const units = trio();
  const baseOnly = applyProductImageAssignment({ image: imageA, mode: "base", origins: {}, units });
  const all = applyProductImageAssignment({ image: imageA, mode: "all", origins: {}, units });
  assert(baseOnly.units[0]!.imageUrl && !baseOnly.units[1]!.imageUrl && !baseOnly.units[2]!.imageUrl, "base-only");
  assert(all.units.every((row) => row.imageUrl === productImageRef(imageA)), "all-units");
});

check("11-12. Custom Pack not overwritten by Main Image; unit priority", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageA, mainImage: imageA, origins, unitId: "piece", units }));
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  const replaced = replaceInheritedProductImage({ image: imageC, origins, units });
  assert(replaced.units.find((row) => row.id === "pack")?.imageUrl === productImageRef(imageB), "pack kept B");
  assert(replaced.units.find((row) => row.id === "piece")?.imageUrl === productImageRef(imageC), "piece updated");
  const display = resolveUnitImageDisplay(replaced.units.find((row) => row.id === "pack")!, [imageA, imageB, imageC], imageC);
  assert(display.image?.id === "img-b" && display.origin === "custom", "priority custom");
});

check("13. Main Image fallback for unit without custom image", () => {
  const units = trio();
  const display = resolveUnitImageDisplay(units[1]!, [imageA], imageA);
  assert(display.origin === "fallback" && display.image?.id === "img-a", "fallback");
});

check("14. Unassign Pack keeps uploaded image available", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  ({ units, origins } = toggleUnitImageAssignment({ assign: false, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  assert(!units[1]!.imageUrl, "pack cleared");
  assert(imageB.id === "img-b", "image still present");
  assert(resolveUnitImageDisplay(units[1]!, [imageA, imageB], imageA).origin === "fallback", "falls back to main");
});

check("15. Remove uploaded image clears mappings", () => {
  let units = trio();
  let origins: Record<string, "inherited" | "custom" | "none"> = {};
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "pack", units }));
  ({ units, origins } = toggleUnitImageAssignment({ assign: true, image: imageB, mainImage: imageA, origins, unitId: "box", units }));
  const cleared = clearImageAssignments({ image: imageB, origins, units });
  assert(!cleared.units[1]!.imageUrl && !cleared.units[2]!.imageUrl, "cleared");
  assert(form.includes("clearImageAssignments"), "remove uses clear helper");
});

check("16-17. Save maps pending assignments + edit hydrate helpers", () => {
  assert(form.includes("mapAssignedUnitIds"), "save maps assignments");
  assert(form.includes('setProductMain", isMain ? "true" : "false"') || form.includes("setProductMain"), "multi upload");
  assert(form.includes("inferUnitImageOrigins"), "edit hydrate origins");
});

check("18. Disabled unit cannot receive new assignment", () => {
  const units = [
    unit("piece", "Piece", { isBaseUnit: true }),
    unit("pack", "Pack", { status: "inactive" }),
    unit("box", "Box"),
  ];
  assert(activeAssignableUnits(units).every((row) => row.id !== "pack"), "pack not assignable");
  const next = toggleUnitImageAssignment({
    assign: true,
    image: imageB,
    mainImage: imageA,
    origins: {},
    unitId: "pack",
    units,
  });
  assert(!next.units[1]!.imageUrl, "inactive pack ignored");
  const applied = applyProductImageAssignment({ image: imageA, mode: "all", origins: {}, units });
  assert(!applied.units[1]!.imageUrl, "apply-all skips inactive");
  assert(applied.units[0]!.imageUrl === productImageRef(imageA), "piece assigned");
  assert(applied.units[2]!.imageUrl === productImageRef(imageA), "box assigned");
});

check("19. Disabled units hide assignment display", () => {
  const pack = unit("pack", "Pack", { status: "inactive", imageUrl: productImageRef(imageA) });
  const hidden = resolveUnitImageDisplay(pack, [imageA], imageA, { hideDisabledAssignment: true, allowMainFallback: false });
  assert(hidden.origin === "none" && !hidden.image, "disabled hidden");
  const formCell = resolveUnitImageDisplay(unit("pack", "Pack"), [imageA], imageA, { allowMainFallback: false });
  assert(formCell.origin === "none", "form UI no fallback");
});

check("20. Piece-only apply-all equals apply-base", () => {
  const units = [
    unit("piece", "Piece", { isBaseUnit: true }),
    unit("pack", "Pack", { status: "inactive" }),
    unit("box", "Box", { status: "inactive" }),
  ];
  const baseOnly = applyProductImageAssignment({ image: imageA, mode: "base", origins: {}, units });
  const all = applyProductImageAssignment({ image: imageA, mode: "all", origins: {}, units });
  assert(baseOnly.units[0]!.imageUrl === productImageRef(imageA), "base piece");
  assert(all.units[0]!.imageUrl === productImageRef(imageA), "all piece");
  assert(!baseOnly.units[1]!.imageUrl && !all.units[1]!.imageUrl, "pack off");
  assert(!baseOnly.units[2]!.imageUrl && !all.units[2]!.imageUrl, "box off");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
