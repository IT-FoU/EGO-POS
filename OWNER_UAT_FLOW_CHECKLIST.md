# Owner UAT Flow Checklist — By Flow

> Use with `OWNER_UAT_RUNBOOK.md`. Mark each item **Pass / Fail / N/A** and log failures via `OWNER_UAT_ISSUE_TEMPLATE.md`.

**Environment:** `IGO_DEMO_MODE=false`, seeded GO BOX data  
**Roles:** Owner `igo-admin`, Manager `manager`, Cashier `cashier`

---

## Login

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| L1 | Open `/login` — page loads | Any | ☐ |
| L2 | Owner login succeeds → dashboard | Owner | ☐ |
| L3 | Logout; manager login succeeds | Manager | ☐ |
| L4 | Logout; cashier login succeeds → POS or dashboard | Cashier | ☐ |
| L5 | Logged-out user cannot open `/dashboard` | None | ☐ |
| L6 | Wrong password shows error (no crash) | Any | ☐ |
| L7 | Super Admin login at `/super-admin/login` succeeds (MVP) | Super Admin | ☐ |
| L8 | Super Admin can open `/super-admin/stores/new` (MVP store creation) | Super Admin | ☐ |

---

## Dashboard

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| D1 | `/dashboard` loads without error | Owner | ☐ |
| D2 | Sales / profit / inventory cards show numbers | Owner | ☐ |
| D3 | Shift status shows OPEN, CLOSED, or NOT STARTED | Owner | ☐ |
| D4 | Close-day panel shows shift summaries | Owner | ☐ |
| D5 | Switch Lao ↔ English — nav still works | Owner | ☐ |
| D6 | Cashier can view dashboard if permitted | Cashier | ☐ |

---

## Products

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| P1 | `/products` list loads | Manager | ☐ |
| P2 | Open product detail / edit | Manager | ☐ |
| P3 | Save a small change (e.g. note or price) — persists after refresh | Manager | ☐ |
| P4 | Create new product (if UI available) | Owner | ☐ |
| P5 | Cashier blocked from product create (if attempted) | Cashier | ☐ |

---

## Inventory

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| I1 | `/inventory` loads stock list | Manager | ☐ |
| I2 | Quantities match expectation before sale | Manager | ☐ |
| I3 | Stock-in or adjustment path accessible | Manager | ☐ |
| I4 | After POS sale, stock decreases correctly | Manager | ☐ |

---

## Suppliers

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| S1 | `/suppliers` or purchasing suppliers list loads | Manager | ☐ |
| S2 | Supplier detail opens | Manager | ☐ |
| S3 | Supplier outstanding / payable visible (if applicable) | Manager | ☐ |

---

## Purchase Order

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| PO1 | Open purchasing — create new PO | Manager | ☐ |
| PO2 | Add line items, save as draft | Manager | ☐ |
| PO3 | Send PO → status becomes ordered | Manager | ☐ |
| PO4 | PO number visible and unique | Manager | ☐ |

---

## Receiving

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| R1 | Open receiving against ordered PO | Manager | ☐ |
| R2 | Receive partial quantity — status partial | Manager | ☐ |
| R3 | Inventory stock increases by received qty | Manager | ☐ |
| R4 | Receive remainder — status received | Manager | ☐ |
| R5 | Supplier payable balance updates | Manager | ☐ |

---

## POS — Open Shift

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| OS1 | Open `/pos` as cashier | Cashier | ☐ |
| OS2 | Open cash session with opening float | Cashier | ☐ |
| OS3 | Session shows open / expected cash baseline | Cashier | ☐ |

---

## POS — Sale

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| SA1 | Add products to cart — prices from DB | Cashier | ☐ |
| SA2 | Select customer (optional) | Cashier | ☐ |
| SA3 | Complete cash sale — success message | Cashier | ☐ |
| SA4 | Sale number follows receipt prefix from settings | Cashier | ☐ |
| SA5 | Cash session expected cash increases (cash payment) | Cashier | ☐ |

---

