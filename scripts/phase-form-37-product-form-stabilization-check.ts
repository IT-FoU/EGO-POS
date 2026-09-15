import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyProductImageAssignment,
  productImageRef,
  resolveUnitImageDisplay,
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

const root = process.cwd();
const form = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const modal = readFileSync(join(root, "features/products/components/product-small-modal.tsx"), "utf8");
const helpers = readFileSync(join(root, "features/products/unit-image-assignment.ts"), "utf8");
const actions = readFileSync(join(root, "features/products/actions.ts"), "utf8");
const copy = readFileSync(join(root, "lib/i18n/products-copy.ts"), "utf8");

check("1-5. Category dialog button interaction states", () => {
  assert(form.includes("DIALOG_BTN_SECONDARY"), "secondary button style");
  assert(form.includes("DIALOG_BTN_PRIMARY"), "primary button style");
  assert(form.includes("hover:border-primary"), "hover");
  assert(form.includes("active:scale"), "pressed");
  assert(form.includes("focus-visible:ring-2"), "focus-visible");
  assert(form.includes('isPending ? t("saving") : t("save")'), "saving pending label");
  assert(modal.includes("hover:border-primary hover:bg-card"), "close X hover");
});

check("6-9. Modal focus loss root cause fixed", () => {
  assert(modal.includes("onCloseRef"), "stable close ref");
  assert(modal.includes("}, [closeOnEscape]);"), "effect ignores onClose identity");
  assert(!modal.includes("}, [closeOnEscape, onClose]);"), "old onClose dep removed");
  assert(form.includes("closeBrandDialog") && form.includes("useCallback"), "stable brand close");
  assert(form.includes("closeSupplierDialog"), "stable supplier close");
});

check("10-13. Brand master edit/delete UI + action", () => {
  assert(form.includes("BrandField") && form.includes("editBrand") && form.includes("deleteBrand"), "brand controls");
  assert(form.includes("BrandCrudDialog"), "brand dialog");
  assert(actions.includes("deleteBrandAction"), "delete brand action");
  assert(copy.includes("editBrand:") && copy.includes("deleteBrandConfirm:"), "i18n");
});

check("14-17. Supplier master edit/archive distinct from remove", () => {
  assert(form.includes("editSupplier") && form.includes("archiveSupplierMaster"), "supplier master controls");
  assert(form.includes("removeSupplierFromProduct"), "remove-from-product label");
  assert(form.includes("supplierMasterHint"), "distinction hint");
  assert(form.includes("updateSupplierAction") && form.includes("archiveSupplierAction"), "supplier actions");
  assert(form.includes("SupplierCrudDialog"), "supplier dialog");
});

check("18-23. Unit image apply respects enabled units", () => {
  const imageA = { id: "img-a", url: "blob:a" };
  const units = [
    { id: "piece", unitName: "Piece", isBaseUnit: true, status: "active" as const },
    { id: "pack", unitName: "Pack", status: "inactive" as const },
    { id: "box", unitName: "Box", status: "inactive" as const },
  ];
  const all = applyProductImageAssignment({ image: imageA, mode: "all", origins: {}, units });
  assert(all.units[0]!.imageUrl === productImageRef(imageA), "piece");
  assert(!all.units[1]!.imageUrl && !all.units[2]!.imageUrl, "disabled skipped");
  const active = [
    { id: "piece", unitName: "Piece", isBaseUnit: true, status: "active" as const },
    { id: "pack", unitName: "Pack", status: "active" as const },
    { id: "box", unitName: "Box", status: "inactive" as const },
  ];
  const partial = applyProductImageAssignment({ image: imageA, mode: "all", origins: {}, units: active });
  assert(partial.units[1]!.imageUrl === productImageRef(imageA), "pack on");
  assert(!partial.units[2]!.imageUrl, "box off");
  const display = resolveUnitImageDisplay(
    { id: "pack", unitName: "Pack", status: "inactive", imageUrl: productImageRef(imageA) },
    [imageA],
    imageA,
    { hideDisabledAssignment: true, allowMainFallback: false },
  );
  assert(display.origin === "none", "disabled not misleading");
  assert(helpers.includes("hideDisabledAssignment"), "helper option");
  assert(form.includes("allowMainFallback: false"), "form table no fallback");
  assert(form.includes('data-unit-enabled'), "enabled marker");
});

check("24. Brave / Step 1 assignment wiring preserved", () => {
  assert(form.includes("BraveImageSearchBrowser"), "brave intact");
  assert(form.includes("onApplyAssignment") && form.includes("applyImageAssignment"), "apply wiring");
  assert(form.includes("toggleImageUnitAssignment"), "toggle intact");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
