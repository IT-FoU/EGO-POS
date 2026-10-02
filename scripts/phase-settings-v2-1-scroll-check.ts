/**
 * Settings index scroll restoration — static + pure checks.
 * No database. No Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settingsIndexScrollTarget } from "../features/settings/settings-index-scroll";

const root = process.cwd();
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const landing = read("features/settings/components/settings-landing.tsx");
const form = read("features/settings/components/settings-form.tsx");
const scroll = read("features/settings/settings-index-scroll.ts");
const restore = read("features/settings/components/settings-index-scroll-restore.tsx");
const guard = read("features/settings/components/settings-index-scroll-guard.tsx");
const layout = read("app/(dashboard)/settings/layout.tsx");

check("1. capture on settings row click", landing.includes("captureSettingsIndexScroll(row.href)"));
check("2. restore mounted on index only", landing.includes("SettingsIndexScrollRestore"));
check("3. internal back does not force top", form.includes('href="/settings"') && form.includes("scroll={false}"));
check("4. session storage only", scroll.includes("sessionStorage") && !scroll.includes("localStorage") && !scroll.includes("document.cookie"));
check("5. no schema", !scroll.includes("prisma") && !layout.includes("prisma"));
check("6. consume once helper", scroll.includes("export function consumeSettingsIndexScroll") && restore.includes("consumeSettingsIndexScroll()"));
check("7. leave settings clears pending", guard.includes("clearSettingsIndexScrollIfOutsideSettings") && layout.includes("SettingsIndexScrollGuard"));
check("8. ignores non-settings hrefs", scroll.includes('rowHref.startsWith("/settings/")'));
check("9. restore does not attach a persistent scroll lock", !restore.includes("addEventListener(\"scroll\"") && restore.includes("setTimeout"));
check("10. keep saved y when row still visible", settingsIndexScrollTarget({ rowHref: "/settings/help", y: 900 }, 980, 800) === 900);
check("11. move near row when saved view missed it", settingsIndexScrollTarget({ rowHref: "/settings/help", y: 0 }, 1400, 800) === 1376);
check("12. missing row uses saved y", settingsIndexScrollTarget({ rowHref: "/settings/help", y: 400 }, null, 800) === 400);

console.log(`\nSettings scroll check: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
