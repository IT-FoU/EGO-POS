# IGO POS Membership, Customer, Promotion, POS, and Sales Integration Audit

Date: 19 Jun 2026

## Recommendation

NO-GO for real store membership use.

The foundation is present, but the flow is not fully connected end to end. Customers, membership levels, loyalty points, promotions, and POS sales exist in the schema and several write paths are real, but POS still uses mock customer/member data in real database mode and membership-level discount rules are not fully persisted or applied consistently in server-side checkout.

## 1. Customer Membership Flow

### What Exists

- Customer records are stored in `customers`.
- Customers can reference a membership level through `customers.membership_level_id`.
- Customers can store `qr_member_code`, `points_balance`, and `total_spent`.
- Loyalty point history is stored in `loyalty_point_ledger`.
- Customer detail UI shows a membership QR/card-style section.
- Customer creation UI can choose a membership level.

Key files:

- `prisma/schema.prisma`
- `features/customers/prisma-repository.ts`
- `features/customers/dto.ts`
- `features/customers/dto-mapper.ts`
- `features/customers/components/customer-form.tsx`
- `features/customers/components/customer-detail-client.tsx`

### Missing / Not Connected

- `qrMemberCode` exists in Prisma but is not included in customer DTO create/update payloads.
- Customer types do not expose `qrMemberCode`.
- Membership start date and expiry date are not on `Customer` or `MembershipLevel`.
- `CustomerSubscription` exists, but it is a separate subscription concept and is not connected to the Membership Levels page or POS membership validation.
- Customer membership level type is hard-limited in TypeScript to `Standard | Silver | Gold | Platinum`, which conflicts with dynamic Membership Levels CRUD.
- Membership duration, card color, benefits, auto upgrade, welcome bonus, discount type, fixed discount, and rounding rule are UI-only/future-ready, not persisted in the current membership level model.

## 2. POS Sales Flow

### What Exists

- Cashier can search customers in the POS UI by phone, name, or membership number.
- POS UI has customer/member card behavior.
- POS checkout writes real `sales`, `sale_items`, `sale_payments`, stock movements, promotion usage, loyalty ledgers, and customer point/total-spend updates through `completePrismaSale`.
- POS checkout supports loyalty point redemption with validation.
- POS earns points after checkout using company loyalty settings.
- POS updates `customers.points_balance` and `customers.total_spent`.

Key files:

- `features/pos/pos-service.ts`
- `features/pos/components/pos-page-client.tsx`
- `features/pos/prisma-repository.ts`
- `features/pos/actions.ts`
- `app/api/pos/sales/route.ts`

### Critical Gaps

- In real database mode, `getPosSnapshot()` loads products from Prisma but still returns `mockPosCustomers`.
- POS customer search/member lookup is therefore not using real Supabase customers.
- POS scan barcode searches product barcode/SKU/unit barcode/internal code, not member QR code.
- Membership-level discount is applied in the POS UI through `PosCustomer.discountPercent`, but real POS customers are mock-backed, so real membership levels are not used.
- Server-side `completePrismaSale()` does not load the customer's membership level discount or apply membership-level fixed LAK discount or rounding rule.
- POS does not auto-upgrade membership level after checkout.
- POS receipt/display membership savings are derived client-side and do not represent a persisted server-side membership discount breakdown.

## 3. Promotion Flow

### What Exists

- Promotion schema supports percentage, fixed amount, buy X get Y, combo set, and member discount concepts.
- Promotions can target products, categories, and membership levels.
- POS server checkout applies active promotions before manual discount and loyalty redemption.
- POS writes `promotion_usage` and increments promotion usage/count totals.
- Buy X Get Y exists in `calculatePromotionDiscount()`.

Key files:

- `prisma/schema.prisma`
- `features/promotions/prisma-repository.ts`
- `features/promotions/dto.ts`
- `features/promotions/dto-mapper.ts`
- `features/promotions/components/promotion-form.tsx`
- `features/pos/prisma-repository.ts`

### Gaps / Risks

- Promotion stacking policy is implicit, not configurable or documented in data.
- Current server order is:
  1. Product/category/membership promotion per line
  2. Manual discount amount/percent
  3. Loyalty redemption
  4. Tax/total
  5. Earn points
- Membership-level discount is not a first-class server-side step in the stack.
- New membership fixed LAK discount and rounding rule are not part of checkout.
- Promotion eligibility membership logic appears permissive: if a promotion has membership targets but customer has no membership level, current logic can still pass membership match because `!membershipLevelId` returns true.
- Buy X Get Y calculation works for same-line quantity, but needs E2E verification with unit conversion and mixed unit carts.

## 4. Duplicate Concept Check

### Properly Shared

- `MembershipLevel` is referenced by `Customer` and `PromotionMembershipLevel`.
- `LoyaltyPointLedger` is tied to `Customer` and `Sale`.
- `PromotionUsage` is tied to `Promotion` and `Sale`.

### Duplicated / Conflicting

- `features/customers/types.ts` defines membership levels as fixed names: `Standard`, `Silver`, `Gold`, `Platinum`.
- `features/pos/types.ts` defines `membershipType` as `Monthly | Yearly | Student`, which is a different membership concept from Membership Levels.
- `CustomerSubscription` / `SubscriptionPlan` exist separately from Membership Levels and may be confused with customer memberships.
- `features/pos/mock-data.ts` contains separate mock member/customer data with expiry, points, membership number, and discount percent.
- Membership Levels page has UI-only fields for duration, start/expiry, card color, benefits, auto upgrade, fixed discount, and rounding. These are not shared with Customers/POS because they are not persisted.
- Promotions include `member_discount`, while Membership Levels also define discounts. These need a clear rule so "member discount promotion" and "membership level default discount" do not double-count unintentionally.

