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

const clientPath = join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx");
const client = readFileSync(clientPath, "utf8");

check("desktop product grid uses xl:grid-cols-6 (OWNER PASS — must not change)", () => {
  assert(client.includes("xl:grid-cols-6"), "expected xl:grid-cols-6 on product grid");
  assert(
    client.includes("grid-cols-[repeat(auto-fit,minmax(155px,1fr))]"),
    "expected responsive auto-fit below xl",
  );
});

check("product grid width is independent of cartCollapsed", () => {
  const gridSection = client.match(
    /productGridVisible \? \(<section className="([^"]+)"/,
  )?.[1];
  assert(gridSection, "product grid section class not found");
  assert(!gridSection.includes("cartCollapsed"), "product grid must not branch on cartCollapsed");
  assert(gridSection.includes("xl:col-span-2"), "product grid spans full width under toolbar row");
});

check("cart anchor stays in-flow (entire aside not fixed)", () => {
  assert(!client.includes("xl:fixed"), "entire cart aside must not use xl:fixed");
  assert(client.includes("xl:col-start-2 xl:row-start-1"), "cart anchor remains in layout grid");
});

check("expanded cart uses OUTER overlay wrapper only", () => {
  assert(client.includes("xl:absolute xl:top-full xl:right-0 xl:z-40"), "outer overlay below header");
  assert(client.includes("xl:overflow-y-auto"), "outer overlay scrolls when viewport is short");
  assert(client.includes("xl:w-[420px]"), "xl cart width preserved");
  assert(client.includes("2xl:w-[460px]"), "2xl cart width preserved");
  assert(
    client.includes("OUTER STEP-3 overlay only"),
    "overlay must be documented as external wrapper",
  );
});

check("Production cart internals restored (ec58439 markers)", () => {
  assert(
    client.includes('className={cn("flex-1 overflow-y-auto p-4", productGridVisible ? "max-h-[330px]" : "max-h-[54vh]")}') ||
      client.includes('cn("flex-1 overflow-y-auto p-4", productGridVisible ? "max-h-[330px]" : "max-h-[54vh]")'),
    "Production item-list max-h-[330px] restored",
  );
  assert(
    client.includes('grid min-h-64 place-items-center rounded-xl border border-dashed border-primary/30'),
    "Production empty-state min-h-64 restored",
  );
  assert(
    client.includes('<div className="border-t border-border p-4">'),
    "Production payment block (no shrink-0 redesign)",
  );
  assert(client.includes("ui.scan.or.search.product.to.start.sale"), "empty-state message");
  assert(client.includes("h-16 w-full rounded-xl bg-primary text-[40px]"), "Production Pay button sizing");
});

check("ProductGridItem / STEP 2 tokens untouched", () => {
  assert(client.includes('const POS_CARD_EMERALD_BRIGHT = "#2EDB45"'), "bright emerald token");
  assert(client.includes("posCardLightLabelBackdropClass"), "light label chips");
  assert(client.includes("posCardSolidCapsuleClass"), "solid price/stock capsules");
  assert(client.includes("bg-black/35"), "light backdrop opacity");
  assert(client.includes("bg-black/75"), "solid capsule backdrop");
});

check("product grid height stable when cart toggles", () => {
  const gridSection = client.match(
    /productGridVisible \? \(<section className="([^"]+)"/,
  )?.[1];
  assert(gridSection?.includes("max-h-[812px]"), "stable product grid max height expected");
  assert(!gridSection?.includes("max-h-[610px]"), "cart-dependent grid height removed");
});

console.log("");
console.log(
  "NOTE: These are SOURCE/LAYOUT checks only. They cannot prove Owner visual QA.",
);
const failed = results.filter((entry) => entry.status === "FAIL");
console.log(`STEP 3 layout checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
