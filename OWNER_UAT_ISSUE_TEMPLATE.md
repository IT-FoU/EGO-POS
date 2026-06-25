# Owner UAT Issue Template

Copy this template for each bug found during manual testing.

---

## Issue ID

`UAT-YYYY-MM-DD-###` (e.g. `UAT-2026-06-25-001`)

## Page

URL or screen name (e.g. `/pos`, Dashboard, Settings → Receipt)

## Role used

- [ ] Owner (`igo-admin`)
- [ ] Manager (`manager`)
- [ ] Cashier (`cashier`)
- [ ] Logged out

## Steps to reproduce

1.
2.
3.

## Expected result

What should happen according to business rules or checklist.

## Actual result

What happened instead (include error messages if any).

## Screenshot

Attach file path or paste image:

`screenshots/UAT-YYYY-MM-DD-###.png`

## Severity

- [ ] **P0** — Money, stock, or security integrity wrong; blocks owner testing
- [ ] **P1** — Major workflow broken or unreliable; workaround may exist
- [ ] **P2** — Secondary feature, polish, or non-critical mismatch
- [ ] **Cosmetic** — Visual, label, or translation only

## Notes

- Browser:
- OS:
- Commit tested: `6efd2af` (or current `main`)
- Known P1 match? (see `PILOT_BLOCKER_REPORT.md`): Yes / No
- Workaround if any:

---

## Reviewer (optional)

| Field | Value |
| --- | --- |
| Reviewed by | |
| Date | |
| Action | Fix now / Defer / Expected behavior |
