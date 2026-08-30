const baseUrl = "http://127.0.0.1:3000";

function parseSetCookie(headers: Headers) {
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((entry) => entry.split(";")[0]).join("; ");
}

const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
const csrf = (await csrfResponse.json()) as { csrfToken?: string };
let cookie = parseSetCookie(csrfResponse.headers);
const login = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
  body: new URLSearchParams({
    csrfToken: csrf.csrfToken ?? "",
    json: "true",
    password: "AdminChangeMe123!",
    redirect: "false",
    username: "igo-admin",
  }),
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    cookie,
  },
  method: "POST",
  redirect: "manual",
});
cookie = [cookie, parseSetCookie(login.headers)].filter(Boolean).join("; ");
const loginJson = (await login.json().catch(() => null)) as { url?: string } | null;
const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } });
const sessionJson = (await session.json()) as { user?: { username?: string } };
const paths = ["/dashboard", "/pos", "/products", "/inventory", "/reports"];
const pages: Record<string, number> = {};
for (const path of paths) {
  const response = await fetch(`${baseUrl}${path}`, { headers: { cookie }, redirect: "manual" });
  pages[path] = response.status;
}

const loginPage = await fetch(`${baseUrl}/login`);
const loginHtml = await loginPage.text();
const leakedProduction =
  loginHtml.includes("egopos.i-goto.workers.dev") || loginHtml.includes("ieutdqnlfiiaawctapor");

console.log(
  JSON.stringify(
    {
      loginStatus: login.status,
      loginUrl: loginJson?.url ?? null,
      sessionUser: sessionJson.user?.username ?? null,
      pages,
      leakedProduction,
    },
    null,
    2,
  ),
);
if (!sessionJson.user?.username || leakedProduction || Object.values(pages).some((status) => status >= 400)) {
  process.exit(1);
}
