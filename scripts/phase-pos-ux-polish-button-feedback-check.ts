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

const root = process.cwd();
const copy = readFileSync(join(root, "lib/i18n/pos-copy.ts"), "utf8");
const globals = readFileSync(join(root, "app/globals.css"), "utf8");
const pageClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const workspace = readFileSync(join(root, "features/pos/components/pos-workspace-modal.tsx"), "utf8");
const smallModal = readFileSync(join(root, "features/pos/components/pos-small-modal.tsx"), "utf8");
const returnModal = readFileSync(join(root, "features/pos/components/return-exchange-void-modal.tsx"), "utf8");
const moreNav = readFileSync(join(root, "scripts/phase-pos-more-back-navigation-check.ts"), "utf8");

function loValue(key: string) {
  const match = copy.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"` , "g"));
  assert(match && match.length >= 2, `${key} missing lo entry`);
  // First is EN block, second is LO block in this file structure
  const lo = match[1].match(/:\s*"([^"]*)"/);
  assert(lo, `${key} lo parse`);
  return lo[1];
}

function enValue(key: string) {
  const match = copy.match(new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*"([^"]*)"`));
  assert(match, `${key} missing en`);
  return match[1];
}

check("1. Return Lao primary label exact", () => {
  assert(loValue("ui.confirm.return") === "ຢືນຢັນຄືນ", loValue("ui.confirm.return"));
  assert(returnModal.includes('tPos("ui.confirm.return")'), "uses confirm.return key");
});

check("2. Exchange Lao primary label exact", () => {
  assert(loValue("ui.confirm.exchange") === "ຢືນຢັນແລກ", loValue("ui.confirm.exchange"));
  assert(returnModal.includes('tPos("ui.confirm.exchange")'), "uses confirm.exchange key");
});

check("3. Void Lao primary label exact", () => {
  assert(loValue("ui.confirm.void") === "ຢືນຢັນຍົກເລີກ", loValue("ui.confirm.void"));
  assert(returnModal.includes('tPos("ui.confirm.void")'), "uses confirm.void key");
});

check("4. Cancel Lao label exact", () => {
  assert(loValue("ui.cancel") === "ຍົກເລີກ", loValue("ui.cancel"));
  assert(returnModal.includes('tPos("ui.cancel")'), "cancel key used");
});

check("5. shared POS button includes press feedback", () => {
  assert(pageClient.includes('data-pos-ui=""'), "POS shell marker");
  assert(globals.includes("[data-pos-ui] button"), "scoped button rules");
  assert(globals.includes("scale(0.97)"), "pressed scale");
  assert(globals.includes("translateY(1px)"), "pressed translate");
  assert(globals.includes("140ms"), "fast transition");
  assert(globals.includes("touch-action: manipulation"), "touch");
});

check("6. X/Close includes interaction feedback", () => {
  assert(workspace.includes("active:scale-[0.97]"), "workspace X press");
  assert(workspace.includes("hover:bg-primary/10"), "workspace X hover");
  assert(smallModal.includes("active:scale-[0.97]"), "small modal X press");
  assert(smallModal.includes("hover:bg-primary/10"), "small modal X hover");
});

check("7. Back includes interaction feedback", () => {
  assert(workspace.includes('data-testid="pos-workspace-back"'), "back marker");
  assert(workspace.includes("active:scale-[0.97]"), "back press");
  assert(workspace.includes("hover:bg-primary/10"), "back hover");
});

check("8. disabled buttons do not look clickable", () => {
  assert(globals.includes('[data-pos-ui] button:disabled'), "disabled rule");
  assert(globals.includes("cursor: not-allowed"), "not-allowed");
  assert(globals.includes('button:not(:disabled):not([aria-disabled="true"]):active'), "active excludes disabled");
});

check("9. focus-visible preserved", () => {
  assert(globals.includes("[data-pos-ui] button:focus-visible"), "focus-visible rule");
  assert(workspace.includes("focus-visible:ring-2"), "workspace focus ring");
});

check("10. reduced-motion handled", () => {
  assert(globals.includes("@media (prefers-reduced-motion: reduce)"), "reduced motion media");
  assert(globals.includes("transform: none"), "no transform under reduced motion");
});

check("11. Return submit still single execution", () => {
  // R1 keeps Production busy-guard (6062865 submitLockRef/requestAction PIN path is R2).
  assert(returnModal.includes("disabled={busy}"), "busy disable");
  assert(returnModal.includes("if (!sale || busy) return"), "busy guard");
  assert(returnModal.includes("submitReturn"), "return action");
});

check("12. Exchange submit still single execution", () => {
  assert(returnModal.includes("submitExchange"), "exchange action");
  assert(returnModal.includes("disabled={busy}"), "busy disable");
  assert(returnModal.includes("setBusy(true)"), "busy lock on execute");
});

check("13. Void submit still single execution", () => {
  assert(returnModal.includes("submitVoid"), "void action");
  assert(returnModal.includes("if (!sale || busy) return"), "guard");
});

check("14. More Back navigation unchanged", () => {
  assert(pageClient.includes("function backFromMoreChild"), "back helper");
  assert(pageClient.includes("function closeMoreChild"), "close helper");
  assert(moreNav.includes("backFromMoreChild"), "regression script still targets helpers");
});

check("15. Favorites controls unchanged", () => {
  assert(pageClient.includes("setFavoritesOpen(true)"), "favorites open");
  assert(pageClient.includes("favoritesOpen"), "favorites state");
});

check("16. Return/Exchange/Void workflow has no generic Apply primary", () => {
  const cancelIdx = returnModal.indexOf('{tPos("ui.cancel")}');
  assert(cancelIdx >= 0, "cancel present");
  const primarySlice = returnModal.slice(cancelIdx, cancelIdx + 800);
  assert(!primarySlice.includes('tPos("ui.apply")'), "no ui.apply in confirm row");
  assert(enValue("ui.confirm.return").toLowerCase().includes("return"), "en return contextual");
  assert(enValue("ui.confirm.exchange").toLowerCase().includes("exchange"), "en exchange contextual");
  assert(enValue("ui.confirm.void").toLowerCase().includes("void"), "en void contextual");
  assert(!copy.includes('"ui.confirm.return": "ໃຊ້"'), "return not Apply Lao");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\nRESULT  ${failed.length === 0 ? "PASS" : "FAIL"}  ${results.length - failed.length}/${results.length}`);
if (failed.length) process.exitCode = 1;
