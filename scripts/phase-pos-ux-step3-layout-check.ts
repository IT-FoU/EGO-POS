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
  assert(!gridSection.includes("xl:col-span-2"), "product grid must not span cart column");
});

check("cart no longer reserves two-column product grid", () => {
  assert(
    !client.includes("xl:grid-cols-[minmax(0,1fr)_420px]"),
    "removed reserved cart column grid",
  );
  assert(!client.includes("xl:col-start-2 xl:row-start-1"), "removed cart grid placement hooks");
  assert(!client.includes('productGridVisible && cartCollapsed ? "contents"'), "removed contents main hack");
});

check("cart uses desktop overlay positioning", () => {
  assert(client.includes("xl:fixed"), "cart should use xl:fixed overlay");
  assert(client.includes("xl:z-40"), "cart overlay z-index below modals");
  assert(client.includes("xl:w-[420px]"), "xl cart width preserved");
  assert(client.includes("2xl:w-[460px]"), "2xl cart width preserved");
});

check("product grid height stable when cart toggles", () => {
  const gridSection = client.match(
    /productGridVisible \? \(<section className="([^"]+)"/,
  )?.[1];
  assert(gridSection?.includes("max-h-[812px]"), "stable product grid max height expected");
  assert(!gridSection?.includes("max-h-[610px]"), "cart-dependent grid height removed");
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
