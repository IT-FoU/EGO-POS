import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.EGO_UAT_URL ?? "http://localhost:3000";
const SECRETS_PATH = join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json");

type Secrets = {
  goboxPassword?: string;
  superAdminEmail?: string;
  superAdminPassword?: string;
  superAdminUsername?: string;
};

type PageRow = {
  classification: string;
  location: string;
  path: string;
  status: number;
};

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
const pages: PageRow[] = [];
const criticalNetwork: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function loadSecrets(): Secrets {
  if (!existsSync(SECRETS_PATH)) {
    throw new Error("Owner secrets file is missing");
  }
  return JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as Secrets;
}

function cookieHeader(jar: string[]) {
  return jar.join("; ");
}

function mergeCookies(jar: string[], headers: Headers) {
  const next = [...jar];
  for (const entry of headers.getSetCookie?.() ?? []) {
    const pair = entry.split(";")[0];
    const name = pair.split("=")[0];
    const index = next.findIndex((item) => item.startsWith(`${name}=`));
    if (index >= 0) next[index] = pair;
    else next.push(pair);
  }
  return next;
}

function classify(status: number, location: string, html: string, path: string): string {
  if (status === 404) return "404";
  if (status === 403) return "403";
  if (status >= 500) return "API ERROR";
  if (status === 307 || status === 302) {
    const dest = location.replace(/^https?:\/\/[^/]+/i, "");
    if (dest.split("?")[0] === path.split("?")[0]) return "REDIRECT LOOP";
    return "REDIRECTS";
  }
  if (status !== 200) return "OTHER";
  if (/Application error|This page couldn’t load|Unhandled Runtime Error|digest:/i.test(html)) return "CRASHES";
  if (/IGO_DEMO_MODE|demo staff|Demo Mode/i.test(html)) return "VISIBLE DEMO DATA";
  if (/No products|No sales|empty|ยังไม่มี/i.test(html)) return "EMPTY STATE";
  return "LOADS";
}

async function request(path: string, jar: string[] = [], method = "GET", body?: BodyInit, contentType?: string) {
  const response = await fetch(`${BASE}${path}`, {
    body,
    headers: {
      ...(jar.length ? { cookie: cookieHeader(jar) } : {}),
      ...(contentType ? { "content-type": contentType } : {}),
    },
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(90_000),
  });
  const html = await response.text().catch(() => "");
  const location = response.headers.get("location") ?? "";
  if (response.status >= 500) {
    criticalNetwork.push(`${method} ${path} ${response.status}`);
  }
  return {
    html,
    jar: mergeCookies(jar, response.headers),
    location,
    status: response.status,
  };
}

function recordPage(path: string, status: number, location: string, html: string) {
  const classification = classify(status, location, html, path);
  pages.push({ classification, location, path, status });
  return classification;
}

