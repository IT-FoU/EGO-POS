# Phase A2 Manual UI Reality Test Report

**Date:** 2026-06-21  
**Scope:** Owner / Manager / Cashier UI flows across all dashboard modules  
**Harness:** `node scripts/phase-a2-ui-run.mjs` (Playwright headless)  
**Server:** Fresh `npm run build` + `IGO_DEMO_MODE=false npx next start --port 3001`

---

## Final Result

# FAIL

**B7 gate: NO-GO** — one confirmed **REAL BUG** blocks POS checkout in UI (duplicate `sale_no`). Product and customer failures were **test-script issues** only.

---

## 9. Retest of failed scenarios only (corrected harness)

**Run:** 2026-06-21 UI Reality Verification  
**Command:** `IGO_DEMO_MODE=false node scripts/phase-a2-retest-failures.mjs`

| Scenario | Result |
| --- | --- |
| F1 Product search after create | **PASS** |
| F2 Customer refresh | **PASS** |
| F3 Manager POS checkout | **FAIL** (duplicate `sale_no`) |
| F3 Cashier POS checkout | **FAIL** (duplicate `sale_no`) |

**Score:** 2/4 passed (failed scenarios only)

---

## 1. Old-build test result (invalid — superseded)

Tests run earlier against a **stale production server** (pre-rebuild, without A1 product-list fix):

| Metric | Result |
| --- | --- |
| Automated checks | 24–34 / 38–42 passed |
| Overall | **FAIL** |
| Known issue | Server bundle predated `productInventoryScopeWhere` fix; `npm run build` blocked |

This result is **not** used for the B7 gate. Testing against the old server was stopped per instruction.

---

## 2. Rebuild blocker — root cause and fix

| Blocker | Root cause | Fix applied |
| --- | --- | --- |
| `npm run build` TypeScript failure | `seededRoles` assigned inside `prisma.$transaction` callback; TypeScript narrowed it to `never` after the transaction | Return `{ seededRoles, summary }` from the transaction instead of mutating an outer `let` |
| `.next` delete / rebuild `EPERM` | OneDrive file lock on `.next` while `next start` held port 3001 | Stopped processes on port 3001, removed `.next`, rebuilt |
| `tsc` failures in test scripts | Implicit `any` and incomplete session payload types | Minimal type fixes in `scripts/phase-a1-*.ts` |

### Commands executed (successful)

```bash
# Stop port 3001 holders
Get-NetTCPConnection -LocalPort 3001 | Stop-Process ...

# Clean + verify + build
Remove-Item -Recurse -Force .next
npm run typecheck   # PASS
npm run build       # PASS (Next.js 16.2.9)

# Fresh server
IGO_DEMO_MODE=false npx next start --hostname 127.0.0.1 --port 3001
```

### Code change (seed)

`prisma/seed-demo.ts` — `seedRoleTemplatePermissions` now receives roles from transaction return value:

```typescript
const { seededRoles, summary } = await prisma.$transaction(async (tx) => {
  const foundation = await seedFoundation(tx);
  // ...
  return { seededRoles: foundation.roles, summary: { ... } };
}, { timeout: 120000 });

await seedRoleTemplatePermissions(companyId, {
  Custom: seededRoles.customRole,
  Manager: seededRoles.managerRole,
  Owner: seededRoles.ownerRole,
  "Staff/Cashier": seededRoles.cashierRole,
}, prisma);
```

---

## 3. Fresh-build retest result

**Run:** 2026-06-21 after successful rebuild  
**Environment:** `IGO_DEMO_MODE=false`, `http://127.0.0.1:3001`  
**Score:** **41 / 45** automated checks passed

### By role

| Role | Login | Pages (10 modules) | CRUD / actions | Logout | Re-login |
| --- | --- | --- | --- | --- | --- |
| **Owner** | PASS | 10/10 PASS | Product create PASS; search FAIL; customer create PASS; flow aborted before membership/promotions/settings/POS | — | — |
| **Manager** | PASS | 10/10 PASS | POS checkout FAIL; settings save blocked PASS (expected) | PASS | PASS |
| **Cashier** | PASS | 10/10 PASS | POS checkout FAIL; settings save blocked PASS (expected) | PASS | PASS |

