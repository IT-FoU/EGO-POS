# Promotions UI and Workflow Contract

Status: specification contract for the next Promotions cleanup task.

Purpose: keep the Promotions page honest. Active UI must not show fake analytics, hardcoded demo data, unsupported workflows, or misleading mutation actions. Promotions affect money, POS checkout, refunds, reports, and permissions, so UI cleanup must stay aligned with the real backend and POS behavior.

## Current System Summary

Current active route:

- `/promotions`

Current active client entry point:

- `app/(dashboard)/promotions/page.tsx`
- `features/promotions/components/promotions-list-client.tsx`

Current server action flow:

- `features/promotions/actions.ts`
- `createPromotionAction`
- `updatePromotionAction`
- `archivePromotionAction`

Current repository and schema flow:

- `features/promotions/promotion-service.ts`
- `features/promotions/prisma-repository.ts`
- `features/promotions/dto.ts`
- `features/promotions/dto-mapper.ts`
- `features/promotions/types.ts`
- Prisma models: `Promotion`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage`, `PromotionRule`, `PromotionAction`

Current POS promotion flow:

- `features/promotions/promotion-checkout.ts`
- POS loads active promotions from the database.
- POS rejects client-supplied promotion discounts and promotion ids.
- POS applies active promotions server-side during checkout.
- POS records `PromotionUsage` rows and increments promotion usage/discount totals.

Current Reports promotion usage:

- Promotion report categories exist in `features/reports/report-catalog.ts`.
- Promotion usage data is available through `PromotionUsage`.
- Dashboard/Reports data-quality rules must not be bypassed by heuristic Promotions UI values.

Current permission usage:

- `WRITE_PERMISSIONS.promotionsCreate`
- `WRITE_PERMISSIONS.promotionsUpdate`
- `WRITE_PERMISSIONS.promotionsDelete`
- Access-control catalog includes promotion-specific permissions such as `promotion.create`, `promotion.edit`, `promotion.delete`, `promotion.analytics.view`, `promotion.coupon.manage`, `promotion.stackRules.manage`, and `promotion.approve`.

Current archive/delete behavior:

- The current backend `archivePrismaPromotion` does not hard delete.
- It updates the promotion to `status: "inactive"` and `isActive: false`.
- UI must call this Archive unless a true hard-delete action is implemented and approved.

## 1. Promotions MVP Data Model

Fields currently persisted or represented by the current promotion backend:

- `promotionName`
- `description`
- `promotionType`
- `promotionCode`
- `startDate`
- `endDate`
- `priority`
- `status`
- `isActive`
- `discountPercent`
- `discountAmountLak`
- `buyQuantity`
- `getQuantity`
- `comboPriceLak`
- product scope through `PromotionProduct`
- category scope through `PromotionCategory`
- membership level scope through `PromotionMembershipLevel`
- usage tracking through `PromotionUsage`
- `usageCount`
- `totalDiscountLak`

### Proposed Field Decisions

| Field / Feature | Current persisted? | Used by POS? | MVP decision | UI behavior now | Future backend required |
|---|---:|---:|---|---|---|
| Promotion name | Yes | Display/context only | MVP_NOW | Editable | None |
| Description | Yes | No | MVP_NOW | Editable | None |
| Promotion type | Yes | Yes | MVP_NOW with supported types | Editable only for supported types | None for existing types |
| Discount percent | Yes | Yes for percentage/member discount | MVP_NOW | Editable when type requires it | None |
| Discount amount LAK | Yes | Yes for fixed amount | MVP_NOW | Editable when type requires it | None |
| Start date | Yes | Yes | MVP_NOW | Editable | None |
| End date | Yes | Yes | MVP_NOW | Editable | None |
| Status | Yes | Yes | MVP_NOW | Editable as active/inactive/scheduled/expired only where safe | Draft/archive status support if expanded |
| Active/inactive | Yes | Yes | MVP_NOW | Use as enabled/disabled state | None |
| Product scope | Yes | Yes | MVP_NOW | Editable with real product selector | None |
| Category scope | Yes | Yes | MVP_NOW | Editable with real category selector | None |
| Membership scope | Yes | Yes | MVP_NOW for member discount targeting | Editable only if clear | None |
| Coupon code | Yes, single optional code | Yes, if POS receives applied code | MVP_NOW as simple manual code only | Editable as one code; no campaign/sample coupon tables | Coupon campaign model for advanced use |
| Usage count | Yes | Read-only | DISPLAY_ONLY | Show as actual value only | None |
| Total discount | Yes | Read-only | DISPLAY_ONLY | Show as actual value only | None |
| Total sales by promotion | Derived from usage sales | Read-only | DISPLAY_ONLY | Show as actual value only | None |
| Priority | Yes | Yes as tie-breaker | MVP_NOW only if explained | Editable only with simple help text | Conflict UI/audit for advanced controls |
| Stacking | Context flag exists in POS function, no UI policy | Partially | FUTURE_PHASE | Hide controls | Store policy, UI, audit, tests |
| Conflict rules | No explicit model exposed to UI | Partially via priority | FUTURE_PHASE | Hide | Conflict group/priority engine |
| Approval requirement | No promotion-specific approval workflow | No | FUTURE_PHASE | Hide | Approval rules, audit, approver metadata |
| Profit protection | POS has below-cost guard option | Yes, not promotion page policy | FUTURE_PHASE | Hide or read-only system note | Config, audit, reports |
| Near-expiry rules | No promotion automation | No | FUTURE_PHASE | Hide | Inventory expiry rule engine |
| Slow-moving stock suggestions | No promotion automation | No | FUTURE_PHASE | Hide | Inventory velocity/report engine |
| Promotion calendar | Uses dates only | Indirect | DISPLAY_ONLY | Show read-only from real promotions if kept | None for read-only |
| Promotion impact forecast | No reliable forecast model | No | FUTURE_PHASE | Hide from real UI | Forecast engine and clear estimate labeling |
| Integration checklist | No persisted state | No | REMOVE_FROM_UI | Remove from active UI | Real integration status model if desired |
| Branch/user/actor display | Not on promotion row | No | REMOVE_FROM_UI until real source exists | Hide | Audit/store activity source |
| Duplicate promotion | Backend action is create with copied input | Indirect | NEEDS_OWNER_DECISION | Hide or keep only after copy rules are defined | Safe copy contract, uniqueness rules |
| Activate/deactivate | Supported through update | Yes | MVP_NOW | Use clear enable/disable action | None |
| Archive/delete | Archive supported, hard delete not exposed | Yes indirectly | MVP_NOW as Archive only | Say Archive, not Delete | Hard delete action if ever needed |
| Estimated revenue/profit/usage analytics | No reliable engine | No | REMOVE_FROM_UI | Remove or mark future | Reports/forecast engine |

## 2. Promotion Type Support

Supported by current backend/POS code:

- `percentage`
- `fixed_amount`
- `buy_x_get_y`
- `combo_set`
- `member_discount`

MVP UI should expose only types that can be described and validated without misleading the owner.

### Type Decisions

| Type | Current persisted fields | POS application behavior | Refund/void behavior | Reports behavior | UI behavior now |
|---|---|---|---|---|---|
| Percentage discount | `discountPercent`, targets, dates, status | Applies percent to eligible line | Reversal must follow sale/refund records | Actual usage/discount only | MVP_NOW |
| Fixed amount discount | `discountAmountLak`, optional spend threshold through `buyQuantity`, targets, dates, status | Applies fixed amount to eligible line or store-wide threshold | Reversal must follow sale/refund records | Actual usage/discount only | MVP_NOW with clear wording |
| Member discount | `discountPercent`, membership targets, dates, status | Applies only when customer has eligible membership | Reversal must follow sale/refund records | Actual usage/discount only | MVP_NOW if membership targeting is clear |
| Buy X Get Y | `buyQuantity`, `getQuantity`, targets, dates, status | POS has calculation support | Reversal must follow sale/refund records | Actual usage/discount only | NEEDS_OWNER_DECISION before broad UI |
| Combo/bundle | `comboPriceLak`, product targets, dates, status | POS has combo calculation support | Reversal must follow sale/refund records | Actual usage/discount only | NEEDS_OWNER_DECISION before broad UI |
| Tiered discount | Not explicit | No dedicated engine | Not defined | Not defined | FUTURE_PHASE |
| Coupon campaign | Single code only, no campaign table | Coupon satisfaction checks one code | Not fully defined | Not defined | FUTURE_PHASE beyond one code |
| Stackable promotion | Context flag exists, no store UI policy | Not a persisted promotion setting | Not defined | Not defined | FUTURE_PHASE |
| Priority/conflict resolver | `priority` exists | Higher priority wins tie when discounts equal | Not separately audited | Not separately reported | MVP_NOW as simple priority only; advanced UI future |
| Profit protection automation | No promotion rule UI | Below-cost guard exists in checkout context | Not promotion-specific | Not defined | FUTURE_PHASE |

## 3. Promotion Status Rules

Current persisted statuses:

- `active`
- `inactive`
- `scheduled`
- `expired`

Conceptual future statuses:

- `draft`
- `archived`

Rules:

- Active means `isActive` is true, `status` is `active`, and current date is within `startDate` and `endDate`.
- Scheduled means start date is in the future or status is explicitly scheduled.
- Expired means end date is in the past or status is explicitly expired.
- Paused/inactive means `isActive` is false or status is `inactive`.
- Archived should be a soft removal state only when schema/action support exists. Until then, archive uses inactive.
- UI must not use fixed hardcoded date anchors such as `2026-06-19`.
- UI should use the current date, server-provided status, or a shared status helper.

## 4. Archive vs Delete Contract

- Archive means soft remove from active working list.
- Current backend archive sets `status: "inactive"` and `isActive: false`.
- Delete means permanent deletion and is not currently exposed by the Promotions server action.
- If the backend action only archives, UI must say Archive, not Delete.
- Destructive actions must require confirmation.
- Owner/manager permissions are required for archive.
- Cashier must not manage promotions.

## 5. Coupon Contract

Current system:

- `promotionCode` is persisted as an optional single code.
- POS checks the promotion code only when `appliedPromotionCodes` are provided.
- There is no current coupon campaign table, QR coupon issuance flow, usage-limit model, member-only coupon model, or generated coupon inventory.

MVP:

- A single manual promotion code can be edited if clearly labeled.
- UI must not show fake coupon rows such as `SAVE10`, `QR-GOLD-0626`, or `AUTO-EXP-15` as real data.
- Coupon campaign, QR coupon, generated coupon, usage-limit, and member-only coupon management are future phase.

## 6. Priority / Stacking / Conflict Contract

Current system:

- `priority` is persisted.
- POS sorts promotions by priority and start date.
- POS chooses the best discount and uses priority as a tie-breaker.
- Stacking can be passed as a checkout context flag, but there is no persisted per-promotion stackable policy in the current UI contract.

MVP:

- No editable stacking controls.
- Priority can remain as a simple number if the UI explains that it is a tie-breaker.
- If multiple promotions match, POS uses existing backend behavior only.
- UI must not promise conflict groups, stack rules, or best-discount simulations beyond actual POS logic.

Future requirements:

- `stackable` flag.
- conflict group.
- priority policy.
- best discount selection explanation.
- audit trace of applied promotion.
- tests for discount priority and stacking.

## 7. Promotion Analytics Contract

Allowed now:

- Actual `usageCount`.
- Actual `totalDiscountLak`.
- Actual promotion sales derived from `PromotionUsage` sale totals.
- Actual Reports metrics when the Reports service provides them with data-quality status.

Not allowed as real values:

- heuristic forecast revenue.
- heuristic forecast profit.
- fake usage counts.
- hardcoded stock impact.
- sample coupon performance.
- hardcoded branch, user, or date rows.

If estimates or forecasts are ever shown:

- They must be clearly labeled as Estimate or Preview.
- They must be visually separate from actual Reports metrics.
- They must not contradict Dashboard/Reports data-quality rules.
- Profit forecasts need reliable cost/COGS inputs or must be unavailable.

## 8. Branch / User / Actor Display Contract

Do not show hardcoded values in active UI:

- `Main Branch`
- `Branch Warehouse`
- `Mini Mart Counter`
- `Owner`
- `Manager`
- `Promotion Admin`
- fixed date strings such as `2026-06-19`

Branch/user/actor data must come from one of:

- current store session.
- promotion audit records.
- store activity logs.
- persisted promotion owner/creator fields, if added later.

If real source data is unavailable:

- hide the field; or
- show a neutral unavailable state.

## 9. Permissions and Approval

Rules:

- Owner can create, edit, activate/deactivate, and archive promotions.
- Manager may create, edit, activate/deactivate, and archive promotions only if permission is granted.
- Cashier must not manage promotions.
- Cashier can apply promotions during sale only through POS checkout behavior.
- Promotion approval is a future phase unless a dedicated approval rule exists.
- POS discount override approval remains separate from Promotions management.

Needed explicit permissions:

- `promotion.view`
- `promotion.create`
- `promotion.edit`
- `promotion.delete` or `promotion.archive`
- `promotion.analytics.view`
- `promotion.coupon.manage`
- `promotion.stackRules.manage`
- `promotion.approve`

Current UI cleanup should:

- keep route visibility guard if safe.
- hide management actions from roles without permission.
- avoid relying only on broad navigation permissions for create/edit/archive buttons.

## 10. POS Integration Contract

POS must:

- load active promotions from the database.
- check `isActive`, `status`, start date, and end date.
- check product, category, customer, and membership eligibility.
- apply discount server-side.
- reject client-supplied promotion discount and promotion id values.
- prevent unsupported stacking.
- record applied promotion usage on sale.
- reverse or account for promotion effects on refund/void through sale/refund records.
- write audit/store activity when promotion reversal behavior is implemented.

MVP UI rule:

- The Promotions page must not promise behavior that POS does not apply.
- POS calculation changes are out of scope for the immediate UI cleanup.

## 11. Reports Integration Contract

Reports must:

- be the source of truth for actual promotion performance metrics.
- use `PromotionUsage`, sale totals, and actual discount totals.
- expose data-quality status when promotion metrics are unavailable or partial.
- avoid fake zero values for unavailable data.

Promotions UI must:

- show actual metrics only when backed by repository/Reports data.
- show empty/unavailable state when data is missing.
- keep estimates separate from actual metrics.
- align with the Reports snapshot data-quality contract.

## 12. UI Contract

Immediate UI cleanup should:

- keep a simple list/table.
- use right drawer/workspace where useful.
- keep create/edit/archive only for fields/actions supported now.
- disable or hide unsupported surfaces.
- remove fake/demo coupon rows.
- remove hardcoded branch/user/date display data.
- avoid fake analytics as real data.
- keep dark premium Tiffany Blue direction.
- support English and Thai only.
- not reintroduce Lao active UI.
- not introduce mojibake.
- avoid modal-heavy flows except confirmation.
- ensure action buttons are wired, disabled with a reason, or removed.

Immediate UI cleanup should not:

- add POS calculation changes.
- add Reports calculation changes.
- add coupon campaign management.
- add stacking/conflict controls.
- add profit forecast.
- add integration checklist claims.
- add approval workflow.

## 13. Implementation Phases

### Phase 1 - Safe Promotions UI Cleanup

- Keep route guard if it stays scoped to Promotions access.
- Keep list and drawer UI if useful.
- Keep create/edit/archive only for current persisted fields/actions.
- Replace Delete wording with Archive unless hard delete exists.
- Remove hardcoded branch/user/date/sample coupon data.
- Remove or clearly disable unsupported advanced surfaces.
- Remove fake analytics.
- No POS calculation change.
- No Reports calculation change.
- No schema change.

### Phase 2 - Promotion Workflow Hardening

- Add explicit promotion action visibility checks.
- Clarify archive/delete wording across UI and server action names.
- Define safe duplicate promotion behavior.
- Centralize status/date behavior.
- Add store activity/audit logging for create, update, activate/deactivate, and archive.
- Add tests for action visibility and route access.

### Phase 3 - Advanced Promotion Engine

- Coupon validation and coupon campaign management.
- QR/generated coupon support.
- Priority/conflict rules.
- Stackable promotions.
- Buy X Get Y and combo/bundle owner-approved UI.
- Member-only advanced promotion rules.
- Profit protection automation.
- Impact forecast engine.
- Reports promotion analytics expansion.

## 14. Decision Table

| Field / Feature | Current persisted? | Used by POS? | MVP decision | UI behavior now | Future backend required |
|---|---:|---:|---|---|---|
| Name | Yes | No | MVP_NOW | Editable | None |
| Description | Yes | No | MVP_NOW | Editable | None |
| Type | Yes | Yes | MVP_NOW with limitations | Editable for supported types only | Type-specific QA |
| Percent discount | Yes | Yes | MVP_NOW | Editable | None |
| Fixed amount discount | Yes | Yes | MVP_NOW | Editable | None |
| Start/end date | Yes | Yes | MVP_NOW | Editable | None |
| Status/isActive | Yes | Yes | MVP_NOW | Editable with clear wording | None |
| Product/category targets | Yes | Yes | MVP_NOW | Editable | None |
| Membership targets | Yes | Yes | MVP_NOW for member discount | Editable when relevant | None |
| Single coupon code | Yes | Yes if POS receives code | MVP_NOW limited | Editable as one code | Coupon UX/tests |
| Coupon campaign table | No | No | FUTURE_PHASE | Hide | Schema, POS, Reports |
| Priority | Yes | Yes as tie-breaker | MVP_NOW limited | Editable with help text | Policy/audit for advanced use |
| Stacking | No persisted policy | Partially context-based | FUTURE_PHASE | Hide | Schema, POS, tests |
| Conflict rules | No | No dedicated UI behavior | FUTURE_PHASE | Hide | Engine and audit |
| Approval requirement | No | No | FUTURE_PHASE | Hide | Approval workflow |
| Profit protection panel | No page-level persisted policy | Checkout guard exists | FUTURE_PHASE | Hide | Config and audit |
| Near-expiry promotion suggestions | No | No | FUTURE_PHASE | Hide | Inventory/reports engine |
| Slow-moving suggestions | No | No | FUTURE_PHASE | Hide | Inventory/reports engine |
| Calendar | Dates exist | Indirect | DISPLAY_ONLY | Read-only from real dates | None |
| Impact forecast | No | No | FUTURE_PHASE | Hide | Forecast engine |
| Integration checklist | No | No | REMOVE_FROM_UI | Remove | Real status source |
| Branch/user/actor display | No | No | REMOVE_FROM_UI | Hide | Audit/store activity source |
| Duplicate promotion | No dedicated action | Indirect through create | NEEDS_OWNER_DECISION | Hide until rules defined | Safe duplicate action |
| Activate/deactivate | Yes through update | Yes | MVP_NOW | Allowed with confirmation if needed | None |
| Archive | Yes through inactive update | Yes | MVP_NOW | Say Archive | None |
| Delete | No hard delete action | No | FUTURE_PHASE | Hide | Hard delete action and policy |
| Actual usage/discount/sales | Yes/derived | Yes | DISPLAY_ONLY | Show as actual metrics | Reports quality status |
| Estimated revenue/profit/stock | No | No | REMOVE_FROM_UI | Hide | Forecast engine |

## Recommended Treatment of Current Dirty Files

### `app/(dashboard)/promotions/page.tsx`

Treatment: rework for Phase 1.

- Keep the route access guard if it remains aligned with Store Back Office role visibility.
- Keep expanded snapshot loading only if the active UI genuinely needs create/edit selectors.
- Do not commit this file together with unsupported dirty UI surfaces.
- Route guard can be included in the Phase 1 cleanup commit if the client is cleaned at the same time.

### `features/promotions/components/promotion-status-badge.tsx`

Treatment: split commit candidate.

- Current dirty change appears style-only.
- It can be committed separately after checks if no other Promotions UI files are staged.
- It does not need the broader Promotions workflow spec to land.

### `features/promotions/components/promotions-list-client.tsx`

Treatment: rework before commit.

- Remove hardcoded branch/user/date display data.
- Remove sample coupon rows.
- Remove mock/demo copy from active UI.
- Remove or disable unsupported integration checklist surfaces.
- Remove heuristic forecast revenue/profit/usage/stock metrics from active real UI.
- Replace Delete wording with Archive unless hard delete exists.
- Keep only supported create/edit/archive/activate/deactivate actions.
- Hide or disable duplicate until safe copy rules are defined.
- Add role/action visibility for management buttons before committing.
- Do not change POS checkout or Reports calculations in the Phase 1 UI cleanup.

