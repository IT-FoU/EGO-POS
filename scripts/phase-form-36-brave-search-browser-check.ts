import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productsCopyKeyParity } from "../lib/i18n/products-copy";
import { mapBraveImageResults } from "../features/products/product-image-search";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];
function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const root = process.cwd();
const form = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const browser = readFileSync(join(root, "features/products/components/brave-image-search-browser.tsx"), "utf8");
const actions = readFileSync(join(root, "features/products/actions.ts"), "utf8");
const searchModule = readFileSync(join(root, "features/products/product-image-search.ts"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

check("One click opens Brave Search Browser", () => {
  assert(form.includes("BraveImageSearchBrowser"), "browser not wired");
  assert(form.includes("setBrowserOpen(true)"), "one-click open missing");
  assert(!form.includes("setChooserOpen"), "old chooser still present");
  assert(!form.includes("onFocus={() => setChooserOpen(true)}"), "focus-open chooser still present");
  assert(form.includes('data-testid="brave-image-search-browser"') || browser.includes('data-testid="brave-image-search-browser"'), "browser test id missing");
});

check("Large EGO drawer geometry", () => {
  assert(browser.includes("fixed inset-0 z-50 bg-black/50 md:left-72"), "sidebar-aware drawer missing");
  assert(browser.includes("productImageSearchTitle"), "title missing");
  assert(browser.includes("braveSearchProvider"), "Brave provider label missing");
});

check("Search by name/barcode with editable query", () => {
  assert(browser.includes('switchSource("name")') || browser.includes('setSource("name")'), "name mode missing");
  assert(browser.includes('switchSource("barcode")') || browser.includes('setSource("barcode")'), "barcode mode missing");
  assert(browser.includes("runSearch"), "search action missing");
  assert(browser.includes("query: trimmed"), "manual query override missing");
  assert(actions.includes("query?: string"), "action query override missing");
});

check("Preview before import", () => {
  assert(browser.includes("setPreviewHit(hit)"), "preview selection missing");
  assert(browser.includes("useThisImage"), "Use this image missing");
  assert(browser.includes("backToImageResults"), "Back to results missing");
  assert(!browser.includes("onUseImage(hit)") || browser.includes("previewHit"), "must preview before use");
});

check("Result grid includes title/source/domain", () => {
  assert(browser.includes("sourceDomain"), "source domain not shown");
  assert(searchModule.includes("sourceDomain"), "mapping missing sourceDomain");
  const mapped = mapBraveImageResults({
    results: [
      {
        title: "Cola",
        url: "https://example.com/page",
        thumbnail: { src: "https://cdn.example.com/t.jpg" },
        properties: { url: "https://cdn.example.com/full.jpg", width: 800, height: 600 },
      },
    ],
  });
  assert(mapped[0]?.sourceDomain === "example.com", "domain parse failed");
  assert(mapped[0]?.title === "Cola", "title mapping failed");
});

check("Import uses server pipeline; no local download UX", () => {
  assert(form.includes("importRemoteProductImageAction"), "remote import missing");
  assert(form.includes("optimizeProductImageFile"), "optimize missing");
  assert(form.includes("adoptProductImage"), "gallery adopt missing");
  assert(!browser.includes("download="), "must not offer local download");
});

check("Unit assignment source of truth preserved", () => {
  assert(form.includes('data-field="unit-image-assignment"'), "unit assignment UI missing");
  assert(form.includes("onToggleUnitAssignment"), "toggle missing");
  assert(form.includes("applyImageToAllUnits"), "apply all missing");
});

check("No public Brave key", () => {
  assert(!form.includes("BRAVE_SEARCH_API_KEY"), "client form must not reference key");
  assert(!browser.includes("BRAVE_SEARCH_API_KEY"), "browser must not reference key");
  assert(!envExample.includes("NEXT_PUBLIC_BRAVE_SEARCH_API_KEY"), "public key example forbidden");
  assert(envExample.includes("BRAVE_SEARCH_API_KEY"), "server key documented");
});

check("i18n parity for Step 2 keys", () => {
  assert(productsCopyKeyParity(), "en/lo key parity failed");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;
