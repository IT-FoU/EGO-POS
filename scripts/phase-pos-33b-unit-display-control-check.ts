import { readFileSync } from "node:fs";
import { join } from "node:path";

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
const client = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const copy = readFileSync(join(root, "lib/i18n/pos-copy.ts"), "utf8");
const settings = readFileSync(join(root, "features/pos/pos-unit-display-settings.ts"), "utf8");

check("1-4. More → Unit Display is visible", () => {
  assert(client.includes('label={t("ui.unit.display")}'), "More menu item");
  assert(client.includes("setUnitDisplayOpen(true)"), "opens dialog");
  assert(client.includes('data-testid="pos-unit-display-mode"'), "picker present");
  assert(client.includes("ui.unit.display.current"), "current mode shown");
});

check("5-10. Separate and Combined selectable immediately", () => {
  assert(client.includes('setPosUnitDisplayMode("separate")'), "separate");
  assert(client.includes('setPosUnitDisplayMode("combined")'), "combined");
  assert(client.includes("writePosUnitDisplayMode(mode)"), "persist on change");
  assert(client.includes("projectPosCatalogueCards"), "applies to grid");
  assert(!client.includes("toggleUnitDisplayMode"), "no hidden header toggle");
});

check("11. Persistence key unchanged", () => {
  assert(settings.includes('ego.pos.unitDisplayMode'), "localStorage key");
  assert(settings.includes('DEFAULT_POS_UNIT_DISPLAY_MODE: PosUnitDisplayMode = "separate"'), "default separate");
});

check("12. Copy + barcode wiring intact", () => {
  assert(copy.includes('"ui.unit.display": "Unit Display"'), "EN title");
  assert(copy.includes("Show Piece, Pack and Box as separate cards."), "separate hint");
  assert(copy.includes("Show one product card and choose unit when selling."), "combined hint");
  assert(client.includes("findPosScanMatch(visibleProducts"), "barcode still on source products");
  assert(client.includes("match.conflict"), "conflict handling");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
