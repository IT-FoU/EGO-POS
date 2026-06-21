/**
 * HTTP-level login/session/logout smoke test against a running Next.js server.
 * Run: IGO_DEMO_MODE=false tsx scripts/phase-a1-ui-auth-test.ts
 */
const baseUrl = process.env.A1_BASE_URL ?? "http://127.0.0.1:3001";

type Check = { name: string; pass: boolean; detail: string };

function parseSetCookie(headers: Headers) {
  const raw = headers.getSetCookie?.() ?? [];
  return raw.map((entry) => entry.split(";")[0]).join("; ");
}

async function login(username: string, password: string, cookie = "") {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, {
    headers: cookie ? { cookie } : undefined,
  });
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  const setCookie = parseSetCookie(csrfResponse.headers);
  const mergedCookie = [cookie, setCookie].filter(Boolean).join("; ");

  const body = new URLSearchParams({
    csrfToken: csrf.csrfToken ?? "",
    json: "true",
    password,
    redirect: "false",
    username,
  });

  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie: mergedCookie,
    },
    method: "POST",
    redirect: "manual",
  });

  const authCookie = parseSetCookie(response.headers);
  return {
    cookie: [mergedCookie, authCookie].filter(Boolean).join("; "),
    ok: response.ok,
    payload: await response.json().catch(() => null),
    status: response.status,
  };
}

async function session(cookie: string) {
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie },
  });
  return {
    ok: response.ok,
    payload: (await response.json()) as { user?: { roles?: string[]; username?: string } },
  };
}

async function logout(cookie: string) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { cookie } });
  const csrf = (await csrfResponse.json()) as { csrfToken?: string };
  const body = new URLSearchParams({ csrfToken: csrf.csrfToken ?? "", json: "true" });
  const response = await fetch(`${baseUrl}/api/auth/signout`, {
    body,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      cookie,
    },
    method: "POST",
    redirect: "manual",
  });
  const clearedCookie = parseSetCookie(response.headers);
  return {
    cookie: clearedCookie || cookie,
    ok: response.ok || response.status === 302,
    status: response.status,
  };
}

async function main() {
  const checks: Check[] = [];
  const record = (name: string, pass: boolean, detail: string) => {
    checks.push({ detail, name, pass });
    console.log(`${pass ? "PASS" : "FAIL"} — ${name}: ${detail}`);
  };

  const health = await fetch(`${baseUrl}/login`).catch(() => null);
  record("Server reachable", Boolean(health?.ok), health ? `status=${health.status}` : "connection failed");

  for (const account of [
    { password: "AdminChangeMe123!", username: "igo-admin" },
    { password: "Manager123!", username: "manager" },
    { password: "Cashier123!", username: "cashier" },
  ]) {
    const result = await login(account.username, account.password);
    record(
      `UI login ${account.username}`,
      result.ok && Boolean(result.payload?.url),
      `status=${result.status}`,
    );
  }

  const ownerLogin = await login("igo-admin", "AdminChangeMe123!");
  const firstSession = await session(ownerLogin.cookie);
  record(
    "Session persistence",
    firstSession.ok && firstSession.payload.user?.username === "igo-admin",
    `username=${firstSession.payload.user?.username ?? "none"}`,
  );

  const secondSession = await session(ownerLogin.cookie);
  record(
    "Session reload",
    secondSession.ok && secondSession.payload.user?.username === "igo-admin",
    `username=${secondSession.payload.user?.username ?? "none"}`,
  );

  const signOut = await logout(ownerLogin.cookie);
  const afterLogout = await session(signOut.cookie || ownerLogin.cookie);
  record(
    "Logout flow",
    !afterLogout.payload.user,
    afterLogout.payload.user ? `still logged in as ${afterLogout.payload.user.username}` : "session cleared",
  );

  const cashierLogin = await login("cashier", "Cashier123!");
  const cashierSession = await session(cashierLogin.cookie);
  record(
    "Role restriction cashier session roles",
    cashierSession.payload.user?.roles?.includes("Cashier") === true,
    `roles=${(cashierSession.payload.user?.roles ?? []).join(",")}`,
  );

  const failed = checks.filter((row) => !row.pass);
  console.log(`\nAuth UI checks: ${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
