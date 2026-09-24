/**
 * Optional Cash Shift / Start Work repair — static checks.
 * Does NOT touch Production or mutate DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canStartWork,
  deriveCashShiftUiState,
  startWorkBlockedReasonKey,
} from "../features/pos/cash-shift-ui-state";
import { readRequireCashShiftBeforeSaleFromJson, parseRequireCashShiftBeforeSaleFlag, withRequireCashShiftBeforeSale } from "../features/products/unit-pricing-defaults";
import { posCopyHasNoReplacementChars, posCopyKeyParity, tPos } from "../lib/i18n/pos-copy";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
} from "../lib/i18n/reports-copy";
import {
  settingsCopyHasNoReplacementChars,
  settingsCopyKeyParity,
  tSettings,
} from "../lib/i18n/settings-copy";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}${extra ? ` — ${extra}` : ""}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

check("1. EN/LO settings copy parity", settingsCopyKeyParity());
check("2. Lao settings has no replacement chars", settingsCopyHasNoReplacementChars());
check("3. EN/LO POS copy parity", posCopyKeyParity());
check("4. Lao POS has no replacement chars", posCopyHasNoReplacementChars());
check("5. Settings key requireCashShiftBeforeSale EN/LO", Boolean(tSettings("requireCashShiftBeforeSale", "en")) && Boolean(tSettings("requireCashShiftBeforeSale", "lo")));
check("6. Lao settings key uses Lao (no Thai)", !thaiScript.test(tSettings("requireCashShiftBeforeSale", "lo")));
check("7. POS start-work-before-sale EN/LO", Boolean(tPos("ui.start.work.before.sale", "en")) && Boolean(tPos("ui.start.work.before.sale", "lo")));

check(
  "8. Default requireCashShiftBeforeSale = ON when unset",
  readRequireCashShiftBeforeSaleFromJson(null) === true &&
    readRequireCashShiftBeforeSaleFromJson({}) === true,
);
check(
  "9. Explicit false turns setting OFF",
  readRequireCashShiftBeforeSaleFromJson({ __requireCashShiftBeforeSale: false }) === false,
);
check(
  "10. Explicit true stays ON",
  readRequireCashShiftBeforeSaleFromJson({ __requireCashShiftBeforeSale: true }) === true,
);
check(
  "10b. String/number false encodings stay OFF (not Boolean coercion)",
  readRequireCashShiftBeforeSaleFromJson({ __requireCashShiftBeforeSale: "false" }) === false &&
    readRequireCashShiftBeforeSaleFromJson({ __requireCashShiftBeforeSale: 0 }) === false &&
    parseRequireCashShiftBeforeSaleFlag("false") === false &&
    parseRequireCashShiftBeforeSaleFlag(0) === false &&
    parseRequireCashShiftBeforeSaleFlag(false) === false,
);
check(
  "10c. withRequire always writes explicit boolean (never deletes key for OFF)",
  withRequireCashShiftBeforeSale({ units: {}, version: 1 }, false).__requireCashShiftBeforeSale === false &&
    withRequireCashShiftBeforeSale({ units: {}, version: 1 }, true).__requireCashShiftBeforeSale === true,
);
check(
  "10d. Settings save sends 0/1 for cash-shift flag",
  read("features/settings/components/settings-form.tsx").includes("requireCashShiftBeforeSale: (settings.requireCashShiftBeforeSale === false ? 0 : 1)"),
);
check(
  "10e. Settings upsert writes unitPricingDefaults atomically + verifies read-back",
  (() => {
    const src = read("features/settings/prisma-repository.ts");
    return (
      src.includes("unitPricingDefaults: nextDefaults") &&
      src.includes("Failed to persist Require Cash Shift Before Sale") &&
      src.includes("parseRequireCashShiftBeforeSaleFlag")
    );
  })(),
);

check(
  "11. UI not_started when neither open",
  deriveCashShiftUiState({
    attendanceCashSessionId: null,
    attendanceOpen: false,
    cashSessionId: null,
    cashStatus: "not_started",
  }) === "not_started",
);
check(
  "12. UI open when cash+attendance aligned",
  deriveCashShiftUiState({
    attendanceCashSessionId: "c1",
    attendanceOpen: true,
    cashSessionId: "c1",
    cashStatus: "open",
  }) === "open",
);
check(
  "13. UI needs_closing when cash open attendance closed",
  deriveCashShiftUiState({
    attendanceCashSessionId: null,
    attendanceOpen: false,
    cashSessionId: "c1",
    cashStatus: "open",
  }) === "needs_closing",
);
check(
  "14. UI recovery when attendance open cash closed (QA diagnosis case)",
  deriveCashShiftUiState({
    attendanceCashSessionId: "old",
    attendanceOpen: true,
    cashSessionId: null,
    cashStatus: "not_started",
  }) === "recovery_required",
);
check("15. Start Work allowed only for not_started", canStartWork("not_started") && !canStartWork("recovery_required"));
check(
  "16. Recovery blocks Start Work with End Work message",
  startWorkBlockedReasonKey("recovery_required") === "ui.shift.recovery.end.work.first",
);

const assertSrc = read("features/cash-sessions/prisma-repository.ts");
check(
  "17. Sale assert respects requireCashShiftBeforeSale === false",
  assertSrc.includes("readRequireCashShiftBeforeSaleFromJson") &&
    assertSrc.includes("=== false") &&
    assertSrc.includes("return null") &&
    assertSrc.includes("An open cash session is required before completing a sale."),
);
check(
  "18. Sale assert documents no implicit session",
  assertSrc.includes("no implicit cash_session"),
);

const views = read("features/pos/components/pos-page-client.tsx");
check(
  "19. Pay soft-guards Start Work when setting ON",
  views.includes("ui.start.work.before.sale") && views.includes("requireCashShiftBeforeSale !== false"),
);
check(
  "20. StaffControl uses shift UI states",
  views.includes("shiftUiState") && views.includes("cash-shift-ui-state") === false
    ? views.includes("deriveCashShiftUiState")
    : views.includes("deriveCashShiftUiState"),
);
check("21. Recovery hint + End Work for attendance", views.includes("ui.shift.recovery.hint") && views.includes("attendanceOpen"));

const settingsForm = read("features/settings/components/settings-form.tsx");
check("22. Settings form toggle present", settingsForm.includes("requireCashShiftBeforeSale"));

const migration = "prisma/migrations/20260924100000_require_cash_shift_before_sale/migration.sql";
check(
  "23. No DDL migration needed (JSON persistence)",
  existsSync(join(ROOT, migration)) &&
    read(migration).includes("No DDL required") &&
    read(migration).includes("__requireCashShiftBeforeSale"),
);
check(
  "24. JSON helpers preserve flag through unit-pricing merge",
  read("features/products/unit-pricing-defaults.ts").includes("REQUIRE_CASH_SHIFT_JSON_KEY") &&
    read("features/products/unit-pricing-defaults.ts").includes("readRequireCashShiftBeforeSaleFromJson"),
);

const currentRoute = read("app/api/pos/cash-sessions/current/route.ts");
check("25. Current session API returns attendance + setting", currentRoute.includes("attendanceOpen") && currentRoute.includes("requireCashShiftBeforeSale"));

check(
  "26. Sale assert reads unitPricingDefaults JSON flag",
  assertSrc.includes("unitPricingDefaults") && assertSrc.includes("readRequireCashShiftBeforeSaleFromJson"),
);
check(
  "26b. Cash In/Out still use getScopedSession (open required)",
  assertSrc.includes("recordCashSessionMovement") &&
    assertSrc.includes("getScopedSession(tx, tenant, sessionId)") &&
    assertSrc.includes("Cash session is already closed."),
);
check(
  "26c. Cash refund assert ignores optional-shift setting",
  (() => {
    const refundFn = assertSrc.slice(assertSrc.indexOf("assertOpenCashSessionForCashRefund"));
    const refundBody = refundFn.slice(0, refundFn.indexOf("export async function assertOpenCashSessionForCashExchange"));
    return !refundBody.includes("readRequireCashShiftBeforeSaleFromJson") && refundBody.includes("cash refund");
  })(),
);

check("27. Reports copy parity still ok", reportsCopyKeyParity());
check("28. Reports Lao ok", reportsCopyHasNoReplacementChars());

console.log(`\nOptional cash shift: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