### Module PASS / FAIL (fresh build)

| Module | PASS / FAIL | Notes |
| --- | --- | --- |
| Login | **PASS** | All three roles |
| Dashboard | **PASS** | All roles, HTTP 200 |
| Products | **FAIL** | Create PASS; list search after create FAIL (Owner) |
| Customers | **FAIL** | Create PASS; refresh/search not completed (automation selector) |
| Membership | **NOT TESTED** | Owner flow aborted before membership step |
| Promotions | **NOT TESTED** | Owner flow aborted |
| Inventory | **NOT TESTED** | Owner flow aborted |
| Purchasing | **PASS** | Page load only |
| Reports | **PASS** | Page load only |
| Settings | **PARTIAL** | Owner save not reached; Manager/Cashier save correctly **blocked** |
| POS Checkout | **FAIL** | Page load PASS; Manager/Cashier sale completion FAIL |

---

## 4. Failure detail (fresh build)

## 4. UI Reality Verification (2026-06-21)

Investigation scripts: `scripts/phase-a2-db-check.ts`, `scripts/phase-a2-pos-db-check.ts`, `scripts/phase-a2-retest-failures.mjs`, `scripts/phase-a2-retest-pos.mjs`  
Environment: `IGO_DEMO_MODE=false`, fresh server on `http://127.0.0.1:3001`

### Verdict summary

| Failure | Verdict | Evidence |
| --- | --- | --- |
| **F1** Owner product search after create | **TEST SCRIPT ISSUE** | Product persisted in PostgreSQL; appears after page reload + correct search |
| **F2** Owner customer refresh | **TEST SCRIPT ISSUE** | Customer persisted; list refresh works with correct selector |
| **F3** Manager/Cashier POS checkout | **REAL BUG** | UI sale fails: duplicate `sale_no` (`A0001` already exists); repository sale path works |

---

### F1 — Owner product search after create → **TEST SCRIPT ISSUE**

**PostgreSQL check (prior A2 SKU `A2-1782049664447`):**
- Row exists: `id=cmqnucz9b00083obhc3p1gkc7`, `nameEn=A2 Product 1782049664447`
- `getPrismaProducts` (SSR path): **contains=true** (33 products)

**Browser (corrected harness):**
- `/products` → reload → search `input.h-11.w-full` → SKU **visible in table**

**Retest (new product `A2R-*`):** PASS — `listed=true`

**Root cause in original harness (`phase-a2-ui-run.mjs`):**
- `waitForURL(/\/products/)` also matches `/products/new` (false-positive navigation)
- Search selector `input.h-11.w-full` is correct; failure was timing/navigation, not missing data

**Conclusion:** Product is saved and appears after refresh. Not a persistence or list-filter bug.

---

### F2 — Owner customer refresh → **TEST SCRIPT ISSUE**

**PostgreSQL:** Customer create succeeded in original A2 run (Create PASS).

**Browser (corrected harness):**
- Search input: `input.field-input.pl-10` (not `input.h-11` or `placeholder*="phone"`)
- Retest: create customer → reload `/customers` → search by phone → **visible=true** PASS

**Root cause in original harness:**
```javascript
// Wrong — matches nothing on customers page
page.locator('input[placeholder*="phone"], input[placeholder*="Phone"], input.h-11')
```
Correct selector: `input.field-input.pl-10` with localized placeholder from `ui.search.code.name.phone.email.membership`.

**Conclusion:** Customer persistence and list refresh work. Automation used wrong search input.

---

### F3 — Manager / Cashier POS checkout → **REAL BUG**

**Repository layer (`completePrismaSale`) — all roles PASS:**
| Check | manager | cashier |
| --- | --- | --- |
| Sale created | ✓ | ✓ |
| Inventory deducted | 20→19 | 19→18 |
| Payment record | 1 payment | 1 payment |

**Browser (corrected selectors):**
1. Barcode input: `input.h-14.w-full` (not `input.field-input.h-14`, which is product search)
2. Cash mode: `div.grid.grid-cols-5 button` first
3. Unit selector modal: dismiss when product has multiple units
4. Cart add: **PASS** (`DRK-PEP-CAN-001` added)