## 5. Connected vs Not Connected

### Connected

- Customer -> MembershipLevel relation exists.
- Customer -> LoyaltyPointLedger exists.
- Sale -> Customer exists.
- Sale -> SaleItem -> Promotion exists.
- Promotion -> PromotionUsage exists.
- Promotion -> MembershipLevel targeting exists.
- POS real sale writes stock movement/payment/sale/loyalty/promotion records.

### Not Connected Yet

- Real customers are not loaded into POS in real database mode.
- Customer QR member code is not generated/stored through customer create/edit.
- POS member QR scan is not implemented.
- Membership start/expiry date is not persisted or enforced.
- Membership-level discount is not applied server-side from `MembershipLevel`.
- Fixed LAK membership discount is not persisted.
- Membership rounding rule is not persisted.
- Automatic membership upgrade by total spend is not implemented.
- Membership discount and promotion stacking rules are not explicitly modeled.
- Reports do not yet have complete membership discount / promotion / loyalty reconciliation outputs.

## 6. Exact Files / APIs Needing Fixes

### Schema / Migration

- `prisma/schema.prisma`
  - Add persisted membership discount fields:
    - `discountType`
    - `discountAmountLak`
    - `roundingRule`
  - Add membership display/settings fields if required:
    - card color
    - benefits description
    - duration
    - auto upgrade
    - welcome bonus points
  - Decide whether membership start/expiry belongs on `Customer`, a `CustomerMembership` model, or `CustomerSubscription`.

### Customers

- `features/customers/dto.ts`
  - Add `qrMemberCode` and membership lifecycle fields if approved.
- `features/customers/prisma-repository.ts`
  - Generate/store QR member code.
  - Validate membership level belongs to current company.
- `features/customers/dto-mapper.ts`
  - Stop mapping dynamic membership names into fixed `Standard | Silver | Gold | Platinum`.
- `features/customers/types.ts`
  - Replace fixed membership names with dynamic membership level DTO.

### POS

- `features/pos/pos-service.ts`
  - Replace `mockPosCustomers` with real Prisma customers in real database mode.
- `features/pos/dto-mapper.ts`
  - Add `mapPrismaPosCustomer`.
- `features/pos/types.ts`
  - Replace `membershipType: Monthly | Yearly | Student` with real membership level fields.
- `features/pos/components/pos-page-client.tsx`
  - Add member QR search/scan path.
  - Remove mock-only membership assumptions.
- `features/pos/prisma-repository.ts`
  - Apply membership-level discount server-side after promotion and before loyalty redemption.
  - Apply fixed amount discount and rounding rules.
  - Auto-upgrade membership level after `totalSpent` update.
  - Correct membership-targeted promotion eligibility so guest customers do not match targeted member promotions.

### Promotions

- `features/promotions/prisma-repository.ts`
  - Validate membership targets exist and belong to tenant.
- `features/promotions/dto.ts`
  - Add stacking policy fields if promotion stacking becomes configurable.
- `features/promotions/components/promotion-form.tsx`
  - Clarify whether `member_discount` is a promotion or membership default discount.

### Reports

- `features/reports/prisma-repository.ts`
  - Add report aggregation for:
    - membership discount total
    - fixed membership discount total
    - promotion discount total
    - loyalty redeemed value
    - points earned/redeemed
    - customer upgrades

## 7. Recommended Final Structure

- Customers:
  - Member list and customer profile
  - QR/member code
  - points balance
  - total spend
  - assigned membership level
  - membership lifecycle if not separated into a membership assignment model

- Membership Levels:
  - level rules
  - minimum spend
  - default discount type
  - percent/fixed/rounding rules
  - auto upgrade rules
  - card display settings

- Points Settings:
  - earn rate
  - redemption value
  - minimum redeem
  - enabled/disabled

- Promotions:
  - campaign rules
  - product/category/customer/membership targeting
  - stacking policy

- POS Checkout:
  - select/scan real customer
  - apply promotion first
  - apply membership discount second
  - apply rounding rule
  - apply loyalty redemption
  - calculate tax/total
  - earn points
  - update customer total spend
  - auto-upgrade membership

- Reports:
  - sales, promotion, membership, and loyalty result reporting

## 8. Proposed Discount Stack

Recommended checkout order:

1. Calculate cart subtotal from selected unit prices.
2. Apply eligible promotions.
3. Apply membership-level discount:
   - percent discount, or
   - fixed LAK discount, or
   - percent discount then rounding rule.
4. Cap total discount at remaining bill total.
5. Apply loyalty point redemption.
6. Calculate VAT/tax.
7. Calculate final payable.
8. Earn points based on final paid amount.
9. Update customer `totalSpent`.
10. Evaluate auto-upgrade membership.

## 9. GO / NO-GO

NO-GO for real store membership use.

Reason:

- POS does not load real customers in real DB mode.
- POS does not scan real member QR codes.
- Membership level discounts are not fully persisted.
- Fixed LAK discount and rounding rule are not applied server-side.
- Membership expiry and auto-upgrade are not implemented.
- Promotion/membership stacking policy is implicit and incomplete.

GO only after the POS customer lookup, membership discount engine, member QR, persisted discount fields, and auto-upgrade flow are implemented and verified with Supabase E2E tests.
