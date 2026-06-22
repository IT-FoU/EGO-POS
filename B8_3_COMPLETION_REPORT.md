# B8-3 — POS Permission Enforcement — Completion Report

**Phase:** B8-3 (POS granular permission enforcement, gap G3)
**Scope:** B8-3 only. Server-side permission enforcement for POS. Approval engine, purchasing workflow, and inventory workflow **not modified**. Git `main` baseline. B7 / B8-1 / B8-2 behavior preserved.
**Result:** **PASS**

---

## 1. Audit — all POS actions and where they were enforced

| POS action | Server endpoint? | Before B8-3 | After B8-3 |
| --- | --- | --- | --- |
| `create_sale` | **Yes** (`completeSaleAction` → `completePrismaSale`) | `pos.sell` only | `pos.sell` **+ server policy `create_sale` check** |
| `apply_discount` | Embedded in checkout payload | **client-only** (`enforcePosAction`), bypassable via API | **server-enforced**: requires permission + within role discount limit; over-limit rejected |
| `manual_price_override` | Embedded in checkout payload | client-only | **structurally neutralized by B8-1** (server ignores client prices, recomputes from DB) |
| `void_bill`, `refund_bill`, `hold_bill`, `resume_bill`, `delete_item_from_bill`, `cash_in`, `cash_out`, `split_payment`, `multi_currency_payment` | **No server endpoint** (client cart only) | client-only | unchanged — no server write surface yet; guard ready for when they get endpoints |

Two concrete gaps were closed: (a) the policy was built from a **template-role lookup**, not the user's actual role; (b) **`apply_discount` had no server enforcement** and was bypassable by calling the checkout API directly with a discount.

---

## 2. Changes implemented

### `features/access-control/pos-policy-loader.ts`
- Permission keys are now sourced from the logged-in user's **actual assigned roles** via `getUserPermissionKeys(tenant)` (owner ⇒ `*`), replacing the `snapshot.roles.find(templateKey === …)` template lookup. Requirement #3 satisfied.
- `maxDiscountPercent` is now **role-aware** to preserve the hierarchy: **Owner 100%**, **Manager = company discount threshold (default 10%)**, **Cashier 0%**. The threshold raises only the Manager ceiling, never the Cashier's.

### `features/pos/pos-permission-guard.ts` (new)
- `buildPosPolicyForTenant(tenant)` — resolves the user's **actual** role from the DB (`companyUser.isOwner` + `userRole.role.templateKey`; unknown/custom ⇒ cashier/least-privilege) and builds the authoritative server policy.
- `assertPosActionAllowed(policy, action, ctx)` — evaluates `evaluatePosPermission` and throws `PermissionDeniedError` when not allowed. "Approval required" is treated as **deny** server-side (no approved-decision token participates in a live checkout payload).

### `features/pos/prisma-repository.ts` (`completePrismaSale`)
- Builds the server policy and asserts **`create_sale`** before persistence.
- Asserts **`apply_discount`** whenever the payload carries a manual (non-promotional) discount; the effective discount percent (`manualDiscountAmount / subtotal`) must be within the user's role limit, else the checkout is rejected.

No changes to the approval engine, purchasing, or inventory workflows.

---

## 3. Owner / Manager / Cashier hierarchy (preserved)

| Role | create_sale | Manual discount limit | Over-limit discount |
| --- | --- | --- | --- |
| Owner | allowed | 100% (unlimited) | allowed |
| Manager | allowed | company threshold (default 10%) | **rejected server-side** |
| Cashier | allowed | 0% (no manual discount) | **rejected server-side** |
| Non-member | **rejected** | — | — |

---

## 4. Files changed / added

| File | Change |
| --- | --- |
| `features/access-control/pos-policy-loader.ts` | actual-role permission keys; role-aware `maxDiscountPercent` |
| `features/pos/pos-permission-guard.ts` | **New** — server policy builder + `assertPosActionAllowed` |
| `features/pos/prisma-repository.ts` | enforce `create_sale` + `apply_discount` at checkout |
| `scripts/phase-b8-3-pos-permission-check.ts` | **New** — B8-3 harness (16 checks) |
| `B8_IMPLEMENTATION_SPEC.md` | G3 status updated |
| `B8_3_COMPLETION_REPORT.md` | **New** — this report |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (60/60 pages) |
| `scripts/phase-b8-3-pos-permission-check.ts` | **16 / 16 PASS** |
| B8-1 checkout regression | 29 / 29 PASS |
| B8-2 approval regression | 29 / 29 PASS |
| B7-1 / B7-2 / B7-3 / B7-4 | 12 / 16 / 22 / 14 — all PASS |

### B8-3 scenarios covered
Actual-role resolution (Owner/Manager/Cashier), role-aware discount caps (100/10/0), `create_sale` allowed for all roles, Owner large discount allowed, Manager within-limit discount allowed, **Manager over-limit discount rejected**, **Cashier any discount rejected** (amount and percent), Cashier non-discounted sale still works, **non-member blocked from checkout**.

---

## 6. Remaining risks / out-of-scope (NOT B8-3)

- `void_bill`, `refund_bill`, `hold/resume`, `delete_item`, `cash_in/out`, `split/multi_currency_payment` have **no server endpoint** today (client cart only). When those flows gain server endpoints, they must call `assertPosActionAllowed` (the guard is ready). This is future-phase work.
- The demo-gated client POS permission panel (`enforcePosAction`) is unchanged — it remains a client preview; the server is now authoritative for the checkout surface.

---

## 7. Result

**B8-3 POS Permission Enforcement: PASS.** The POS checkout surface is now server-enforced using the user's actual role; `apply_discount` can no longer be bypassed via the API; the Owner/Manager/Cashier hierarchy is preserved. Approval, purchasing, and inventory workflows untouched; all regressions green.

**Do not start B8-4.**
