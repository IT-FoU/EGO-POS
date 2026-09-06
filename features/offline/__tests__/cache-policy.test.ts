import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

import {
  APPROVED_SHELL_ROUTES,
  classifyRequest,
  isApprovedShellRoute,
  isImmutableAsset,
  isNeverCachePath,
  NEVER_CACHE_PREFIXES,
} from "../pwa/cache-policy";

const nav = (pathname: string) => classifyRequest({ pathname, sameOrigin: true, navigate: true });
const asset = (pathname: string) => classifyRequest({ pathname, sameOrigin: true, navigate: false });

test("admin and platform surfaces are never cached", () => {
  for (const path of [
    "/super-admin",
    "/super-admin/users",
    "/ego-admin",
    "/ego-admin/stores/new",
    "/igo-admin",
    "/igo-admin/audit-logs",
    "/businesses",
    "/businesses/new",
    "/template-shell/mini_mart",
  ]) {
    assert.equal(isNeverCachePath(path), true, `${path} must be never-cache`);
    assert.equal(nav(path), "bypass", `${path} navigation must bypass`);
  }
});

test("all API routes (including NextAuth) are never cached", () => {
  for (const path of [
    "/api/pos/sales",
    "/api/auth/session",
    "/api/settings",
    "/api/super-admin/login",
    "/api/store/activity-logs",
  ]) {
    assert.equal(isNeverCachePath(path), true, `${path} must be never-cache`);
    assert.equal(asset(path), "bypass");
    assert.equal(nav(path), "bypass");
  }
});

test("immutable static assets are cache-first", () => {
  assert.equal(isImmutableAsset("/_next/static/chunks/app.js"), true);
  assert.equal(asset("/_next/static/chunks/app.js"), "static-immutable");
  assert.equal(asset("/manifest.webmanifest"), "static-immutable");
  assert.equal(asset("/icons/icon.svg"), "static-immutable");
});

test("approved Mini Mart navigations use the shell strategy", () => {
  for (const route of APPROVED_SHELL_ROUTES) {
    assert.equal(isApprovedShellRoute(route), true, `${route} should be an approved shell route`);
    assert.equal(nav(route), "shell-navigation", `${route} navigation should use shell`);
  }
  assert.equal(nav("/pos/anything"), "shell-navigation");
});

test("pre-auth routes are not treated as shell routes", () => {
  for (const path of ["/login", "/register", "/auth", "/onboarding"]) {
    assert.equal(isApprovedShellRoute(path), false);
    assert.equal(nav(path), "bypass");
  }
});

test("cross-origin requests always bypass", () => {
  assert.equal(classifyRequest({ pathname: "/pos", sameOrigin: false, navigate: true }), "bypass");
  assert.equal(
    classifyRequest({ pathname: "/_next/static/x.js", sameOrigin: false, navigate: false }),
    "bypass",
  );
});

test("non-navigation requests to shell routes are not shell-cached", () => {
  // e.g. a data/RSC fetch to /pos should not be treated as a navigation.
  assert.equal(classifyRequest({ pathname: "/pos", sameOrigin: true, navigate: false }), "bypass");
});

test("unknown same-origin paths bypass (fail safe)", () => {
  assert.equal(nav("/some/unknown/route"), "bypass");
  assert.equal(asset("/random.json"), "bypass");
});

test("public/sw.js mirrors the never-cache exclusions (single source of truth guard)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const swPath = join(here, "..", "..", "..", "public", "sw.js");
  const sw = readFileSync(swPath, "utf8");
  for (const prefix of NEVER_CACHE_PREFIXES) {
    assert.ok(sw.includes(`"${prefix}"`), `sw.js must exclude ${prefix}`);
  }
  // The SW must not put navigation/API responses in a cache indiscriminately.
  assert.ok(sw.includes("isNeverCachePath"), "sw.js must guard never-cache paths");
  assert.ok(sw.includes("network-first") || sw.includes("Network-first"), "sw.js must document network-first shell");
});
