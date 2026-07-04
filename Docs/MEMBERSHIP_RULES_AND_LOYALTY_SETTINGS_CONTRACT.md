# Membership Rules and Loyalty Settings Contract

Status: specification contract for the next Membership cleanup task.

Purpose: keep the Membership Levels page honest. Active UI must not show editable business rules unless those rules are persisted, enforced by POS, and covered by permission/audit behavior.

## Current System Summary

Current route: `/membership-levels`.

Current active server and repository flow:

- `app/(dashboard)/membership-levels/page.tsx` loads membership levels.
- `features/membership-levels/membership-level-service.ts` resolves the current tenant from session.
- `features/membership-levels/prisma-repository.ts` reads and writes `MembershipLevel`.
- `features/membership-levels/actions.ts` wraps create/update/archive/delete with write permission checks.
- API routes under `app/api/membership-levels/**` expose read/write access with `membership.view` and `membership_levels.manage`.

Current persisted `MembershipLevel` fields:

- `id`
- `companyId`
- `name`
- `minSpendLak`
- `discountPercent`
- `isActive`

Current write input fields:

- `name`
- `minSpendLak`
- `discountPercent`
- `isActive`

Current loyalty settings are stored on `CompanySetting`:

- `loyaltyEnabled`
- `loyaltySpendPerPointLak`
- `loyaltyPointValueLak`
- `loyaltyMinRedeemPoints`

Current POS membership usage:

- POS loads active customer membership level.
- POS applies `membershipLevel.discountPercent` when the customer membership benefit is active.
- POS calculates loyalty points from store loyalty settings after payment.
- POS records loyalty point ledger rows on sale completion.
- Refund/void reversal support exists in loyalty service.

## 1. Membership Level Data Model

MVP Membership Level fields are:

- `name`
- `minSpendLak`
- `discountPercent`
- `isActive`

These are the only fields that should be editable in the immediate Membership UI cleanup.

### Proposed Field Decisions

| Field / Feature | Current persisted? | Used by POS? | MVP decision | UI behavior now | Future backend required |
|---|---:|---:|---|---|---|
| `name` | Yes | Display/context only | MVP_NOW | Editable | None |
| `minSpendLak` | Yes | Used by auto tier recompute | MVP_NOW | Editable | None |
| `discountPercent` | Yes | Yes | MVP_NOW | Editable | None |
| `isActive` | Yes | Yes, via active level queries and customer state | MVP_NOW | Editable | None |
| `discountType` | No | No | FUTURE_PHASE | Hide | Schema, POS pricing, audit |
| `discountAmountLak` | No | No | FUTURE_PHASE | Hide | Schema, POS pricing, audit |
| `roundingRule` | No | No for membership discount | FUTURE_PHASE | Hide | Schema and POS calculation contract |
| `duration` | No on level | Indirect via customer subscription only | FUTURE_PHASE | Hide | Customer membership period model |
| `cardColor` | No | No | DISPLAY_ONLY or FUTURE_PHASE | Do not save; hide unless display-only is explicit | Schema or UI-only config decision |
| `welcomeBonusPoints` | No | No | FUTURE_PHASE | Hide | Loyalty ledger rule and audit |
| `autoUpgrade` | Partially implemented by total spent recompute | Yes, service recomputes by `minSpendLak` | NEEDS_OWNER_DECISION | Do not expose editable toggle yet | Explicit policy, audit, disable path |
| `pointExpiryDays` | No | No | FUTURE_PHASE | Hide | Ledger expiry schema and jobs |
| `exclusions` | No | Promotions support targets, not membership exclusions | FUTURE_PHASE | Hide | Product/category exclusion model |
| `benefitsDescription` | No | No | FUTURE_PHASE | Hide | Schema if owner wants it |

## 2. Discount Rules

MVP supports percent discount only.

Supported now:

- Membership level has `discountPercent`.
- Customer must have an active membership level.
- Customer must be active.
- If a customer subscription exists, the latest active subscription must not be expired.
- POS uses database-authoritative product price and applies the membership percent before promotion logic.

Not supported now:

- Fixed amount membership discount.
- Per-product membership exclusions.
- Membership-specific rounding rules.
- Cashier override of membership discount.
- Manager approval for custom membership discount outside the configured rule.

Stacking with promotions:

- POS currently applies membership discount first by reducing the sale item price, then applies active promotions.
- Future changes to stacking need an explicit pricing contract because they affect margin, promotion safety checks, and receipt totals.

## 3. Membership Duration

Membership level duration and customer membership duration are different concepts.

Contract:

- A `MembershipLevel` should not own duration in MVP.
- Customer membership period belongs to customer membership/subscription records.
- If duration is needed, design it as customer-level membership start/end behavior, not as a level-level rule.
- The Membership Levels UI must not show duration as an editable saved rule in MVP.

## 4. Loyalty Points Rules

MVP ownership:

- Store Settings owns base loyalty point rules.
- Membership Levels own only tier threshold and discount percent.
- Membership page may show a read-only summary of loyalty settings or link to Settings.
- Membership page must not write Settings inline until a dedicated UX and permission contract is approved.

Current settings:

- `loyaltyEnabled`
- `loyaltySpendPerPointLak`
- `loyaltyPointValueLak`
- `loyaltyMinRedeemPoints`

MVP earning rule:

- If loyalty is enabled and a customer is attached, POS earns points after completed payment.
- Earned points are based on completed sale amount and `loyaltySpendPerPointLak`.
- POS records a loyalty ledger row.

MVP redeem rule:

- Redemption uses current point balance, configured point value, and minimum redeem points.
- Redemption must not make point balance negative.

Future phase:

