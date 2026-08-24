import { resolveSaleStatusVisual } from "../features/pos/sale-status-presentation";

const cases: Array<[string, string, string, boolean]> = [
  ["completed", "Completed", "#22C55E", false],
  ["paid", "Completed", "#22C55E", false],
  ["adjusted", "Adjusted", "#38BDF8", false],
  ["exchanged", "Exchanged", "#5EEAD4", false],
  ["partial_refunded", "Partial Refund", "#F59E0B", false],
  ["partial_refund", "Partial Refund", "#F59E0B", false],
  ["refunded", "Refunded", "#EF4444", false],
  ["voided", "Voided", "#EF4444", true],
  ["cancelled", "Voided", "#EF4444", true],
  ["mystery-status", "Unknown", "muted", false],
];

let failed = 0;
for (const [status, label, color, voided] of cases) {
  const visual = resolveSaleStatusVisual(status);
  const okLabel = visual.label === label;
  const okColor = color === "muted" ? visual.tone === "unknown" : visual.badgeClassName.includes(color);
  const okVoid = visual.isVoided === voided;
  const ok = okLabel && okColor && okVoid;
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${status} → ${visual.label} tone=${visual.tone} voided=${visual.isVoided}`);
}

const refunded = resolveSaleStatusVisual("refunded");
const voided = resolveSaleStatusVisual("voided");
const distinguishable = refunded.label !== voided.label;
console.log(`${distinguishable ? "PASS" : "FAIL"}  Refunded vs Voided labels (${refunded.label} / ${voided.label})`);
if (!distinguishable) failed += 1;

process.exit(failed ? 1 : 0);
