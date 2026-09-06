/*
 * EGO POS Mini Mart service worker (Offline-first Phase 2).
 *
 * Authoritative cache rules live in features/offline/pwa/cache-policy.ts (unit
 * tested). This file MUST mirror them. Security boundaries:
 *   - NEVER cache /super-admin, /ego-admin, /igo-admin, /businesses,
 *     /template-shell (platform administration).
 *   - NEVER cache /api/** (including /api/auth NextAuth) — may contain secrets
 *     or another user's/store's data.
 *   - NEVER cache authenticated server HTML. Approved Mini Mart navigations are
 *     network-first and, when offline, fall back to the PRE-CACHED public
 *     offline shell (/offline). Dynamic authenticated HTML is never stored.
 *   - Only immutable, non-sensitive static assets are cache-first.
 *
 * Nothing is served from cache for excluded paths under any circumstance.
 */

var CACHE_VERSION = "egopos-offline-v1";
var STATIC_CACHE = CACHE_VERSION + "-static";
var SHELL_CACHE = CACHE_VERSION + "-shell";
var OFFLINE_SHELL_URL = "/offline";

var PRECACHE_URLS = [OFFLINE_SHELL_URL, "/manifest.webmanifest", "/icons/icon.svg"];

var NEVER_CACHE_PREFIXES = [
  "/super-admin",
  "/ego-admin",
  "/igo-admin",
  "/businesses",
  "/template-shell",
  "/api",
];

var NON_SHELL_ROUTES = ["/login", "/register", "/auth", "/onboarding"];

var APPROVED_SHELL_ROUTES = [
  "/offline",
  "/pos",
  "/dashboard",
  "/products",
  "/inventory",
  "/customers",
  "/reports",
  "/settings",
  "/purchasing",
  "/suppliers",
  "/membership-levels",
  "/promotions",
  "/customer-display",
];

var IMMUTABLE_ASSET_EXACT = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon.ico",
  "/icons/icon.svg",
  "/icons/maskable-icon.svg",
];

function startsWithAny(pathname, prefixes) {
  for (var i = 0; i < prefixes.length; i += 1) {
    var prefix = prefixes[i];
    if (pathname === prefix || pathname.indexOf(prefix + "/") === 0) return true;
  }
  return false;
}

function isNeverCachePath(pathname) {
  return startsWithAny(pathname, NEVER_CACHE_PREFIXES);
}

function isImmutableAsset(pathname) {
  if (pathname.indexOf("/_next/static/") === 0) return true;
  return IMMUTABLE_ASSET_EXACT.indexOf(pathname) !== -1;
}

function isApprovedShellRoute(pathname) {
  if (startsWithAny(pathname, NON_SHELL_ROUTES)) return false;
  return startsWithAny(pathname, APPROVED_SHELL_ROUTES);
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS).catch(function () {
          // Best-effort precache; a missing asset must not block install.
          return undefined;
        });
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key.indexOf(CACHE_VERSION) !== 0) {
              return caches.delete(key);
            }
            return undefined;
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("message", function (event) {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function handleStatic(request) {
  return caches.open(STATIC_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}

function handleShellNavigation(request) {
  // Network-first: never store authenticated HTML; fall back to the offline shell.
  return fetch(request).catch(function () {
    return caches.open(SHELL_CACHE).then(function (cache) {
      return cache.match(OFFLINE_SHELL_URL).then(function (shell) {
        return (
          shell ||
          new Response(
            "<!doctype html><meta charset=utf-8><title>Offline</title><p>Offline. Reconnect to continue.",
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          )
        );
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  if (request.method !== "GET") return;

  var url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  var sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // bypass cross-origin

  var pathname = url.pathname;

  if (isNeverCachePath(pathname)) return; // bypass: never cache admin/api/auth

  if (isImmutableAsset(pathname)) {
    event.respondWith(handleStatic(request));
    return;
  }

  var isNavigate =
    request.mode === "navigate" ||
    (request.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (isNavigate && isApprovedShellRoute(pathname)) {
    event.respondWith(handleShellNavigation(request));
    return;
  }
  // Everything else: bypass (network handles it; nothing cached).
});