- Point expiry.
- Bonus points.
- Membership multipliers.
- Product/category exclusions.
- Manual expiry jobs.
- Advanced refund/void policies beyond current ledger reversal.

Audit requirement:

- Any manual point adjustment must write auditable store activity.
- Refund/void loyalty reversal must remain auditable and non-silent.

## 5. Auto Upgrade

Current behavior:

- `recomputeMembershipTier` can update a customer's membership level based on `totalSpent` and active levels ordered by `minSpendLak`.

Decision:

- Auto upgrade is NEEDS_OWNER_DECISION before visible UI.
- Do not show an editable auto-upgrade toggle in MVP.
- If kept, it needs a policy for manual override, downgrade behavior, refund/void reversal, audit logs, and owner visibility.

## 6. Permissions and Approval

Long-term permissions should be explicit.

Recommended permission model:

- Owner can create, edit, archive, and delete membership levels.
- Manager may view and may edit only if granted `membership_levels.manage`.
- Cashier should not manage membership levels.
- Cashier may view customer membership status where needed for POS/customer lookup.
- Manual point adjustments require owner/manager approval.
- Discount override outside configured rules requires manager/owner approval.

Do not map Membership management through inventory permissions long-term.

Needed explicit permissions:

- `membership.view`
- `membership_levels.manage`
- `loyalty_settings.manage`
- `loyalty_points.adjust`
- `membership_discount.override`

## 7. POS Integration Contract

MVP POS behavior:

- Load active customer membership.
- Check active/expired customer membership state.
- Apply `discountPercent` only.
- Use database-authoritative price and customer membership data.
- Calculate loyalty points after payment.
- Record earn/redeem ledger entries.
- Reverse loyalty impact on refund/void where supported.
- Log/audit high-risk changes.

Not MVP:

- Fixed amount membership discounts.
- Membership discount rounding.
- Membership-specific product/category exclusions.
- Welcome bonus points at checkout.
- Cashier override of membership discount.

## 8. Customer Integration Contract

MVP customer behavior:

- Show membership badge.
- Show current membership level name.
- Show points balance.
- Allow customer create/update to assign membership level if current customer permissions allow it.

Future customer behavior:

- Customer membership active/expired status.
- Membership start/end date display.
- Customer membership history.
- Manual point adjustment approval flow.
- Customer-facing membership card color or benefits.

## 9. Settings Integration Contract

Store Settings owns loyalty point settings in MVP.

Membership page may:

- Display a read-only loyalty summary.
- Link to Store Settings.
- Explain that point rules are managed in Settings.

Membership page must not:

- Save loyalty settings inline in MVP.
- Show point expiry/exclusion controls as active saved settings.
- Mix store-wide tax/receipt/company settings into Membership form payload.

## 10. UI Contract

Current UI cleanup must:

- Show only persisted editable fields: `name`, `minSpendLak`, `discountPercent`, `isActive`.
- Use list plus right drawer/workspace.
- Avoid centered popups for main workflows.
- Avoid fake buttons.
- Avoid fake/demo membership metrics unless clearly guarded by demo mode.
- Use English and Thai only.
- Do not reintroduce Lao active UI.
- Do not introduce mojibake or question-mark placeholder text.

Unsupported future fields should be hidden. If owner wants them visible, they must be disabled and clearly marked as coming soon, not saved.

## 11. Implementation Phases

### Phase 1 - Safe Membership UI Cleanup

- Keep only supported fields:
  - `name`
  - `minSpendLak`
  - `discountPercent`
  - `isActive`
- Drawer UI is allowed.
- No unsupported fields.
- No inline loyalty settings writes.
- No POS pricing changes.
- Customer membership badge style can be committed separately or with this phase if scoped.

### Phase 2 - Loyalty Settings

- Keep ownership in Store Settings unless owner chooses otherwise.
- Define point earn/redeem/expiry/exclusion settings.
- Define refund/void reversal behavior.
- Add audit/store activity requirements.
- Add permissions for loyalty settings and manual points adjustment.

### Phase 3 - Advanced Membership

- Fixed discount.
- Discount type.
- Rounding rule.
- Card color.
- Welcome bonus points.
- Auto upgrade policy controls.
- Level benefits.
- Advanced exclusions.
- Customer membership duration/history.

## 12. Recommended Treatment of Current Dirty Files

### `app/(dashboard)/membership-levels/page.tsx`

Recommendation: keep/rework.

- Keep the idea of role-aware access.
- Do not load Settings for inline editing in Phase 1.
- Use explicit membership permission mapping when available.
- Avoid coupling Membership page access to inventory permissions long-term.

### `features/membership-levels/components/membership-levels-client.tsx`

Recommendation: rework before commit.

- Keep the drawer/list direction.
- Remove editable unsupported fields for Phase 1.
- Remove inline `updateSettingsAction` usage from Membership page.
- Remove or disable point/loyalty rules drawers until Phase 2.
- Persist only `name`, `minSpendLak`, `discountPercent`, and `isActive`.
- Do not show duration, fixed amount discount, rounding, welcome bonus, card color, point expiry, exclusions, or auto-upgrade toggle as saved settings in Phase 1.

### `features/customers/components/membership-badge.tsx`

Recommendation: split commit or include with safe UI cleanup.

- The current dirty change appears style-only.
- It can be committed separately as customer badge visual polish if desired.
- It should not be mixed with loyalty/settings behavior.

## 13. Acceptance Criteria for Next Membership UI Commit

- No Membership UI field appears editable unless it is persisted or explicitly disabled.
- Save payload matches the visible editable fields.
- POS behavior remains unchanged.
- Store Settings behavior remains unchanged.
- Cashier cannot manage membership levels.
- Owner/manager behavior follows existing permissions.
- No Lao active UI.
- No mojibake.
- No unrelated dirty files staged.
