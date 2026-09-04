/**
 * Service-worker cache policy (requirements §5.1, Phase 0 §10.2).
 *
 * Pure, unit-tested classification of requests into caching strategies. The
 * service worker (`public/sw.js`) MUST follow the same rules; this module is the
 * authoritative specification and is covered by tests.
 *
 * Security boundaries (never violated):
 * - NEVER cache platform administration surfaces (Super Admin / EGO Admin /
 *   IGO Admin / platform provisioning).
 * - NEVER cache `/api/**` responses (including NextAuth) — they may contain
 *   secrets or another user's/store's data.
 * - NEVER cache authenticated server HTML. Approved Mini Mart navigations use a
 *   network-first strategy that, when offline, falls back to a PRE-CACHED static
 *   offline shell — the dynamic authenticated HTML is never stored.
 * - Only immutable, non-sensitive static assets are cache-first.
 */

export type CacheStrategy =
  /** SW does nothing; request goes straight to the network, never stored. */
  | "bypass"
  /** Cache-first for immutable, non-sensitive static assets. */
  | "static-immutable"
  /** Network-first navigation; offline falls back to the cached offline shell. */
  | "shell-navigation";

/** Path prefixes that must NEVER be cached or served from cache. */
export const NEVER_CACHE_PREFIXES: readonly string[] = [
  "/super-admin",
  "/ego-admin",
  "/igo-admin",
  "/businesses", // (platform) provisioning
  "/template-shell", // (platform) template shell
  "/api", // all API incl. /api/auth (NextAuth)
];

/** Pre-auth / account routes that are not part of the offline Mini Mart shell. */
export const NON_SHELL_ROUTES: readonly string[] = [
  "/login",
  "/register",
  "/auth",
  "/onboarding",
];

/** Approved Mini Mart routes eligible for the offline shell navigation strategy. */
export const APPROVED_SHELL_ROUTES: readonly string[] = [
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

/** Immutable, non-sensitive static asset paths (safe to cache-first). */
export const IMMUTABLE_ASSET_EXACT: readonly string[] = [
  "/manifest.webmanifest",
  "/icon.svg",
  "/favicon.ico",
  "/icons/icon.svg",
  "/icons/maskable-icon.svg",
];

function startsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isNeverCachePath(pathname: string): boolean {
  return startsWithAny(pathname, NEVER_CACHE_PREFIXES);
}

export function isImmutableAsset(pathname: string): boolean {
  if (pathname.startsWith("/_next/static/")) return true;
  return IMMUTABLE_ASSET_EXACT.includes(pathname);
}

export function isApprovedShellRoute(pathname: string): boolean {
  if (startsWithAny(pathname, NON_SHELL_ROUTES)) return false;
  return startsWithAny(pathname, APPROVED_SHELL_ROUTES);
}

export interface ClassifyInput {
  pathname: string;
  sameOrigin: boolean;
  /** true when the request is a top-level navigation (Request.mode === "navigate"). */
  navigate: boolean;
}

/**
 * Classify a request into a caching strategy. Anything not explicitly allowed
 * is `bypass` (fail safe).
 */
export function classifyRequest(input: ClassifyInput): CacheStrategy {
  // Only ever act on same-origin requests.
  if (!input.sameOrigin) return "bypass";

  // Hard exclusions take precedence over everything else.
  if (isNeverCachePath(input.pathname)) return "bypass";

  // Immutable static assets: safe to cache-first.
  if (isImmutableAsset(input.pathname)) return "static-immutable";

  // Approved Mini Mart navigations: network-first with offline shell fallback.
  if (input.navigate && isApprovedShellRoute(input.pathname)) {
    return "shell-navigation";
  }

  return "bypass";
}

/** The pre-cached offline shell served when an approved navigation is offline. */
export const OFFLINE_SHELL_URL = "/offline";
