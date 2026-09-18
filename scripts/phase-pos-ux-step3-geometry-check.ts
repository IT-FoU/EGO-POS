/**
 * Lightweight geometry assumptions for STEP 3B Repair 3.
 * Not a browser visual proof — validates fit math for 6-column capsules
 * and cart overlay height measurement wiring.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Approximate bold monospace-ish average glyph width as fraction of font-size. */
function estimateTextWidthPx(text: string, fontSizePx: number, weightFactor = 0.62): number {
  return Math.ceil(text.length * fontSizePx * weightFactor);
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

const client = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
  "utf8",
);

// Conservative xl desktop: ~1280 content after sidebar/padding → ~148px cards.
const CARD_WIDTH_PX = 148;
const CARD_PADDING_X_PX = 12; // xl:p-1.5 ≈ 6px each side
const ROW_GAP_PX = 4;
const INNER_WIDTH = CARD_WIDTH_PX - CARD_PADDING_X_PX;

check("6-column price+stock capsules fit widest common strings", () => {
  const priceFont = 12; // xl:text-[12px]
  const stockFont = 8; // xl:text-[8px]
  const pricePadX = 8; // xl:px-1 * 2
  const stockPadX = 8;

  const samples = [
    { price: "23,000 LAK", stock: "22 left" },
    { price: "33,000 LAK", stock: "10 left" },
    { price: "124,000 LAK", stock: "24 left" },
    { price: "999,000 LAK", stock: "99 left" },
  ];

  for (const sample of samples) {
    const priceW = estimateTextWidthPx(sample.price, priceFont, 0.58) + pricePadX;
    const stockW = estimateTextWidthPx(sample.stock, stockFont, 0.56) + stockPadX;
    const total = priceW + stockW + ROW_GAP_PX;
    assert(
      total <= INNER_WIDTH,
      `${sample.price} + ${sample.stock} ≈ ${total}px exceeds ${INNER_WIDTH}px inner card`,
    );
  }
});

check("price capsule has no max-width shrink trap in source", () => {
  assert(!client.includes("max-w-[62%]"), "remove max-w-[62%]");
  assert(!client.includes("max-w-[58%]"), "remove max-w-[58%]");
  assert(client.includes("overflow-hidden rounded-full"), "capsule contains text paint");
});

check("cart overlay max-height is measured from panel bottom to viewport", () => {
  assert(client.includes("getBoundingClientRect().bottom"), "measure overlay top");
  assert(client.includes("window.innerHeight - overlayTop - 16"), "leave bottom margin");
  assert(client.includes("cartOverlayMaxHeightPx"), "apply measured maxHeight");
});

check("item-list uses 93078f1 max-h-[330px] with xl flex remaining height", () => {
  assert(client.includes("max-h-[330px] xl:max-h-none"), "tablet 330 / desktop flex remaining");
  assert(client.includes("min-h-64 place-items-center"), "large empty state");
});

const failed = results.filter((r) => r.status === "FAIL");
console.log("");
console.log(`STEP 3 geometry checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
