# Milestone B6 — Staff, Permissions, Role Templates and Approval Rules Report

**Date:** 21 June 2026  
**Scope:** Move staff management, permission matrix, role templates, and approval rules from demo/localStorage to Prisma/PostgreSQL; connect auth and server permission checks  
**Out of scope:** Offline sync, POS checkout logic changes, POS pending-approval localStorage (dev debug panel)

---

## Executive Summary

Milestone B6 introduced **Prisma-backed staff membership**, **role template permissions**, **approval rules**, and **pending approval records**. Settings Staff Control now loads and persists through server actions. `assertPermission()` no longer bypasses checks in demo mode and resolves permissions from the database with legacy key aliases.

POS permission policy is loaded from **role permissions + approval rules** in PostgreSQL via `createPosPermissionPolicyFromDatabase()` (checkout behavior unchanged; policy source is now DB-backed).

**Verification:** `npm run typecheck` PASS · `npm run build` PASS · `npm run db:seed:demo` PASS · `prisma migrate diff` empty PASS

---

## What Changed

### Schema

| Model / change | Purpose |
|----------------|---------|
| `CompanyUser` extended | `branchId`, `assignedTerminal`, `allowPosAccess`, `allowBackOfficeAccess`, `requirePasswordChange` |
| `Role.templateKey` | `owner` / `manager` / `cashier` / `custom` |
| `ApprovalRule` | Company-scoped discount, refund, stock adjustment, purchasing thresholds |
| `Approval` extended | Branch, action, payload fields, decision metadata |
| `ApprovalStatus` | Added `cancelled`, `expired` |

### Access control module (`features/access-control/`)

| File | Role |
|------|------|
| `permission-catalog.ts` | Module/action matrix keys, legacy aliases, default templates |
| `types.ts` | Staff, matrix, approval DTOs |
| `prisma-repository.ts` | Snapshot, staff CRUD, role permissions, approval rules, user permission keys |
| `actions.ts` | Server actions with revalidation |
| `pos-policy-loader.ts` | Build `PosPermissionPolicy` from DB |

### Settings UI

- New `features/settings/components/staff-control-section.tsx` — Prisma-backed staff list, matrix, approval rules, pending approvals
- `app/(dashboard)/settings/page.tsx` loads `getStaffAccessSnapshot()`
- Removed demo staff/permission block from `settings-form.tsx`

### Auth & permissions

- `lib/auth/options.ts` — Prisma login loads `CompanyUser` access flags, branch assignment, company-scoped roles
- `lib/auth/permissions.ts` — Removed `isDemoMode()` bypass; alias-aware `assertPermission()` via `getUserPermissionKeys()`

### POS

- `app/(dashboard)/pos/page.tsx` — `createPosPermissionPolicyFromDatabase()` (no checkout logic change)

### Seed

- `seed-demo.ts` — Custom role, template keys, staff branch/terminal fields, approval rules, batched role permissions (outside main transaction)

---

## Files Changed

| Area | Files |
|------|-------|
| Schema | `prisma/schema.prisma` |
| Migrations | `20260621_b6_staff_permissions_approvals`, `20260621_b6_schema_drift_fix` |
| Access control | `features/access-control/*` (**new**) |
| Settings | `staff-control-section.tsx` (**new**), `settings-form.tsx`, `app/(dashboard)/settings/page.tsx` |
| Auth | `lib/auth/permissions.ts`, `lib/auth/options.ts` |
| POS | `app/(dashboard)/pos/page.tsx` |
| Seed | `prisma/seed-demo.ts` |

---

## Demo Systems Removed

| Removed | Location |
|---------|----------|
| `demoStaffRepository` staff list/create/edit/disable | Settings Staff Control |
| `writeDemoStaffCookie` / `demo-staff-access` seeding in settings UI | Settings Staff Control |
| Local `buildDefaultPermissions()` matrix (non-persistent) | Settings Staff Control |
| Demo approval rule card state only | Replaced with `approval_rules` table |
| `isDemoMode()` bypass in `assertPermission()` | `lib/auth/permissions.ts` |
| Hardcoded `createPosPermissionPolicy()` on POS page | `app/(dashboard)/pos/page.tsx` |

---

## Remaining Demo Systems

| System | Location | Notes |
|--------|----------|-------|
| `demoSettingsRepository` | Settings company logo | B7+ settings persistence |
| Customer display localStorage | `settings-form.tsx` | IPC by design |
| `demoPendingApprovalRepository` | `pos-page-client.tsx` | POS dev/debug panel only; checkout unchanged per scope |
| `authorizeDemoUser` / `demoLoginUsers` | `lib/auth/options.ts` | Only when `IGO_DEMO_MODE=true` |
| `isDemoMode()` in `write-context.ts` | Demo write path | Separate from permission enforcement |
| Staff ranking / activity monitor UI | Not in new staff section | Cosmetic placeholders deferred |
| Granular POS action permissions UI checkboxes | Permission groups removed from settings | Matrix covers module-level; POS actions derived from `pos.*` keys |

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run db:seed:demo` | **PASS** (after batched permission seed + post-transaction seed) |
| `npx prisma migrate deploy` | **PASS** |
| `npx prisma migrate diff` | **PASS** (empty) |

---

## GO / NO-GO for B7

### **GO**

B6 acceptance criteria met:

1. Staff list/create/edit/deactivate with branch and role assignment — Prisma-backed
2. Role templates Owner, Manager, Cashier, Custom — persisted with `templateKey`
3. Permission matrix — `permissions` + `role_permissions` tables
4. Approval rules — `approval_rules` table (discount, refund, stock adjustment, purchasing)
5. Auth integration — session carries branch, access flags, roles; `assertPermission` uses DB
6. Demo permission bypass removed from server enforcement
7. POS checkout and offline sync not modified

**Suggested B7 focus:** Offline sync foundation, cash-session POS UI wiring, company logo persistence, and report hub filter re-query per foundation plan.

---

## Apply on Any Environment

```bash
npx prisma generate
npx prisma migrate deploy
IGO_DEMO_MODE=false npm run db:seed:demo
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
