import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const { canSubmitLoginCredentials } = await import("../lib/auth/login-form-state");
const { INVALID_CREDENTIALS_MESSAGE } = await import("../lib/auth/merchant-login");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

check("A. Empty username/password disables submit", !canSubmitLoginCredentials("", ""));
check("B. Empty password disables submit", !canSubmitLoginCredentials("igo-admin", ""));
check("C. Username + password enables submit", canSubmitLoginCredentials("igo-admin", "AdminChangeMe123!"));
check("D. Owner email + password enables submit", canSubmitLoginCredentials("owner@igopos.local", "AdminChangeMe123!"));
check("E. Username + PIN enables submit", canSubmitLoginCredentials("manager", "234567"));
check("F. Whitespace-only username disables submit", !canSubmitLoginCredentials("   ", "234567"));

const loginFormSource = readFileSync(resolve(process.cwd(), "components/auth/login-form.tsx"), "utf8");
check(
  "G. Submit reads FormData credentials",
  loginFormSource.includes("readLoginCredentialsFromForm") &&
    loginFormSource.includes('id="merchant-login-form"'),
);
check(
  "H. Inputs sync with onInput handlers",
  loginFormSource.includes("onInput={(event) => setUsername") &&
    loginFormSource.includes("onInput={(event) => setPassword"),
);
check(
  "I. Password toggle preserves controlled value",
  loginFormSource.includes("value={password}") && !loginFormSource.includes('setPassword("")'),
);
check(
  "J. Submit button disabled only for pending or empty credentials",
  loginFormSource.includes("disabled={isPending || !canSubmit}") &&
    loginFormSource.includes("canSubmitLoginCredentials"),
);
check(
  "K. Credentials callback submit path preserved",
  loginFormSource.includes("/api/auth/callback/credentials") &&
    loginFormSource.includes("credentialsSignInFailed"),
);

if (existsSync(resolve(process.cwd(), "lib/i18n/dictionaries.ts"))) {
  const { getDictionary } = await import("../lib/i18n/dictionaries");
  check(
    "L. Wrong credentials message remains generic",
    getDictionary("en").invalidCredentials === INVALID_CREDENTIALS_MESSAGE,
    getDictionary("en").invalidCredentials,
  );
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-3B login button: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
