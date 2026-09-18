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

check("desktop product grid uses xl:grid-cols-6", () => {
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

check("product grid spans full width on desktop", () => {
  assert(client.includes("xl:col-span-2 xl:row-start-2"), "full-width product grid row");
  assert(
    client.includes("xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-[auto_minmax(0,1fr)]"),
    "toolbar/cart anchor row only",
  );
});

check("cart anchor stays in-flow (entire aside not fixed)", () => {
  assert(!client.includes("xl:fixed"), "entire cart aside must not use xl:fixed");
  assert(client.includes("xl:col-start-2 xl:row-start-1"), "cart anchor remains in layout grid");
});

check("expanded cart body uses overlay positioning on desktop", () => {
  assert(client.includes("xl:absolute xl:top-full xl:right-0 xl:z-40"), "expanded body overlays products");
  assert(client.includes("xl:w-[420px]"), "xl cart width preserved");
  assert(client.includes("2xl:w-[460px]"), "2xl cart width preserved");
});

check("expanded cart overlay uses tall viewport-based height", () => {
  assert(
    client.includes("xl:h-[min(calc(100dvh-14rem),820px)]"),
    "expanded body should keep original tall proportions within viewport",
  );
});

check("dedicated cart item-list area exists and scrolls", () => {
  assert(
    client.includes('<div className={cn("min-h-0 flex-1 overflow-y-auto p-4"'),
    "item-list region must be flex-1 min-h-0 overflow-y-auto",
  );
  assert(client.includes("max-xl:max-h-[360px]"), "tablet item-list keeps bounded scroll height");
});

check("empty cart shows large empty-state panel", () => {
  assert(
    client.includes('grid h-full min-h-64 place-items-center rounded-xl border border-dashed border-primary/30'),
    "empty-state panel must fill item-list area",
  );
  assert(client.includes("ui.scan.or.search.product.to.start.sale"), "empty-state message preserved");
});

check("payment section sits outside item-list scroll and pay reachable", () => {
  assert(client.includes('<div className="shrink-0 border-t border-border p-4">'), "payment section shrink-0 below list");
  assert(client.includes('onClick={completeSale} disabled={isPending}'), "pay footer reachable");
});

check("product grid height stable when cart toggles", () => {
  const gridSection = client.match(
    /productGridVisible \? \(<section className="([^"]+)"/,
  )?.[1];
  assert(gridSection?.includes("max-h-[812px]"), "stable product grid max height expected");
  assert(!gridSection?.includes("max-h-[610px]"), "cart-dependent grid height removed");
});

check("six-column card price and stock remain visible", () => {
  assert(client.includes("posCardFloatingPriceClass"), "price class present");
  assert(client.includes("whitespace-nowrap"), "price keeps full LAK");
  assert(client.includes("<StockBadge className=\"shrink-0\""), "stock badge stays on card row");
  assert(client.includes("xl:text-[14px]"), "six-column price tuning");
  assert(client.includes("xl:text-[10px]"), "six-column stock tuning");
});

check("STEP 2 ProductGridItem styling preserved", () => {
  assert(client.includes('const POS_CARD_EMERALD_BRIGHT = "#2EDB45"'), "bright emerald token");
  assert(client.includes("posCardLightLabelBackdropClass"), "light label chips");
  assert(client.includes("posCardSolidCapsuleClass"), "solid price/stock capsules");
  assert(client.includes("bg-black/35"), "light backdrop opacity");
  assert(client.includes("bg-black/75"), "solid capsule backdrop");
});

const failed = results.filter((entry) => entry.status === "FAIL");
console.log("");
console.log(`STEP 3 layout checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  process.exitCode = 1;
}
