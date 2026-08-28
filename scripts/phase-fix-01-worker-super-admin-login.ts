import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://ego-pos-beta.note-z.workers.dev";
const SECRETS_PATH = join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json");

type Secrets = {
  goboxPassword?: string;
  superAdminEmail?: string;
  superAdminPassword?: string;
};

function parseSetCookie(headers: Headers) {
  return (headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");
}

function hasAdminCookie(cookieHeader: string) {
  return cookieHeader.split(";").some((part) => part.trim().startsWith("igo_super_admin_session="));
}

const secrets = JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as Secrets;
const email = (secrets.superAdminEmail ?? "admin@igopos.local").trim();
const password = secrets.superAdminPassword?.trim() ?? "";
const goboxPassword = secrets.goboxPassword?.trim() ?? "";
if (!password) throw new Error("Super Admin password missing from owner secrets");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function login(identifier: string, secret: string) {
  const response = await fetch(`${BASE}/api/super-admin/login`, {
    body: JSON.stringify({ email: identifier, password: secret }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; redirectTo?: string; error?: string };
  return {
    cookie: parseSetCookie(response.headers),
    ok: payload.ok === true,
    redirectTo: payload.redirectTo,
    status: response.status,
  };
}

async function getPath(path: string, cookie = "") {
  const response = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  return { location: response.headers.get("location"), status: response.status };
}

const unauthenticated = await getPath("/super-admin");
check(
  "A. No session is denied from /super-admin",
  unauthenticated.status === 307 && (unauthenticated.location ?? "").includes("/super-admin/login"),
  `${unauthenticated.status} ${unauthenticated.location ?? ""}`,
);

const loginPage = await getPath("/super-admin/login");
check("B. Super Admin login page loads", loginPage.status === 200, String(loginPage.status));

const wrong = await login(email, `${password}-wrong`);
check("C. Incorrect password is denied", wrong.status === 401 && !wrong.ok && !hasAdminCookie(wrong.cookie), String(wrong.status));

const unknown = await login("unknown-admin@igopos.local", password);
check("D. Unknown email is denied", unknown.status === 401 && !unknown.ok);

const owner = await login("gobox", goboxPassword || "unused-password-value");
check("E. Store Owner username is denied", owner.status === 401 && !owner.ok);

const ownerEmail = await login("gobox@gobox.local", goboxPassword || "unused-password-value");
check("F. Store Owner email is denied", ownerEmail.status === 401 && !ownerEmail.ok, String(ownerEmail.status));

const manager = await login("manager", "234567");
check("G. Manager is denied", manager.status === 401 && !manager.ok);

const cashier = await login("cashier", "345678");
check("H. Cashier is denied", cashier.status === 401 && !cashier.ok);

const success = await login(email, password);
check(
  "I. Correct Super Admin credentials authenticate on Production Worker",
  success.status === 200 && success.ok === true && success.redirectTo === "/super-admin" && hasAdminCookie(success.cookie),
  `${success.status} ${success.redirectTo ?? ""} cookie=${hasAdminCookie(success.cookie) ? "set" : "missing"}`,
);

const authorized = await getPath("/super-admin", success.cookie);
check("J. Valid Super Admin session can open /super-admin", authorized.status === 200, String(authorized.status));

const logout = await fetch(`${BASE}/api/super-admin/logout`, {
  headers: { cookie: success.cookie },
  method: "POST",
  redirect: "manual",
  signal: AbortSignal.timeout(60_000),
});
check("K. Logout succeeds", logout.status === 200, String(logout.status));

const afterLogoutCookie = [success.cookie, parseSetCookie(logout.headers)].filter(Boolean).join("; ");
const deniedAfterLogout = await getPath("/super-admin", afterLogoutCookie);
check(
  "L. Logout destroys Super Admin session",
  deniedAfterLogout.status === 307 && (deniedAfterLogout.location ?? "").includes("/super-admin/login"),
  `${deniedAfterLogout.status} ${deniedAfterLogout.location ?? ""}`,
);

const failed = results.filter((result) => !result.ok);
console.log(`\nFIX-01 Production Worker Super Admin login: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
