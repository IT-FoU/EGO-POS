# Milestone A — Production Build Recovery

**Date:** 21 June 2026  
**Scope:** Milestone A only — fix build-blocking issues  
**Out of scope (unchanged):** Business logic, permissions, reports, offline architecture

---

## Goal

Investigate and fix the production build failure reported at `/api/membership-levels` (CRIT-015), then verify `npm run typecheck` and `npm run build` pass.

---

## Root Cause Analysis

### Primary failure: `/api/membership-levels`

| Item | Detail |
|------|--------|
| **Symptom** | `Error: Failed to collect page data for /api/membership-levels` |
| **Root cause** | During `next build`, Next.js executes route handlers / server components to collect page data. `getMembershipLevels()` **always** calls `requireSession()` + Prisma — unlike `getProducts()` which skips the database in demo mode. Build-time execution fails when auth/DB context is unavailable or tenant data is missing. |
| **Affected files** | `app/api/membership-levels/route.ts`, `app/(dashboard)/membership-levels/page.tsx`, `features/membership-levels/membership-level-service.ts` |

### Secondary failure (discovered with `IGO_DEMO_MODE=false`)

| Item | Detail |
|------|--------|
| **Symptom** | `Route /customers/[id] used headers() inside generateStaticParams` |
| **Root cause** | Dynamic tenant pages used `generateStaticParams()` calling services that invoke `requireSession()` / `headers()` at build time — invalid in Next.js App Router. |
| **Affected files** | `customers/[id]`, `suppliers/[id]`, `promotions/[id]`, `promotions/[id]/edit` pages |

---

## Fixes Applied

### 1. Build-phase helper (infrastructure)

**New file:** `lib/build/build-phase.ts`

- Detects `NEXT_PHASE === "phase-production-build"`
- Allows route boundaries to skip DB/session work during build only
- **No runtime behavior change** when serving requests

### 2. Membership levels routes

| File | Change |
|------|--------|
| `app/api/membership-levels/route.ts` | Added `export const dynamic = "force-dynamic"`; build-phase guard returns `{ data: [], ok: true }` during build |
| `app/api/membership-levels/[id]/route.ts` | Added `export const dynamic = "force-dynamic"` |
| `app/(dashboard)/membership-levels/page.tsx` | Added `export const dynamic = "force-dynamic"`; build-phase guard returns empty levels array during build |

### 3. Dynamic detail pages (build blockers)

Removed invalid `generateStaticParams()` and added `force-dynamic` + build-phase guards:

| File | Change |
|------|--------|
| `app/(dashboard)/customers/[id]/page.tsx` | Removed `generateStaticParams`; dynamic + build guard |
| `app/(dashboard)/suppliers/[id]/page.tsx` | Same |
| `app/(dashboard)/promotions/[id]/page.tsx` | Same |
| `app/(dashboard)/promotions/[id]/edit/page.tsx` | Same |

### What was NOT changed

- Permission rules or enforcement
- Reports logic or data sources
- Offline / PWA architecture
- POS, promotion, membership business rules
- Prisma schema or service-layer business logic

---

## Verification Results

| Command | Environment | Result |
|---------|-------------|--------|
| `npm run typecheck` | Default | **PASS** (exit 0) |
| `npm run build` | `IGO_DEMO_MODE=false` (production simulation) | **PASS** (exit 0) |
| `npm run build` | Default (`.env.local` demo on) | **Intermittent EPERM** on `.next` cleanup (OneDrive file lock — environment issue, not code) |

Production-mode build completed successfully:

- Compiled successfully
- TypeScript finished
- Collected page data (57 static pages)
- All routes including `/api/membership-levels` and `/membership-levels` marked dynamic (`ƒ`)

---

## Files Changed

| File | Action |
|------|--------|
| `lib/build/build-phase.ts` | Created |
| `app/api/membership-levels/route.ts` | Modified |
| `app/api/membership-levels/[id]/route.ts` | Modified |
| `app/(dashboard)/membership-levels/page.tsx` | Modified |
| `app/(dashboard)/customers/[id]/page.tsx` | Modified |
| `app/(dashboard)/suppliers/[id]/page.tsx` | Modified |
| `app/(dashboard)/promotions/[id]/page.tsx` | Modified |
| `app/(dashboard)/promotions/[id]/edit/page.tsx` | Modified |

**Total:** 1 new file, 7 modified files

---

## CRIT-015 Status

| Issue | Status |
|-------|--------|
| CRIT-015 — Production build failure on `/api/membership-levels` | **RESOLVED** |

---

## Remaining Milestone A Items (Not in This Pass)

Per `PRODUCTION_READINESS_REPORT.md`, full Milestone A also includes (deferred):

- Unify demo mode semantics (`IGO_DEMO_MODE` defaults)
- Server-side permission enforcement
- Remove mock/localStorage from production UI paths

These were explicitly excluded from this recovery pass.

---

## GO / NO-GO — Production Build

# GO

| Criterion | Status |
|-----------|--------|
| `npm run typecheck` passes | ✅ |
| `npm run build` passes (production mode) | ✅ |
| Build-blocking `/api/membership-levels` failure fixed | ✅ |
| No business logic / permission / report / offline changes | ✅ |

**Note:** Go BOX **Pilot Launch** remains **NO-GO** (see `PRODUCTION_READINESS_REPORT.md`). This milestone resolves **deployable production build** only.

---

*Milestone A — Production Build Recovery complete.*
