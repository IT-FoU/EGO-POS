# Membership Levels Actions Update Report

## Layout Fixes

- Kept the Membership Levels page constrained with page-level width and overflow guards.
- Kept the Create Level and Levels table sections inside the existing 38% / 62% responsive layout.
- Kept the table inside its card with internal horizontal scrolling only.
- Kept table columns limited to Name, Min Spend, Discount, Customers, Status, and Actions.
- Long level names truncate with a tooltip and can be clicked to open the Level Detail modal.

## Duration And Date Fields Added

- Added duration options:
  - Never expire
  - 1 month through 12 months
  - 1 year
  - 2 years
  - 3 years
- Added Start date with default value set to today.
- Added Expiry date.
- Expiry date is disabled and empty when duration is Never expire.
- Expiry date auto-calculates from Start date and selected duration.
- Expiry date can be manually overridden after a duration is selected.

## Action Modals Added

- Total levels card opens a modal list of all levels.
- Active levels card opens a modal list of active levels.
- Referenced levels card opens a modal list of levels currently used by customers.
- Each list modal includes:
  - Level name
  - Min spend
  - Discount
  - Customers count
  - Status
  - View/Edit actions
- Clicking a level name in the table opens the Level Detail modal.
- Level Detail modal shows:
  - Level name
  - Card color
  - Min spend
  - Discount percent
  - Membership duration
  - Start date
  - Expiry date
  - Welcome bonus points
  - Benefits description
  - Auto upgrade status
  - Active status
  - Customers in this level
  - Created / updated date availability
  - Edit button

## Number Input Behavior Fixed

- Minimum spend LAK, Discount percent, and Welcome bonus points now clear a visible `0` on focus.
- Empty numeric fields restore to `0` on blur.
- Typing a new number replaces `0` instead of appending after it.

## Existing QR / Points / Birthday / Coupon Status

- Member QR card: already exists in the Customer Profile membership card UI.
- Points system: already exists via customer points and `LoyaltyPointLedger`.
- Birthday data: customer birthday exists and customer birthday panels exist.
- Birthday coupon: not implemented as a dedicated Membership feature yet.
- Coupon/promotion logic: promotion module exists, but birthday coupon membership automation is not implemented.

## Remaining TODO

- Persist membership card color, benefits description, auto upgrade, duration, start date, expiry date, and welcome bonus points after an approved Prisma schema migration.
- Add dedicated birthday coupon automation in the Membership or Promotions module.
- Add real QR/barcode generation for membership levels if required beyond customer membership cards.
- Add created/updated timestamps to membership level detail if the schema is extended.
