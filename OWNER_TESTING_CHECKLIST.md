# Owner Manual Testing Checklist — GO BOX Single Store

> Use after B8-11 PASS. Environment: `IGO_DEMO_MODE=false`, `IGO_ENABLE_DEMO_FALLBACK` unset or `false`, seeded or production DB.

---

## Pre-flight

- [ ] Confirm `.env` / deploy secrets: `IGO_DEMO_MODE=false`
- [ ] Confirm `IGO_ENABLE_DEMO_FALLBACK` is not `true`
- [ ] Confirm `NEXTAUTH_SECRET` and `DATABASE_URL` are set
- [ ] Run `npm run db:seed:demo` (or verify production data exists)
- [ ] Start app: `npm run dev` or deployed URL

**Test accounts (seed):**
- Owner: `igo-admin` / `AdminChangeMe123!`
- Manager: `manager` / `Manager123!`
- Cashier: `cashier` / `Cashier123!`

---

## 1. Authentication & Roles

- [ ] Owner can log in and reach dashboard
- [ ] Manager can log in and reach dashboard
- [ ] Cashier can log in and reach POS
- [ ] Logged-out user cannot access `/dashboard`, `/pos`, `/settings`
- [ ] Cashier cannot open Settings (blocked or no nav access)

---

## 2. Dashboard

- [ ] Dashboard loads without runtime error
- [ ] Sales/profit/inventory cards show numbers (not blank/error)
- [ ] Shift status shows OPEN / CLOSED / NOT STARTED based on real session
- [ ] Close-day panel loads shift summaries
- [ ] Switch Lao/English — navigation labels still work

---

## 3. Products & Inventory

- [ ] Products list loads from DB
- [ ] Create or edit a product — persists after refresh
- [ ] Inventory page loads stock quantities
- [ ] Stock matches expected after a sale (see POS section)

---

## 4. Purchasing & Suppliers

- [ ] Suppliers list loads
- [ ] Create/send a PO (manager or owner)
- [ ] Receive goods — stock increases
- [ ] Supplier payable balance updates after receive
- [ ] Record supplier payment — payable balance decreases

---

## 5. POS — Cash Session & Sale

- [ ] Open cash session with opening float
- [ ] Add items to cart — prices from DB
- [ ] Complete cash sale — success message + receipt
- [ ] Receipt shows correct totals and sale number
- [ ] Recent sales list shows the new sale (from server, not lost on refresh)
- [ ] Cash session expected cash increases by cash portion

---

## 6. POS — Receipt / Refund / Void

- [ ] View receipt from recent sales
- [ ] Reprint receipt — succeeds
- [ ] Refund a sale (owner/manager) — stock restored, sale status refunded
- [ ] Void a different sale — stock restored, sale status voided
- [ ] Cashier blocked from refund/void if policy requires

---

## 7. Promotions & Loyalty (if enabled)

- [ ] Active promotion applies at checkout (verify receipt total)
- [ ] Member customer gets member pricing/discount
- [ ] Loyalty points earn on completed sale
- [ ] Loyalty redeem reduces total when configured

---

## 8. Reports

- [ ] Reports page loads
- [ ] Change date preset (today / this week / this month) — totals change appropriately
- [ ] Sales total roughly matches dashboard for same period
- [ ] Inventory valuation visible and non-zero (if stock exists)

---

## 9. Settings

- [ ] Settings page loads current company profile
- [ ] Change receipt prefix — save — POS new sale uses new prefix
- [ ] QR bank/account settings save and appear on POS QR payment
- [ ] Receipt print mode (ask/auto/no-auto) works on this device only

---

## 10. Approvals (known partial)

- [ ] Inventory adjustment over threshold creates server approval (back office)
- [ ] POS discount override may show client approval panel — verify whether manager can approve in your workflow
- [ ] Document any approval gaps for pilot follow-up

---

## 11. Known limitations (do not fail UAT for these)

- Hold/resume bill is lost on page refresh
- Company logo is preview-only (not DB-persisted)
- No ESC/POS hardware printer — browser print only
- Cart on-screen promo total may differ slightly from final server total (checkout still blocks underpay)

---

## Sign-off

| Role | Name | Date | Pass / Fail | Notes |
| --- | --- | --- | --- | --- |
| Owner | | | | |
| Manager | | | | |
| Cashier | | | | |
