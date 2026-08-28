# EGO POS Action Wiring Audit

Audit date: 2026-08-28. This is a high-impact action inventory, grouped by user workflow. `WORKING` means server/repository wiring was found in source, not that a live transaction was performed during this audit.

| Module | Visible action/workflow | Classification | Evidence and required follow-up |
| --- | --- | --- |
| Authentication | Store login by username/email | WORKING | NextAuth Credentials calls merchant authentication and active membership resolver. EGO-FIX-04 local HTTP smoke logged in as GO BOX Owner `gobox`. |
| Authentication | Logout | WORKING | NextAuth/session flow present. Super Admin logout smoke passed. |
| Authentication | Public registration | BLOCKED BY DESIGN | `/register` is an informational closed page; store setup is Super Admin only. |
| Super Admin | Super Admin login | WORKING | Bcrypt verification and server cookie session exist; EGO-FIX-01 provisioned exactly one Production Super Admin. EGO-FIX-04 local HTTP login/session/logout smoke passed. Worker hostname DNS still fails on this PC. |
| Super Admin | Create Store | WORKING | Provisioning transaction creates user, company, branch, warehouse, roles, owner membership, subscription, and audit-related state. Requires an authenticated real Super Admin. |
| Super Admin | Business/store/user/role pages | WORKING READ | Real admin-data queries reviewed. |
| Super Admin | Plan, Feature Control, Subscriptions writes | UI ONLY | Billing/entitlement save, payment approval, plan changes, add-on activation disabled. |
| Super Admin | Support tickets | UI ONLY | Create/reply/assign/resolve/upload/notify disabled. |
| Super Admin | Integrations, backup/restore, health actions | UI ONLY | Status/navigation only; no provider/backend writes. |
| Dashboard | Dashboard metrics and drill-down reads | WORKING READ | Prisma data paths, permission check, lifecycle-aware reporting. Empty-on-error fallback needs visible UAT. |
| Products | Create/update product and units | WORKING | Server action and Prisma validation exist. Product save does not create stock. |
| Products | Archive/delete and bulk delete | WORKING | Real actions; reference-aware archive/delete safeguards reviewed. Treat as controlled admin action in UAT. |
| Products | Category add/edit/delete | WORKING | Real category action path and usage protection. |
| Products | Supplier/Brand text in form | PARTIAL | Free-text values remain UI-visible but are not sent as supplier/brand foreign keys. |
| Products | Product image management | UI ONLY | Read-only/image placeholder state; no confirmed storage backend. |
| Products | Barcode alias management | UI ONLY | Local form state only; no persistence or POS lookup. |
| Products | Import/export, label print, barcode generate, bulk price apply | DISABLED | Product tool drawers are deliberately read-only/preview-first. |
| Inventory | Quick Stock In search/preload | WORKING READ | Barcode query preloads local search; never auto-selects or writes. |
| Inventory | Quick Stock In confirm | WORKING | Explicit preview then `stockInAction`; validates product/warehouse/unit/qty/lot/expiry and writes transactionally. |
| Inventory | Initial product receiving from handoff | BLOCKED | Search only contains existing `inventory_balances`; zero-balance new product is not discoverable. |
| Inventory | Stock adjustment | WORKING | Repository/action exists; runtime role UAT required. |
| Inventory | Stock count | WORKING | Repository/action exists; reconciliation UAT required. |
| Inventory | Transfers | NOT VERIFIED | Schema tables exist; no completed end-user transfer workflow was verified. |
| POS | Add product/search/cart | WORKING SOURCE | DB snapshot includes company-scoped active products with balances; browser UAT needed. |
| POS | Complete sale/payment/change | WORKING | Server recalculates totals/tax/promotions, validates tender, writes sale/items/payments, decrements balance, writes movement. |
| POS | Held bill/resume | WORKING | Persistent server foundation and APIs present. |
| POS | Receipt/reprint | PARTIAL | Browser print path and reprint record code exist; physical printer/format UAT not done. |
| POS | Void/refund/return/exchange | WORKING SOURCE | Real repositories and stock movement paths exist; no live reconciliation test. |
| POS | Lot/FEFO sale handling | WORKING SOURCE | EGO-FIX-03: checkout/refund/void/exchange consume and restore `inventory_lots` FEFO with `inventory_lot_allocations` provenance; isolated fixture suite passed. Browser UAT still required. |
| Cash | Open/close session, cash in/out | WORKING SOURCE | Server services exist; shift reconciliation UAT required. |
| Purchasing | Create PO | WORKING | Validates supplier/product/unit and writes draft PO. |
| Purchasing | Receive goods | WORKING | Transaction updates balance, creates receipt/lot/movement, PO receipt status, payable/outstanding. |
| Purchasing | Supplier payment | WORKING | Creates payment and updates payable, supplier, and PO balances. Partial receipt/payment scenarios require accounting UAT. |
| Suppliers | CRUD/archive | WORKING | Real server actions/repository found. |
| Customers | CRUD/archive | WORKING | Real tenant-scoped actions/repository found. |
| Customers | Credit payment | PARTIAL | Real payment write path exists; overpayment and report reconciliation need UAT. |
| Loyalty/membership | Earn/redeem/reverse points | WORKING SOURCE | Ledger and lifecycle code exists; test reversed/voided sales. |
| Promotions | Create/update/archive and POS auto-apply | WORKING SOURCE | POS recomputes promotion policy server-side. Validate submitted product/category/membership IDs are tenant-scoped before production. |
| Reports | Dashboard/report filters and calculated views | WORKING READ | Real report repository; exact financial parity needs UAT fixture. |
| Reports | Export/download | NOT VERIFIED | Surface not exercised; no claim of export correctness. |
| Settings | Save company/branch settings | WORKING SOURCE | Settings repository/action exists; verify owner/manager role boundaries. |

## Unsafe or misleading action candidates

1. **Lot/expiry sale-return reconciliation is source-fixed (EGO-FIX-03).** Controlled browser environment is restored (EGO-FIX-04). Remaining work is Owner UAT and P1 items, not a P0 environment blocker.
2. **Quick Stock In cannot receive a product’s first stock through the new barcode handoff.** It is a P1 workflow blocker, not an auto-write issue.
3. **Super Admin status pages are intentionally safe-status, not control-plane functionality.** Their disabled labels are correct; do not remove them or claim those actions are enabled.
4. **Product tool drawers are intentionally read-only.** They are not broken click targets, but they must be labelled as deferred in release notes.

## Permission consistency observation

Inventory actions apply both store-action permission and legacy permission checks. Products, suppliers, and purchasing actions reviewed use legacy `requireWritePermission` only. This is not a confirmed bypass because role permissions still gate them, but it is an inconsistent defense-in-depth model and merits a P1 authorization review before pilot.
