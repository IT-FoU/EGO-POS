# Membership Discount Amount + Rounding Update Report

## Summary

Updated the Membership Levels UI to support the new discount design:

- Percent discount
- Fixed amount discount LAK
- Percent discount with rounding rule

The current persisted membership level schema still stores `discountPercent` only. The new discount type, fixed amount, rounding rule, and bill-total preview are implemented as UI/workflow fields so the page is ready for the next schema migration without breaking existing Supabase data.

## Fields Added To UI

- Discount type
- Discount percent
- Discount amount LAK
- Rounding rule
- Example bill total LAK

## Rounding Rules Added

- No rounding
- Round down to nearest 500 LAK
- Round up to nearest 500 LAK
- Round nearest 500 LAK
- Round down to nearest 1,000 LAK
- Round up to nearest 1,000 LAK
- Round nearest 1,000 LAK

## Behavior Added

- Percent discount uses `discountPercent`.
- Fixed amount discount uses `discountAmountLak`.
- Percent + rounding calculates the percent discount first, then applies the selected rounding rule.
- Final discount is capped at the bill total.
- Final payable amount is clamped so it can never be negative.

Example:

- Bill total: 25,000 LAK
- Discount: 3%
- Raw discount: 750 LAK
- Rounding: nearest 1,000 LAK
- Final discount: 1,000 LAK
- Payable: 24,000 LAK

## Table Strategy

To avoid reintroducing the Membership Levels overflow issue, the main table remains compact with summary columns only. Full discount details are shown in the View/Edit workflow and card preview.

## Persistence Status

Saved to database now:

- Level name
- Minimum spend LAK
- Discount percent
- Active status

Future migration recommended:

- `discountType`
- `discountAmountLak`
- `roundingRule`

## Validation

- Discount percent must be 0-100.
- Discount amount LAK cannot be negative.
- Example bill total cannot be negative.
- Runtime calculation prevents discount exceeding bill total.
- Runtime calculation prevents negative payable amount.