## Receipt

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| RC1 | Receipt modal opens after sale | Cashier | ☐ |
| RC2 | Totals on receipt match completed sale | Cashier | ☐ |
| RC3 | Browser print dialog works (no hardware printer required) | Cashier | ☐ |

---

## Recent Sales

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| RS1 | Open Recent Sales on POS | Cashier | ☐ |
| RS2 | New sale appears in list | Cashier | ☐ |
| RS3 | Refresh page — sale still in list (DB-backed) | Cashier | ☐ |
| RS4 | Search/filter finds sale by sale no | Cashier | ☐ |

---

## Refund

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| RF1 | Open completed sale from Recent Sales | Manager | ☐ |
| RF2 | Refund succeeds | Manager | ☐ |
| RF3 | Sale status shows refunded | Manager | ☐ |
| RF4 | Stock restored after refund | Manager | ☐ |
| RF5 | Cashier blocked from refund if policy requires | Cashier | ☐ |

---

## Void

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| V1 | Void a different completed sale | Owner | ☐ |
| V2 | Sale status shows voided/cancelled | Owner | ☐ |
| V3 | Stock restored after void | Manager | ☐ |
| V4 | Duplicate void blocked | Owner | ☐ |

---

## Cash Session Close

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| CC1 | Cash-in or cash-out recorded (optional) | Cashier | ☐ |
| CC2 | Close shift with counted cash | Cashier | ☐ |
| CC3 | Expected vs counted cash shown | Manager | ☐ |
| CC4 | Dashboard close-day reflects closed shift | Owner | ☐ |

---

## Reports

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| RP1 | `/reports` loads | Manager | ☐ |
| RP2 | Change date preset — totals update | Manager | ☐ |
| RP3 | Sales total ≈ dashboard for same period | Owner | ☐ |
| RP4 | Inventory valuation visible | Manager | ☐ |
| RP5 | Cashier blocked from reports if policy requires | Cashier | ☐ |

---

## Customers / Membership

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| C1 | `/customers` list loads | Manager | ☐ |
| C2 | Member customer shows tier / points | Manager | ☐ |
| C3 | POS sale with member — member price or discount applies | Cashier | ☐ |
| C4 | Points earn visible after member sale | Manager | ☐ |
| C5 | `/membership-levels` loads (if used) | Owner | ☐ |

---

## Promotions

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| PR1 | `/promotions` list loads active promos | Manager | ☐ |
| PR2 | Sale with eligible promo — discount on receipt | Cashier | ☐ |
| PR3 | Final receipt total is server total (authoritative) | Cashier | ☐ |

---

## Settings

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| ST1 | `/settings` loads (owner) | Owner | ☐ |
| ST2 | Cashier blocked from settings | Cashier | ☐ |
| ST3 | Change receipt prefix — save — new POS sale uses prefix | Owner | ☐ |
| ST4 | QR bank/account saves and appears on POS | Owner | ☐ |
| ST5 | Receipt print mode (ask/auto/no-auto) works on device | Owner | ☐ |

---

## Permissions / Approval

| # | Step | Role | Pass |
| --- | --- | --- | --- |
| A1 | Cashier cannot access owner-only settings | Cashier | ☐ |
| A2 | Manager can access reports / purchasing per role | Manager | ☐ |
| A3 | Inventory adjustment over threshold creates approval (back office) | Manager | ☐ |
| A4 | Owner can approve/reject pending approval | Owner | ☐ |
| A5 | Document POS local approval panel behavior (known P1) | Owner | ☐ |

---

## Session summary

| Flow | Pass | Fail | N/A |
| --- | --- | --- | --- |
| Login | | | |
| Dashboard | | | |
| Products | | | |
| Inventory | | | |
| Suppliers | | | |
| Purchase Order | | | |
| Receiving | | | |
| POS open shift | | | |
| POS sale | | | |
| Receipt | | | |
| Recent Sales | | | |
| Refund | | | |
| Void | | | |
| Cash session close | | | |
| Reports | | | |
| Customers / Membership | | | |
| Promotions | | | |
| Settings | | | |
| Permissions / Approval | | | |

**Tester:** _______________ **Date:** _______________ **Overall:** Pass / Fail