async function main() {
  const secrets = loadSecrets();
  const adminEmail = (secrets.superAdminEmail ?? "admin@igopos.local").trim();
  const adminPassword = secrets.superAdminPassword?.trim() ?? "";
  const goboxPassword = secrets.goboxPassword?.trim() ?? "";
  if (!adminPassword) throw new Error("Super Admin password missing");
  if (!goboxPassword) throw new Error("GO BOX owner password missing");

  const root = await request("/");
  check("GET / responds", root.status === 200 || root.status === 307, String(root.status));

  for (const path of ["/login", "/login?locale=en", "/login?locale=lo", "/super-admin/login"]) {
    const page = await request(path);
    const classification = recordPage(path, page.status, page.location, page.html);
    const ok = page.status === 200 && /Sign in|Store access|EGO POS|Super Admin|email|password/i.test(page.html);
    check(`Public ${path}`, ok, `${page.status} ${classification}`);
  }

  const css = await request("/_next/static/chunks/app_globals_0yg4wg8.css");
  check("Global CSS asset", css.status === 200, String(css.status));

  const unauthAdmin = await request("/super-admin");
  check(
    "Unauthenticated /super-admin redirects to login",
    unauthAdmin.status === 307 && unauthAdmin.location.includes("/super-admin/login"),
    `${unauthAdmin.status} ${unauthAdmin.location}`,
  );

  const adminLogin = await request(
    "/api/super-admin/login",
    [],
    "POST",
    JSON.stringify({ email: adminEmail, password: adminPassword }),
    "application/json",
  );
  const adminPayload = JSON.parse(adminLogin.html || "{}") as { ok?: boolean; redirectTo?: string; error?: string };
  const hasAdminCookie = cookieHeader(adminLogin.jar).includes("igo_super_admin_session=");
  check("Super Admin login API", adminLogin.status === 200 && adminPayload.ok === true && hasAdminCookie, String(adminLogin.status));

  const adminHome = await request("/super-admin", adminLogin.jar);
  recordPage("/super-admin", adminHome.status, adminHome.location, adminHome.html);
  check("Super Admin home", adminHome.status === 200, `${adminHome.status}`);

  const stores = await request("/super-admin/stores", adminLogin.jar);
  recordPage("/super-admin/stores", stores.status, stores.location, stores.html);
  check("Super Admin stores", stores.status === 200, String(stores.status));

  const createStore = await request("/super-admin/stores/new", adminLogin.jar);
  recordPage("/super-admin/stores/new", createStore.status, createStore.location, createStore.html);
  check("Create Store page loads without submitting", createStore.status === 200, String(createStore.status));

  const logout = await request("/api/super-admin/logout", adminLogin.jar, "POST");
  const afterLogout = await request("/super-admin", logout.jar);
  check(
    "Super Admin logout",
    logout.status === 200 && afterLogout.status === 307 && afterLogout.location.includes("/super-admin/login"),
    `${afterLogout.status} ${afterLogout.location}`,
  );

  const csrf = await request("/api/auth/csrf");
  const csrfJson = JSON.parse(csrf.html || "{}") as { csrfToken?: string };
  check("NextAuth CSRF", Boolean(csrfJson.csrfToken), String(csrf.status));
  const storeBody = new URLSearchParams({
    csrfToken: csrfJson.csrfToken ?? "",
    json: "true",
    password: goboxPassword,
    redirect: "false",
    username: "gobox",
  });
  const storeLogin = await request(
    "/api/auth/callback/credentials",
    csrf.jar,
    "POST",
    storeBody.toString(),
    "application/x-www-form-urlencoded",
  );
  const storePayload = JSON.parse(storeLogin.html || "{}") as { url?: string };
  const storeOk = storeLogin.status === 200 && !credentialsFailed(storePayload.url);
  check("Store Owner login API", storeOk, `${storeLogin.status} ${storePayload.url ?? ""}`);

  const corePaths = [
    "/dashboard",
    "/products",
    "/inventory",
    "/suppliers",
    "/purchasing",
    "/customers",
    "/membership-levels",
    "/promotions",
    "/pos",
    "/reports",
    "/reports/sales",
    "/reports/products",
    "/reports/inventory",
    "/reports/customers",
    "/reports/purchasing",
    "/settings",
  ];
  for (const path of corePaths) {
    const page = await request(path, storeLogin.jar);
    const classification = recordPage(path, page.status, page.location, page.html);
    check(`Core ${path}`, page.status === 200 || page.status === 307, `${page.status} ${classification} ${page.location}`);
  }

  const loaded = pages.filter((row) => row.classification === "LOADS" || row.classification === "EMPTY STATE").length;
  console.log(JSON.stringify({
    base: BASE,
    coreLoaded: loaded,
    coreTotal: pages.length,
    criticalNetwork,
    pages,
    passed: results.filter((row) => row.ok).length,
    redirectLoops: pages.filter((row) => row.classification === "REDIRECT LOOP").map((row) => row.path),
    failed: results.filter((row) => !row.ok).map((row) => row.name),
    total: results.length,
  }, null, 2));
}

function credentialsFailed(url: string | undefined) {
  const value = url ?? "";
  return value.includes("error=") || value.includes("/api/auth/error");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
