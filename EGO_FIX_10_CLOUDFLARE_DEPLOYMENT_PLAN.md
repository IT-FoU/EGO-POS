# EGO-FIX-10 Cloudflare Deployment Plan

Date: 2026-08-29  
Baseline: `0e65498` (`main` = `origin/main`)

## Identity

| Item | Value |
| --- | --- |
| Current Worker | `ego-pos-beta` |
| Target Worker | `egopos` |
| Current workers.dev subdomain | `i-goto` (proven: `ego-pos-beta.i-goto.workers.dev` resolves and serves Next.js) |
| Target host | `https://egopos.i-goto.workers.dev` |
| Cloudflare account | Verified OAuth; account name from Wrangler whoami (Iamgoingtothe.go@gmail.com's Account) |
| Rollback Worker | `ego-pos-beta` (LEGACY / ROLLBACK CANDIDATE — do not delete) |

## Proven hostname mapping

Expected: Worker `egopos` + subdomain `i-goto` → `egopos.i-goto.workers.dev`

| Host | DNS | HTTP |
| --- | --- | --- |
| `egopos.i-goto.workers.dev` | Resolves | 404 (Worker does not exist yet) |
| `ego-pos-beta.i-goto.workers.dev` | Resolves | 307 `/` → `/dashboard`; `/login` 200; `/super-admin/login` 200 |
| `ego-pos-beta.note-z.workers.dev` | NXDOMAIN | fail |

Cloudflare-derived hostname after deploy of `egopos`: `https://egopos.i-goto.workers.dev`  
MATCH to owner-approved URL.

Mismatch today: **A. wrong Worker name** (`ego-pos-beta` in `wrangler.jsonc`). Subdomain is already `i-goto`.

## Required config changes

* `wrangler.jsonc` `name`: `ego-pos-beta` → `egopos`
* `wrangler.jsonc` `services[WORKER_SELF_REFERENCE].service`: `ego-pos-beta` → `egopos`
* `wrangler.jsonc` `vars.NEXTAUTH_URL`: `https://egopos.i-goto.workers.dev` (public origin; not a secret)
* Keep `vars.IGO_DEMO_MODE`: `"false"`
* Keep Hyperdrive binding `HYPERDRIVE` id `b8ec6fa6a71f44e5a40a6a108ffe6a85` (`ego-pos-production-hyperdrive` → Production Supabase ref `ieutdqnlfiiaawctapor`)
* Update `scripts/phase-fix-01-worker-super-admin-login.ts` BASE to the new Production URL
* Update current readiness/blocker docs with the authoritative Production URL
* Leave historical FIX-04/audit URLs in place as historical evidence

## Bindings

| BINDING | OLD WORKER `ego-pos-beta` | TARGET `egopos` | MATCH? | REQUIRED? | ACTION |
| --- | --- | --- | --- | --- | --- |
| Worker name | `ego-pos-beta` | `egopos` (new) | NO | YES | Deploy new Worker; do not delete old |
| `HYPERDRIVE` | id `b8ec6fa6a71f44e5a40a6a108ffe6a85` | same id in wrangler.jsonc | YES after config | YES | Copy binding via wrangler.jsonc |
| `ASSETS` | OpenNext assets | same | YES after deploy | YES | Created by OpenNext deploy |
| `WORKER_SELF_REFERENCE` | service `ego-pos-beta` | service `egopos` | NO until config | YES | Rename service target |
| `IGO_DEMO_MODE` var | `"false"` | `"false"` | YES | YES | Keep |
| KV / R2 / D1 | none in wrangler.jsonc | none | YES | NO | None |

Do not use `ego-pos-test-hyperdrive` (`0e311e767c9e4dcc91cd5bcac12e40d4`) for Production.

## Required secret presence (no values)

| SECRET | OLD WORKER | TARGET | ACTION |
| --- | --- | --- | --- |
| `NEXTAUTH_SECRET` | PRESENT | MISSING (Worker not created) | After first deploy, put from local `.dev.vars` without printing |
| `NEXTAUTH_URL` | PRESENT | MISSING | Put `https://egopos.i-goto.workers.dev` (also set as wrangler var) |
| `DATABASE_URL` | not a Worker secret | not required | Worker runtime uses Hyperdrive; do not copy |

`.dev.vars` keys locally: `NEXTJS_ENV`, `IGO_DEMO_MODE`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DATABASE_URL`. `.dev.vars` is gitignored and is not the Production origin.

## Deployment command

```
npm run cf:deploy
```

(`node scripts/cf-build.cjs` then `opennextjs-cloudflare deploy`)

Direct Wrangler model: commit config first, deploy the committed tree, push after Production verification.

## Rollback plan

1. Do not delete `ego-pos-beta`.
2. If `egopos` fails: keep using `https://ego-pos-beta.i-goto.workers.dev` as rollback host.
3. Revert `wrangler.jsonc` name to `ego-pos-beta` only if a later deploy must update the legacy Worker.
4. No GO BOX data rollback is required; this phase does not mutate business data.

## Safety gate

Proceed only if: account verified, subdomain `i-goto`, target name `egopos`, Production Hyperdrive, demo mode false, Next.js compile PASS, rollback Worker retained.

## Build result (this machine)

* `npm run typecheck`: PASS
* Next.js compile (`next build` inside `cf:build`): PASS (90/90 pages)
* OpenNext packaging: ENVIRONMENT BLOCKED — Windows/OneDrive `copyFile ENOENT` for `.open-next/.build/open-next.config.edge.mjs`. Retry after deleting `.open-next` hit `EPERM unlink` on `.next/static` leftover. Do not change product code for this. Deploy from WSL or a non-OneDrive checkout.

Production Worker `egopos` was **not deployed** from this Windows/OneDrive session.
