# EGO-FIX-04 Browser Smoke Report

Date: 2026-08-28  
UAT URL: `http://localhost:3000`  
Command: `npm run dev` (Next.js 16.2.12, Node v22.19.0)  
Repeatable command: `npm run dev:uat`

## Environment

Port 3000 was occupied by a hung EGO POS `next dev --hostname 0.0.0.0 -p 3000` process (PID 20156, started 2026-08-26). HTTP to that listener timed out. After stopping that project process, TCP bind succeeded on `127.0.0.1`, `localhost`, and `0.0.0.0` for port 3000. Windows excluded TCP ranges were only `50000-50059`. The historical `listen EACCES` on `127.0.0.1:3000` was this stuck listener / prior occupancy, not a current Hyper-V exclusion.

Alternate binds: 3001, 3010, 3100 all PASS. They were not needed after port 3000 was freed.

Use `http://localhost:3000`, not `http://127.0.0.1:3000`. Existing development middleware canonicalizes `127.0.0.1:3000` to `localhost:3000`.

`npm run dev` without `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` still reached Ready, then logged an unhandled Hyperdrive rejection. Pages still loaded because Prisma used `DATABASE_URL` from `.env.local`. `npm run dev:uat` sets the Hyperdrive local emulation string the same way `cf-build` does, without printing secrets.

## Production host

Configured worker: `ego-pos-beta`  
Configured hostname: `ego-pos-beta.note-z.workers.dev`

From this PC: DNS name does not exist; HTTP not reachable. Not changed in FIX-04.

## Browser automation

No Playwright package is installed. Cursor browser tools were not available. Smoke used:

* HTTP cookie harness: `npm run test:browser-smoke` (25/25 PASS)
* Headless Edge `--dump-dom` on `/login` (login form rendered)

## Public/auth

| Path | Result |
| --- | --- |
| `/login` | 200 LOADS |
| `/login?locale=en` | 200 LOADS |
| `/login?locale=lo` | 200 LOADS |
| `/super-admin/login` | 200 LOADS |
| `/` | 307 `/dashboard` |

Language toggle on store login is TH/EN, not LAO. `locale=lo` still rendered the English store-access copy.

## Super Admin

Login via `/api/super-admin/login` succeeded. `/super-admin`, `/super-admin/stores`, and `/super-admin/stores/new` loaded. Create Store was not submitted. Logout returned the login redirect.

A platform audit login row may be written by the existing login API. No store was created.

## Store Owner

GO BOX `gobox` login via NextAuth credentials succeeded. Dashboard and nav pages loaded. Manager/Cashier: NOT TESTED (not present on Production).

## Core pages (authenticated Owner)

| Page | Classification |
| --- | --- |
| Dashboard | EMPTY STATE |
| Products | EMPTY STATE |
| Inventory | LOADS |
| Suppliers | LOADS |
| Purchasing | LOADS |
| Customers | LOADS |
| Membership | LOADS |
| Promotions | LOADS |
| POS | LOADS |
| Recent Sales | no dedicated route; covered by POS |
| Reports | EMPTY STATE (slow first compile ~35s) |
| Settings | LOADS |

No 403/404/500 on those routes. No redirect loops on `localhost`. Global CSS `/_next/static/chunks/app_globals_0yg4wg8.css` returned 200.

## Console / network

HTTP harness: 0 API 5xx. Edge dump-dom of login: form visible; no app crash overlay. Edge stderr had Chromium task-manager noise only.

## New findings (not fixed)

| Severity | Module | Finding |
| --- | --- | --- |
| P1 | DEPLOYMENT | `ego-pos-beta.note-z.workers.dev` does not resolve on this PC |
| P1 | ENVIRONMENT | `next dev` without Hyperdrive local env throws an unhandled rejection |
| P2 | ENVIRONMENT | `127.0.0.1:3000` is redirected to `localhost:3000` by existing middleware |
| P2 | REPORTS | `/reports` first compile ~35s |
| P2 | AUTH | Login locale control is TH/EN; `locale=lo` does not show Lao copy |
| P2 | ENVIRONMENT | `scripts/phase-a2-final-verification.mjs` imports Playwright, package not installed |
| P3 | POS | Recent Sales is not a standalone route |

Prior P1-1 first-stock Quick Stock In handoff remains open from the production audit.

## Repeatable UAT

```
npm run dev:uat
```

Then open `http://localhost:3000` and/or `npm run test:browser-smoke`.

## Validation

* `npm run typecheck` PASS
* bare `npm run build` FAIL: missing Hyperdrive local connection string (same env gap as `npm run dev`)
* `npm run cf:build` Next.js compile + TypeScript + 90 static pages PASS
* OpenNext Windows/OneDrive `copyFile` ENOENT remains a known packaging issue, unchanged by FIX-04
