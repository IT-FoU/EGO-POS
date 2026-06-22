# B8-3 — Server-side Permission Enforcement — Completion Report

**Phase:** B8-3 (G3 — granular permissions, expanded to all critical modules)
**Scope:** Server-side permission enforcement across POS, Products, Inventory, Purchasing, Suppliers, Customers, Membership, Promotions, Reports, Settings, Staff, and Approvals. No B8-4 reports work. No UI redesign. B7 / B8-1 / B8-2 behavior preserved.
**Result:** **PASS**

---

## 1. Audit summary

| Layer | Before B8-3 (expanded) | After B8-3 |
| --- | --- | --- |
| **Server actions (writes)** | Already used `requireWritePermission` per module | Unchanged — verified complete |
| **API POST/PATCH/DELETE** | Used `runWrite` + `WRITE_PERMISSIONS` | Now uses `requireApiSession` (401 JSON, no redirect) + 403 on deny |
| **API GET** | **No session or read-permission checks** on products/customers/suppliers/promotions/membership/reports/settings | **`runRead`** with `requireApiSession` + `READ_PERMISSIONS` |
| **POS checkout** | `pos.sell` + POS policy guard (`create_sale`, `apply_discount`) | Preserved (B8-3 initial + this pass) |
| **Client UI** | `enforcePosAction` client-only for void/refund/hold/etc. | Unchanged — no server endpoints for those actions yet |

---

## 2. Changes implemented

### `lib/auth/session.ts`
- Added `ApiUnauthorizedError` and `requireApiSession()` — API routes return **401 JSON** instead of redirecting unauthenticated callers.
- `requireSession()` (pages/server actions) unchanged — still redirects to `/login`.

### `lib/auth/permissions.ts`
- Added `READ_PERMISSIONS` for module view access (`products.view`, `inventory.view`, `reports.view`, etc.).
- Split `WritePermissionKey` / `ReadPermissionKey` / `PermissionKey` types.
- Added `requireReadPermission()` for server-side read guards.

### `features/access-control/permission-catalog.ts`
- Added read-permission alias groups and `purchasing.edit` alias.

### `lib/api/write-response.ts`
- Added `runRead()` for authenticated, permission-gated GET handlers.
- `runWrite()` now uses `requireApiSession` and maps errors: **401** unauthorized, **403** permission denied, **400** other.

### API GET routes secured (session + read permission + tenant-scoped Prisma)
- `/api/products`, `/api/products/categories` → `products.view`
- `/api/customers` → `customers.view`
- `/api/suppliers` → `purchasing.view`
- `/api/promotions` → `promotions.view`
- `/api/membership-levels` → `membership.view`
- `/api/reports` → `reports.view` (report **data/calculations unchanged** — auth gate only)
- `/api/settings` GET → `settings.view`

### POS (preserved from initial B8-3)
- `features/pos/pos-permission-guard.ts` — actual-role policy + `assertPosActionAllowed`
- `features/access-control/pos-policy-loader.ts` — `getUserPermissionKeys` (not template lookup)
- `completePrismaSale` — enforces `create_sale` + `apply_discount` server-side

### Harness
- `scripts/phase-b8-3-pos-permission-check.ts` expanded to **42 checks**: POS policy, checkout discount caps, cross-module write/read matrix (Owner/Manager/Cashier), cross-company block, API guard static verification.

---

## 3. Module enforcement matrix

| Module | Server actions | API writes | API reads |
| --- | --- | --- | --- |
| POS | `pos.sell` + policy guard | `pos.sell` + policy guard | N/A (SSR snapshot) |
| Products | `products.*`, `categories.manage` | same | `products.view` |
| Inventory | `inventory.*` | same | SSR only |
| Purchasing | `purchasing.*` | same | SSR only |
| Suppliers | `suppliers.*` | same | `purchasing.view` |
| Customers | `customers.*` | same | `customers.view` |
| Membership | `membership_levels.manage` | same | `membership.view` |
| Promotions | `promotions.*` | same | `promotions.view` |
| Reports | N/A | N/A | `reports.view` |
| Settings | `settings.manage` | PATCH gated | `settings.view` |
| Staff / Roles | `staff.edit`, `roles.manage` | via actions | SSR only |
| Approvals | `approvals.approve` + rule-specific requester perm | same | SSR only |
| QR payments | `settings.manage` | via actions | SSR only |

---

## 4. Role hierarchy (preserved)

| Role | POS sell | Manual discount | Back-office writes | Reports view |
| --- | --- | --- | --- | --- |
| Owner | ✓ | unlimited | ✓ all | ✓ |
| Manager | ✓ | ≤ threshold (10%) | ✓ operational | ✓ |
| Cashier | ✓ | 0% (blocked) | ✗ blocked | ✗ blocked |
| Non-member | ✗ | — | ✗ | ✗ |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (60/60 pages) |
| B8-3 harness | **42 / 42 PASS** |
| B8-1 checkout regression | 29 / 29 PASS |
| B8-2 approval regression | 29 / 29 PASS |
| B7-1 / B7-2 / B7-3 / B7-4 | 12 / 16 / 22 / 14 — all PASS |

---

## 6. Remaining (NOT B8-3 / NOT B8-4)

- POS void/refund/hold/cash/shift — still client-only (no server endpoints); when added, must call `assertPosActionAllowed` + B8-2 approval engine.
- POS override approvals still localStorage in UI — wiring to DB approval engine is a separate phase.
- Reports Report Center mock UI — **deferred to B8-4** (reports data/auth gate added here only).

---

## 7. Result

**B8-3 Server-side Permission Enforcement: PASS.** All critical module writes were already server-gated; this pass closes the API read-path gap, standardizes 401/403 responses, and verifies the full Owner/Manager/Cashier matrix. Reports calculations unchanged.

**GO for B8-4 planning** — pending your confirmation before starting implementation.
