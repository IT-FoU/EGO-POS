import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSkuFromProductName,
  collectProductRequiredGaps,
  ensureSkuWhenEmpty,
} from "../features/products/product-sku";
import { getProductsCopy, productsCopyKeyParity } from "../lib/i18n/products-copy";

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
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const productSku = readFileSync(join(root, "features/products/product-sku.ts"), "utf8");
const en = getProductsCopy("en");

check("A. Product Name entered + SKU blank → SKU generated", () => {
  const sku = ensureSkuWhenEmpty("Coca Cola 330ml", "", 1_700_000_000_1234);
  assert(sku.startsWith("COCA-COLA-33-"), `unexpected sku ${sku}`);
  assert(sku === buildSkuFromProductName("Coca Cola 330ml", 1_700_000_000_1234), "ensureSku diverged from builder");
});

check("B. Manual SKU is never overwritten", () => {
  assert(ensureSkuWhenEmpty("Coca Cola 330ml", "MANUAL-SKU") === "MANUAL-SKU", "manual sku overwritten");
  assert(ensureSkuWhenEmpty("  ", "KEEP-ME") === "KEEP-ME", "existing sku cleared");
  assert(ensureSkuWhenEmpty("", "") === "", "empty name should not invent sku");
});

check("C. Save with missing required fields shows visible error summary", () => {
  assert(productForm.includes("unableToSaveProduct"), "unable copy missing");
  assert(productForm.includes("pleaseCompleteRequired"), "please complete copy missing");
  assert(productForm.includes("product-save-validation-summary"), "near-save summary missing");
  assert(productForm.includes("collectProductRequiredGaps"), "gap collector unused");
  const gaps = collectProductRequiredGaps({ productName: "", sku: "", categoryId: "", requireCategory: true });
  assert(gaps.join(",") === "productName,sku,category", `unexpected gaps ${gaps.join(",")}`);
});

check("D. First invalid field is focused/scrolled to", () => {
  assert(productForm.includes("focusRequiredField"), "focus helper missing");
  assert(productForm.includes("scrollIntoView"), "scroll missing");
  assert(productForm.includes('focusRequiredField(gaps[0]!)' ) || productForm.includes("focusRequiredField(gaps[0])"), "first gap not focused");
});

check("E. Form data remains intact after validation failure", () => {
  assert(productForm.includes("event.preventDefault()"), "submit still preventDefault");
  assert(!productForm.includes("reset()"), "form reset would wipe data");
  assert(productForm.includes("noValidate"), "custom validation must run (no silent native-only block)");
});

check("F. Error banner uses error styling, not success styling", () => {
  assert(productForm.includes("messageTone"), "tone state missing");
  assert(productForm.includes("border-danger/40"), "danger styling missing");
  assert(productForm.includes('showFeedback(t("productSaved"), "success")'), "success path missing");
  assert(productForm.includes('showFeedback(localizeProductError'), "error path missing");
  // Top banner must not hardcode success-only for all messages
  assert(!/message \? \(\s*<div className="rounded-md border border-success/.test(productForm), "message still always success-green");
});

check("G. Valid Piece-only product save path intact", () => {
  assert(productForm.includes("createProductAction(payload)"), "create action missing");
  assert(productForm.includes("sku: resolvedSku"), "resolved sku not used in payload");
});

check("H. Valid Piece + Pack + Box product save path intact", () => {
  assert(productForm.includes("applyHierarchyConversions"), "hierarchy still applied");
  assert(productForm.includes("units: productUnits"), "units still submitted");
});

check("I. Valid product with image save path intact", () => {
  assert(productForm.includes("uploadProductImageAction"), "image upload missing");
  assert(productForm.includes("pendingMain"), "pending image path missing");
});

check("J. Existing Edit Product SKU remains unchanged", () => {
  assert(productSku.includes("if (trimmedSku) return trimmedSku"), "empty-only guard missing");
  assert(productForm.includes("ensureSkuWhenEmpty"), "ensure helper unused");
  assert(productForm.includes("onBlur={(event) => maybeAutofillSkuFromName(event.currentTarget.value)}"), "blur autofill missing");
  assert(productForm.includes("buildSkuFromProductName(productName)"), "button uses shared builder");
});

check("i18n: new keys present + EN/LO parity", () => {
  assert(en.unableToSaveProduct.includes("Unable to save"), "EN unable copy");
  assert(en.pleaseCompleteRequired.includes("Please complete"), "EN please complete");
  assert(en.saving.toLowerCase().includes("saving"), "EN saving label");
  assert(en.saveProduct.toLowerCase().includes("save"), "EN save product label");
  assert(en.barcodeAlreadyExists.toLowerCase().includes("another product"), "EN duplicate barcode copy");
  assert(en.skuHint.toLowerCase().includes("empty") || en.skuHint.toLowerCase().includes("auto"), "sku hint still implies always generated");
  assert(productsCopyKeyParity(), "EN/LO key parity broken");
});

check("source: single SKU algorithm", () => {
  assert(productForm.includes('from "@/features/products/product-sku"'), "shared module unused");
  assert(!/replace\(\/\[\^A-Z0-9\]\+\/g/.test(productForm), "duplicate SKU regex still in form");
});

check("K. Save button shows Saving state and blocks double submit", () => {
  assert(productForm.includes('data-testid="product-save-button"'), "save button test id missing");
  assert(productForm.includes('t("saving")'), "saving label missing");
  assert(productForm.includes("aria-busy={isPending}"), "aria-busy missing");
  assert(productForm.includes("disabled={isPending}"), "pending disable missing");
  assert(productForm.includes("if (isPending) return;"), "double-submit guard missing");
  assert(productForm.includes("Loader2"), "spinner missing");
  assert(productForm.includes('t("saveProduct")'), "idle Save Product label missing");
});

check("L. Qty and server failures surface near Save", () => {
  assert(productForm.includes("showSaveFailureNearButton"), "near-save helper missing");
  assert(productForm.includes("focusFirstInvalidQtyField"), "qty focus missing");
  assert(productForm.includes("focusDuplicateConflict"), "duplicate focus missing");
  assert(productForm.includes("scrollSaveFeedbackIntoView"), "scroll-to-summary missing");
});

const failed = results.filter((item) => item.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
