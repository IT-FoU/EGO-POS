# Membership Levels Update Report

## What Was Fixed

- Constrained the Membership Levels page to `width: 100%`, `max-width: 100vw`, and hidden page-level horizontal overflow.
- Updated the Membership page content containers with `min-width: 0` so cards and grids cannot force the main layout wider than the viewport.
- Changed the Create Level and Levels grid to a responsive two-column laptop layout using `minmax(0, 0.38fr)` and `minmax(0, 0.62fr)`.
- Wrapped the Levels table in an internal `overflow-x-auto` container with `max-width: 100%`.
- Reduced the visible Levels table columns to Name, Min spend, Discount, Customers, Status, and Actions.
- Added truncation and title tooltip support for long level names.
- Added View, Edit, and Delete/Archive action buttons.
- Added Active / Inactive status badges.

## Fields Added To The Create/Edit UI

- Level name
- Minimum spend LAK
- Discount percent
- Active
- Card color
- Benefits description
- Auto upgrade ON/OFF
- Membership duration: Never expire, 1 Year, 2 Years, 3 Years
- Welcome bonus points

Note: the current Prisma model persists only `name`, `minSpendLak`, `discountPercent`, and `isActive`. The additional fields are implemented as future-ready UI and card preview fields to avoid a risky database migration in this layout fix.

## Card Preview

- Added live membership card preview with:
  - Level name
  - Card color
  - Discount percent
  - Benefits description
  - QR placeholder
  - Duration, auto upgrade, and welcome bonus chips

## Existing System Check

- Member QR card: exists in the customer profile UI as a membership QR card.
- Points system: exists through customer point balances and `LoyaltyPointLedger`.
- Birthday coupon: not implemented as a dedicated membership feature yet.

## Remaining TODO

- Persist card color, benefits description, auto upgrade, duration, and welcome bonus points after an approved schema migration.
- Add a real birthday coupon model/flow in the Membership or Promotions module, not inside Customer profile data.
- Connect membership card QR generation to a real encoded membership reference if required for POS scanning.