**Pay click result — FAIL with server error shown in UI:**
```
Invalid `prisma.sale.create()` invocation:
Unique constraint failed on the fields: (`company_id`, `sale_no`)
```

**PostgreSQL:** `sale_no=A0001` already exists (created 2026-06-21 12:31 UTC).

**Root cause (application bug):**
```113:113:features/pos/components/pos-page-client.tsx
const [billNo, setBillNo] = useState("A0001");
```
POS always starts at `A0001` on page load. It does not read the next available sale number from settings or the database. After the first successful sale, every new session retries `A0001` and hits the unique constraint.

**Sub-issues in original harness (test-only, now corrected):**
- Wrong barcode input selector (`field-input h-14` = product search field)
- Did not handle unit-selector modal blocking Pay
- Did not detect Prisma error message in UI body

**Receipt / loyalty:**
- Receipt generation blocked by sale_no failure (success path opens `Receipt preview` modal)
- Loyalty update works at repository layer when `customerId` is provided; not reachable in UI until sale_no bug is fixed

**Conclusion:** POS checkout UI is broken for any environment where `A0001` (or current `billNo`) already exists. This is a **REAL BUG**, not a test-script issue.

---

## 4b. Original failure notes (superseded by section 4 above)

### F4 — Settings permissions (PASS — expected)

Manager and Cashier cannot persist `receiptPrefix` changes (seed matrix excludes Settings for Manager; Cashier is POS-only). Server-side `settings.manage` guard working.

### F5 — Logout / re-login (PASS — Manager, Cashier)

Cookie clear + re-login PASS for Manager and Cashier after fresh build.

---

## 5. Comparison: old build vs fresh build

| Area | Old build | Fresh build |
| --- | --- | --- |
| Product list bug (owner in-stock filter) | Present in running bundle | Fixed in source; deployed in new build |
| `npm run build` | FAILED | **PASS** |
| All-module page loads (3 roles) | Flaky / locale mismatches | **30/30 PASS** |
| Owner product create | PASS | **PASS** |
| Owner product search | FAIL | **FAIL** (harness / UI list) |
| Manager/Cashier logout+relogin | FAIL | **PASS** |
| POS checkout (Manager/Cashier) | FAIL | **FAIL** |
| Settings permission guard | PASS | **PASS** |

---

## 6. GO / NO-GO for B7

| Gate | Decision | Rationale |
| --- | --- | --- |
| Rebuild unblocked | **GO** | `typecheck` + `build` pass; fresh server running |
| Phase A2 UI reality | **NO-GO** | POS checkout **REAL BUG**: hardcoded `billNo=A0001` collides with existing sales |
| Product/customer UI | **GO** | Verified persisted + visible after refresh (test-script issues only) |
| **Start B7** | **NO-GO** | Fix POS `sale_no` generation before B7 |

### Required before B7

1. **Fix REAL BUG:** POS must initialize `billNo` from settings / last sale number (not hardcoded `A0001`)
2. Re-verify Manager/Cashier POS checkout in browser after fix (sale + receipt + inventory)
3. Optional: loyalty UI verification with member attached at checkout

---

## 7. How to reproduce

```bash
# Prerequisites
set IGO_DEMO_MODE=false

# Server (after npm run build)
npx next start --hostname 127.0.0.1 --port 3001

# UI test
node scripts/phase-a2-ui-run.mjs
```

**Credentials:** `igo-admin` / `AdminChangeMe123!`, `manager` / `Manager123!`, `cashier` / `Cashier123!`

**Artifacts:** `scripts/phase-a2-results.json`, `scripts/phase-a2-retest-output.txt`

---

## 8. Summary table

| Phase | Result |
| --- | --- |
| Old-build A2 test | **FAIL** (invalid for gate) |
| Rebuild blocker fix | **PASS** |
| Fresh-build A2 retest | **FAIL** (41/45 checks; core UI flows incomplete) |
| **B7 readiness** | **NO-GO** |
