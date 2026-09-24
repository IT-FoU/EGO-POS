/**
 * Targeted persistence semantics for Require Cash Shift Before Sale.
 * Static — does not touch Production or mutate QA.
 */
import {
  parseRequireCashShiftBeforeSaleFlag,
  readRequireCashShiftBeforeSaleFromJson,
  withRequireCashShiftBeforeSale,
  REQUIRE_CASH_SHIFT_JSON_KEY,
} from "../features/products/unit-pricing-defaults";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

check("1. missing setting → TRUE", readRequireCashShiftBeforeSaleFromJson(null) === true);
check("2. stored true → TRUE", readRequireCashShiftBeforeSaleFromJson({ [REQUIRE_CASH_SHIFT_JSON_KEY]: true }) === true);
check("3. stored false → FALSE", readRequireCashShiftBeforeSaleFromJson({ [REQUIRE_CASH_SHIFT_JSON_KEY]: false }) === false);
check("4. save ON payload writes true", withRequireCashShiftBeforeSale({}, true)[REQUIRE_CASH_SHIFT_JSON_KEY] === true);
const offPayload = withRequireCashShiftBeforeSale({ units: {}, version: 1 as const }, false);
check(
  "5. save OFF payload writes false (key present)",
  REQUIRE_CASH_SHIFT_JSON_KEY in offPayload && offPayload[REQUIRE_CASH_SHIFT_JSON_KEY] === false,
);
check("6. hard reload OFF remains OFF", readRequireCashShiftBeforeSaleFromJson(offPayload) === false);
check("7. false not replaced by default true", parseRequireCashShiftBeforeSaleFlag(false) === false && parseRequireCashShiftBeforeSaleFlag(0) === false);
check("8. Boolean('false') trap avoided", parseRequireCashShiftBeforeSaleFlag("false") === false && Boolean("false") === true);
check("9. undefined input flag → ON", parseRequireCashShiftBeforeSaleFlag(undefined) === true);
check("10. empty object JSON → ON (legacy)", readRequireCashShiftBeforeSaleFromJson({}) === true);

console.log(`\nCash-shift persistence: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
