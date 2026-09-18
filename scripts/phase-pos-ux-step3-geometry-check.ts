/**
 * Source-level geometry / wiring checks for STEP 3 Production-cart recovery.
 * NOT visual proof — Owner visual QA is still required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const client = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
  "utf8",
);

check("outer overlay max-height is measured from panel bottom", () => {
  assert(client.includes("getBoundingClientRect().bottom"), "measure overlay top");
  assert(client.includes("window.innerHeight - overlayTop - 16"), "leave bottom margin");
  assert(client.includes("cartOverlayMaxHeightPx"), "apply measured maxHeight on OUTER wrapper");
  assert(client.includes("xl:overflow-y-auto"), "prefer scrolling OUTER overlay");
});

check("Production item-list / empty-state / payment structure present", () => {
  assert(client.includes("max-h-[330px]"), "Production item-list height");
  assert(client.includes("min-h-64 place-items-center"), "Production empty state");
  assert(client.includes('<div className="border-t border-border p-4">'), "Production payment");
});

check("Product Grid 6-column marker unchanged", () => {
  assert(client.includes("xl:grid-cols-6"), "6-column grid retained");
  assert(!client.includes("max-h-[610px]"), "no cart-dependent grid height");
});

console.log("");
console.log("NOTE: Source checks only — Owner visual QA still required.");
const failed = results.filter((r) => r.status === "FAIL");
console.log(`STEP 3 geometry checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
