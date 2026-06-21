# A2 Hotfix — POS Bill Number Generation

**Date:** 2026-06-21  
**Hotfix ID:** A2-F3  
**Scope:** POS checkout `sale_no` collision bug only  
**B7 status:** NOT STARTED

---

## Problem

POS initialized bill number as hardcoded `A0001`:

```typescript
const [billNo, setBillNo] = useState("A0001");
```

When `A0001` already existed in PostgreSQL (`@@unique([companyId, saleNo])`), Pay failed with:

```
Unique constraint failed on the fields: (`company_id`, `sale_no`)
```

This blocked Owner, Manager, and Cashier UI checkout even though `completePrismaSale` worked at repository layer.

---

## Fix

### 1. Sale number utilities (`features/pos/sale-no.ts`)

- `formatPosSaleNo(prefix, sequence)` — e.g. `GB0002`, `A157420003`
- `parsePosSaleNoSequence(saleNo, prefix)` — extract numeric suffix
- `getNextPosSaleNoFromExisting(saleNos, prefix)` — max sequence + 1
- `getFollowingPosSaleNo(current, prefix)` — client increment after successful sale

Uses `companySetting.receiptPrefix` (default `INV`).

### 2. Server: next number from database (`features/pos/prisma-repository.ts`)

- `getNextPosSaleNo(companyId, prefix)` — queries existing `sale.saleNo` values with matching prefix
- `resolvePosSaleNo(...)` — inside `completePrismaSale` transaction:
  - Accept client `saleNo` if unused and matches prefix pattern
  - Otherwise allocate next available number (race-safe fallback)

### 3. POS snapshot (`getPrismaPosSnapshot`)

Returns `nextSaleNo` computed from database + `receiptPrefix`.

### 4. POS page wiring

- `app/(dashboard)/pos/page.tsx` — passes `nextSaleNo` to client
- `features/pos/components/pos-page-client.tsx`:
  - Removed hardcoded `A0001`
  - `billNo` initialized from `nextSaleNo` prop
  - After successful sale, uses `result.data.saleNo` and `getFollowingPosSaleNo()` for next bill
  - Removed unused `generateNextBillNo("A...")` helper

**No UI design or layout changes.**

---

## Files changed

| File | Change |
| --- | --- |
| `features/pos/sale-no.ts` | **NEW** — sale number helpers |
| `features/pos/prisma-repository.ts` | DB next number + transaction resolve |
| `features/pos/components/pos-page-client.tsx` | Use `nextSaleNo` prop, prefix-aware increment |
| `app/(dashboard)/pos/page.tsx` | Pass `nextSaleNo` |
| `scripts/phase-a2-retest-failures.mjs` | Owner POS without re-login; duplicate detection |
| `scripts/phase-a2-hotfix-billno-check.ts` | Pre-sale collision check |
| `scripts/phase-a2-hotfix-duplicate-check.mjs` | Consecutive sale uniqueness check |

---

## Verification

**Environment:** `IGO_DEMO_MODE=false`, fresh `npm run build`, `npx next start --port 3001`

### Pre-checkout collision check

```json
{
  "prefix": "A15742",
  "nextSaleNo": "A157420001",
  "collision": false
}
```

(`receiptPrefix` is `A15742` from prior A2 settings probe in demo company.)

### A2 failed scenarios only (`phase-a2-retest-failures.mjs`)

| Scenario | Result |
| --- | --- |
| F1 Owner product search after create | **PASS** |
| F2 Owner customer refresh | **PASS** |
| F3 Owner POS checkout | **PASS** |
| F3 Manager POS checkout | **PASS** |
| F3 Cashier POS checkout | **PASS** |

**Score: 5/5**

Artifact: `scripts/phase-a2-retest-failures.json`

### Duplicate `sale_no` check (consecutive Cashier sales)

```json
{
  "first": { "duplicate": false, "success": true },
  "second": { "completedSaleNo": "A157420005", "duplicate": false, "success": true },
  "pass": true
}
```

No `unique constraint` errors. Sequential sale numbers issued under company prefix.

---

## Outcome

| Check | Status |
| --- | --- |
| Hardcoded `A0001` removed | ✓ |
| Next bill from DB / `receiptPrefix` | ✓ |
| Owner checkout | ✓ |
| Manager checkout | ✓ |
| Cashier checkout | ✓ |
| Duplicate `sale_no` prevented | ✓ |
| UI design unchanged | ✓ |
| B7 started | **NO** |

---

## How to reproduce

```bash
set IGO_DEMO_MODE=false
npm run build
npx next start --hostname 127.0.0.1 --port 3001

npx tsx scripts/phase-a2-hotfix-billno-check.ts
node scripts/phase-a2-retest-failures.mjs
node scripts/phase-a2-hotfix-duplicate-check.mjs
```

**Credentials:** `igo-admin` / `AdminChangeMe123!`, `manager` / `Manager123!`, `cashier` / `Cashier123!`

---

## Notes

- Bill numbers follow `receiptPrefix` from company settings (demo: `A15742` → `A157420001`, `A157420002`, …).
- Server-side `resolvePosSaleNo` provides a safety net if the client sends a stale or colliding number.
- Receipt preview opens on successful Pay; inventory deduction confirmed via prior repository tests and successful UI completion.
