# B8-2 — Approval Workflow Hardening — Completion Report

**Phase:** B8-2 (approval workflow hardening, gap G2)
**Scope:** B8-2 only. No B8-3/B8-4, no UI redesign. Git `main` baseline. Tenant/company/branch/warehouse scoping preserved. B7 + B8-1 behavior preserved.
**Result:** **PASS**

---

## 1. Audit findings (before B8-2)

| Area | Before B8-2 | Risk |
| --- | --- | --- |
| Approval request creation | **No production path** — `approval.create` had zero call sites | Approvals could never be raised server-side |
| Approval status | `Approval` model DB-backed, settings UI lists pending | OK |
| Decision flow | `decideApproval` flipped status only | No real control |
| Approve/reject actions | `decideApprovalAction` gated by `approvals.approve` only | No approver-role rule, no self-approval block |
| Execute approved action | **Never executed** anything | Approvals were cosmetic |
| Audit trail | `withTenantTransaction` writes an `AuditLog` per write ✅ | OK (kept) |
| localStorage usage | POS panel uses `demoPendingApprovalRepository` / `demoAuditLogRepository` | **demo + devDebug gated only** (not production runtime) |
| Permission checks | `approvals.approve` for decide; no requester/role checks | Cashier could be wired to approve |

Root cause (G2): the data model existed but there was **no engine** to create requests, enforce who may approve, or execute the approved effect.

---

## 2. Changes implemented

### New module `features/approvals/`
- **`approval-engine.ts`**
  - `createApprovalRequest(input, tenant)` — persists a pending `Approval` scoped to company/branch, captures the requester's resolved role, validates the branch is in scope, stores the execution payload in `newValue`, and writes an audit row.
  - `decideApprovalRequest(input, tenant)` — loads the pending approval **scoped by company** (cross-company → "not found"), blocks **self-approval** (`requestBy === userId`), resolves the approver's live role and enforces the rule's **`approverRole`** (owner-only, or owner+manager when the rule is `manager`; cashier/custom blocked), then on `approved` runs the executor and stamps `approvedBy`/`decidedAt`/`status`.
  - `evaluateApprovalRequirement(rule, ctx)` — threshold logic (disabled → not required; percent rules vs `discountPercent`; amount rules vs `amountLak`).
  - **Executor registry** — `stock_adjustment` fully wired: atomic balance delta via `applyAtomicStockDelta`, a `StockMovement` (`movementType: "adjustment"`, `referenceType: "approval"`), and a `StockAdjustment` row (`approvedBy` = approver, `createdBy` = original requester), all scope-guarded. Request types without an executor approve as authorization-only (their originating module performs the effect).
- **`approval-config.ts`** — `APPROVAL_REQUESTER_PERMISSION` maps each rule key → the base write permission the requester must hold.
- **`actions.ts`** — `createApprovalRequestAction` (requester base permission) and `decideApprovalRequestAction` (`approvals.approve`).
- **`types.ts`** — engine input/record types.

### API routes
- `POST /api/approvals` — create request (asserts the rule-specific requester permission).
- `POST /api/approvals/decision` — decide (asserts `approvals.approve`).

### Wiring (no UI redesign)
- `features/access-control/prisma-repository.ts` `decideApproval` now **delegates to the engine**, so the existing settings "Pending Approval Center" Approve/Reject buttons gain role enforcement, self-approval blocking, cross-company isolation, and execution — with no UI change.

---

## 3. Server-side permission & control model

| Control | Enforcement |
| --- | --- |
| Requester permission | `createApprovalRequestAction` / `POST /api/approvals` assert the rule's base permission (e.g. `inventory.adjust` for stock adjustment) |
| Approver permission | `approvals.approve` required at the action/route layer |
| Owner/Manager rule | Engine resolves the approver's live role and checks `ApprovalRule.approverRole` (owner-only or owner+manager) |
| Cashier blocked | Cashier/custom roles fail the role check (and lack `approvals.approve`) |
| Self-approval | Engine rejects `requestBy === approver` |
| Cross-company | Approval lookup scoped by `companyId` → foreign tenant sees "not found" |
| Tenant/branch scope | Branch validated on create; product/warehouse validated in the executor |

---

## 4. Files changed / added

| File | Change |
| --- | --- |
| `features/approvals/approval-engine.ts` | **New** — create/decide/execute + threshold + role resolution |
| `features/approvals/approval-config.ts` | **New** — requester permission map |
| `features/approvals/actions.ts` | **New** — server actions |
| `features/approvals/types.ts` | **New** — engine types |
| `app/api/approvals/route.ts` | **New** — create request route |
| `app/api/approvals/decision/route.ts` | **New** — decide route |
| `features/access-control/prisma-repository.ts` | `decideApproval` delegates to the engine |
| `scripts/phase-b8-2-approval-check.ts` | **New** — B8-2 harness (29 checks) |
| `B8_IMPLEMENTATION_SPEC.md` | G2 status updated (server engine DONE) |
| `B8_2_COMPLETION_REPORT.md` | **New** — this report |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (60/60 pages; `/api/approvals` + `/api/approvals/decision` registered) |
| `scripts/phase-b8-2-approval-check.ts` | **29 / 29 PASS** |
| B8-1 checkout regression | 29 / 29 PASS |
| B7-1 lifecycle | 12 / 12 PASS |
| B7-2 receiving | 16 / 16 PASS |
| B7-3 payable | 22 / 22 PASS |
| B7-4 demo-fallback | 14 / 14 PASS |

### B8-2 scenarios covered
Create request (cashier, pending, stock unchanged, audit written), reject (no execution, stock unchanged), approve + **execute** (+50 stock, `StockMovement` + `StockAdjustment` rows, audit written), owner-only rule blocks manager / owner approves, threshold evaluation (amount/percent/disabled), requester-permission gate, approver-permission gate, cashier blocked by role, self-approval blocked, cross-company blocked, re-decide of a decided approval rejected.

---

## 6. Remaining risks / out-of-scope (NOT B8-2)

- **Originating flows do not yet *raise* requests through the engine.** POS over-limit discount/refund and purchasing-over-threshold still need to call `createApprovalRequestAction`, and their executors (refund/discount/purchasing) need registering. Today only `stock_adjustment` auto-executes; the engine + registry are ready for the rest.
- **POS localStorage approval panel** (`demoPendingApprovalRepository` / `demoAuditLogRepository`) remains, but it is **demo + devDebug gated** dev tooling — not the production runtime path. Replacing it with the server actions is UI work (G2/G3), deliberately excluded here ("do not redesign UI").
- POS granular permissions are still client-enforced for non-`pos.sell` actions (G3) — unchanged by B8-2.

---

## 7. Result

**B8-2 Approval Workflow Hardening: PASS.** Approvals are DB-backed, tenant/company scoped, permission- and role-controlled, auditable, and an approved request now executes a real, verifiable DB effect (stock adjustment). B7 and B8-1 behavior preserved; all checks green.

**Do not start B8-3 until confirmed.**
