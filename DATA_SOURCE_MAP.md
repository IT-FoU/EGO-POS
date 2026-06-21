# EGO POS Data Source Map

This document defines current source, target source of truth, repository/service, storage key or database table, read path, write path, mock status, localStorage status, server mock status, and migration needs for every module.

## 1. Auth / Login

- Current data source: NextAuth, built-in demo users, demo staff cookie/storage, Prisma users.
- Target source of truth: `User`, `CompanyUser`, `Role`, `Permission`, `UserRole`, `LoginHistory`.
- Demo repository/service: `demoStaffRepository`, `lib/auth/demo-staff-access.ts`.
- Demo storage key: `ego.pos.staff.access.users`.
- Database tables: `User`, `CompanyUser`, `Role`, `Permission`, `RolePermission`, `UserRole`, `LoginHistory`.
- Read path: `lib/auth/options.ts`, `lib/auth/session.ts`.
- Write path: Settings staff access UI; production future user repository.
- Still mock: built-in users.
- Still localStorage: demo staff users through central repository.
- Still server mock: no, but production/demo branches coexist.
- Migration needed: Settings staff must write production users/roles.

## 2. Business Selection / Onboarding

- Current data source: demo storage.
- Target source of truth: `Company`, `Branch`, `Warehouse`, `CompanySetting`, `CompanyModule`.
- Demo repository/service: onboarding context using demo storage helper.
- Demo storage keys: `ego-pos:onboarding-business`, `ego-pos:onboarding-complete`, `ego-pos:onboarding-draft`, `ego-pos:onboarding-template`.
- Database tables: `Company`, `Branch`, `Warehouse`, `CompanySetting`, `Plan`.
- Read path: `features/platform/onboarding-context.ts`.
- Write path: same context.
- Still mock: non-Mini-Mart templates are shell/placeholder.
- Still localStorage: yes in demo.
- Still server mock: no.
- Migration needed: persist business setup to production company tables.

## 3. Dashboard

- Current data source: dashboard service and mixed derived/mock values.
- Target source of truth: Reports repositories reading sales, inventory, customers, purchasing, payments, audit.
- Demo repository/service target: future `dashboardRepository` backed by sales/products/inventory/purchasing repositories.
- Demo storage keys: sales, products, inventory movements, customers, audit logs.
- Database tables: `Sale`, `SaleItem`, `SalePayment`, `InventoryBalance`, `StockMovement`, `Customer`, `SupplierPayable`, `PromotionUsage`, `AuditLog`.
- Read path: `features/dashboard/dashboard-service.ts`, shell components.
- Write path: none.
- Still mock: yes.
- Still localStorage: indirect plan/logo settings in demo.
- Still server mock: yes.
- Migration needed: replace independent metrics with report/dashboard repository.

## 4. Products

- Current data source: central demo product repository for client create/list/edit/delete; server service still has mock/Prisma paths.
- Target source of truth: Product repository adapter.
- Demo repository/service: `demoProductsRepository`, `demoCategoryRepository`.
- Demo storage keys: `ego.pos.products`, `ego.pos.categories`.
- Database tables: `Product`, `ProductUnit`, `ProductImage`, `Category`, `Brand`, `ProductPriceHistory`, `ProductBarcodeHistory`.
- Read path: Product list/form client; server product service still for categories/images and legacy paths.
- Write path: Product form/list through demo repositories; production future via actions/repository.
- Still mock: product server service still imports mock data.
- Still localStorage: yes via central demo repository only.
- Still server mock: yes in `product-service.ts`.
- Migration needed: repository interface shared by server/client and Prisma/demo adapters.

## 5. POS

- Current data source: POS server snapshot plus central demo repositories on client.
- Target source of truth: POS checkout service and sales repository.
- Demo repository/service: products, sales, receipts, audit, pending approval, QR, settings repositories.
- Demo storage keys: `ego.pos.products`, `ego.pos.sales`, `ego.pos.receipts`, `ego.pos.auditLogs`, `ego.pos.pendingApprovals`, `ego.pos.customerDisplay.state`.
- Database tables: `Sale`, `SaleItem`, `SalePayment`, `Receipt`, `StockMovement`, `InventoryBalance`, `AuditLog`.
- Read path: `features/pos/pos-service.ts`, `features/pos/components/pos-page-client.tsx`.
- Write path: POS complete sale client demo path; production `completeSaleAction`.
- Still mock: POS service returns empty products/customers in demo; product grid hydrates from repository.
- Still localStorage: yes via central demo repository.
- Still server mock: partial.
- Migration needed: central checkout service with demo and Prisma adapters.

## 6. Inventory

- Current data source: server mock data and partial Prisma APIs.
- Target source of truth: `InventoryBalance`, `InventoryLot`, `StockMovement`.
- Demo repository/service: `demoInventoryMovementRepository` plus future inventory balance adapter.
- Demo storage key: `ego.pos.inventory.movements`.
- Database tables: `InventoryBalance`, `InventoryLot`, `StockMovement`, `StockAdjustment`, `StockTransfer`, `StockTransferItem`.
- Read path: `features/inventory/inventory-service.ts`, inventory mock data.
- Write path: inventory APIs for stock-in/adjustment/count.
- Still mock: yes.
- Still localStorage: only future/demo movement repository; UI still server mock.
- Still server mock: yes.
- Migration needed: derive inventory UI from products + movements in demo; use Prisma transaction in production.

## 7. Purchasing

- Current data source: purchasing mock data plus API/actions.
- Target source of truth: Purchasing/AP repository.
- Demo repository/service: not complete.
- Demo storage key: not finalized.
- Database tables: `Purchase`, `PurchaseItem`, `GoodsReceipt`, `GoodsReceiptItem`, `PurchasePayment`, `SupplierPayable`.
- Read path: `features/purchasing/purchasing-service.ts`.
- Write path: purchasing APIs/actions.
- Still mock: yes.
- Still localStorage: no centralized purchasing demo store yet.
- Still server mock: yes.
- Migration needed: create purchase/receiving/payable repository and connect inventory movements.

## 8. Suppliers

- Current data source: mock data and Prisma repository.
- Target source of truth: Supplier repository.
- Demo repository/service: not complete.
- Demo storage key: future `ego.pos.suppliers`.
- Database tables: `Supplier`, `SupplierPayable`, `Purchase`, `PurchasePayment`, `GoodsReceipt`.
- Read path: `features/suppliers/supplier-service.ts`.
- Write path: supplier actions/API.
- Still mock: yes for UI-rich sections.
- Still localStorage: not centralized.
- Still server mock: partial.
- Migration needed: supplier profile repository and ledger derived from purchasing/AP.

## 9. Customers

- Current data source: mock data and Prisma APIs.
- Target source of truth: Customer repository.
- Demo repository/service: `demoCustomerRepository` exists as foundation but not fully connected.
- Demo storage key: `ego.pos.customers`.
- Database tables: `Customer`, `CustomerGroup`, `CustomerGroupMember`, `CustomerPayment`, `LoyaltyPointLedger`.
- Read path: customer services/components.
- Write path: `/api/customers`, `/api/customers/[id]`, customer payment API.
- Still mock: yes.
- Still localStorage: foundation only.
- Still server mock: yes.
- Migration needed: connect POS customer lookup and customer page to same repository.

## 10. Membership / Loyalty

- Current data source: API/repository plus UI state.
- Target source of truth: Membership repository and loyalty service.
- Demo repository/service: `demoMembershipRepository` foundation only.
- Demo storage key: `ego.pos.memberships`.
- Database tables: `MembershipLevel`, `LoyaltyPointLedger`, `CustomerSubscription`.
- Read path: membership pages/API.
- Write path: membership API/actions.
- Still mock: partial.
- Still localStorage: foundation only.
- Still server mock: partial.
- Migration needed: connect POS membership discount/points engine.

## 11. Promotions

- Current data source: mock data, Prisma repository, wizard UI state.
- Target source of truth: Promotion repository and promotion engine.
- Demo repository/service: `demoPromotionRepository` foundation only.
- Demo storage key: `ego.pos.promotions`.
- Database tables: `Promotion`, `PromotionRule`, `PromotionAction`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage`.
- Read path: `features/promotions/promotion-service.ts`.
- Write path: promotion actions/API.
- Still mock: yes.
- Still localStorage: foundation only.
- Still server mock: yes.
- Migration needed: build promotion engine and connect POS checkout.

## 12. Reports

- Current data source: report mock data/full mock UI data plus partial API.
- Target source of truth: Reports repository reading real modules.
- Demo repository/service: future report adapter reading sales/products/inventory/customers/purchasing/promotions/audit demo repositories.
- Demo storage keys: `ego.pos.sales`, `ego.pos.receipts`, `ego.pos.products`, `ego.pos.inventory.movements`, `ego.pos.customers`, `ego.pos.promotions`, `ego.pos.auditLogs`.
- Database tables: `Sale`, `SaleItem`, `SalePayment`, `InventoryBalance`, `StockMovement`, `Purchase`, `SupplierPayable`, `Customer`, `PromotionUsage`, `AuditLog`.
- Read path: `features/reports/report-service.ts`, report clients.
- Write path: favorite/schedule future.
- Still mock: yes.
- Still localStorage: no direct real report source yet.
- Still server mock: yes.
- Migration needed: replace report mock metrics with repository-derived metrics.

## 13. Settings

- Current data source: central demo repositories for some client settings, server action/Prisma setting path.
- Target source of truth: Settings repository and `CompanySetting`.
- Demo repository/service: `demoSettingsRepository`, `demoQrRepository`, `demoStaffRepository`.
- Demo storage keys: `ego-pos:company-logo-url`, `ego.pos.settings`, `ego.pos.qr.banks`, `ego.pos.qr.accounts`, `ego.pos.staff.access.users`, `ego.pos.staff.access.audit`.
- Database tables: `CompanySetting`, future `Bank`, `QrAccount`, `PrinterProfile`, `StaffSetting`.
- Read path: `features/settings/components/settings-form.tsx`.
- Write path: settings form and actions.
- Still mock: settings cards include UI-only sections.
- Still localStorage: yes via central repositories.
- Still server mock: partial.
- Migration needed: define production models/settings JSON schema for each settings section.

## 14. QR Payment Banks

- Current data source: central demo QR repository in Settings/POS.
- Target source of truth: QR account repository.
- Demo repository/service: `demoQrRepository`.
- Demo storage keys: `ego.pos.qr.banks`, `ego.pos.qr.accounts`.
- Database tables: future `Bank`, `QrAccount` or `CompanySetting` JSON schema.
- Read path: Settings QR section, POS QR field.
- Write path: Settings QR section.
- Still mock: seeded example banks may exist.
- Still localStorage: yes through central repository.
- Still server mock: no dedicated production source yet.
- Migration needed: create production schema and branch default rule.

## 15. Printer / Receipt / Barcode / Price Label

- Current data source: receipt preview/settings partial; printer architecture documented.
- Target source of truth: Printer profile repository and print job service.
- Demo repository/service: future `demoPrinterRepository`.
- Demo storage key: future `ego.pos.printers`.
- Database tables: future `PrinterProfile`, `PrintTemplate`, `PrintJob`.
- Read path: receipt/customer display/settings partial.
- Write path: future settings printer section.
- Still mock: yes.
- Still localStorage: not centralized.
- Still server mock: no implementation.
- Migration needed: build printing module after core transaction workflow.

## 16. Approval Workflow

- Current data source: POS pending approval demo key and Settings UI rules.
- Target source of truth: approval service.
- Demo repository/service: `demoPendingApprovalRepository`.
- Demo storage key: `ego.pos.pendingApprovals`.
- Database tables: `Approval`, `AuditLog`.
- Read path: POS and Settings pending approval UI.
- Write path: POS guarded actions; future all modules.
- Still mock: partial.
- Still localStorage: yes through central repository.
- Still server mock: no global service yet.
- Migration needed: central approval service and server enforcement.

## 17. Audit Logs

- Current data source: POS/staff demo audit and Prisma/platform audit.
- Target source of truth: audit service.
- Demo repository/service: `demoAuditLogRepository`, staff audit repository.
- Demo storage keys: `ego.pos.auditLogs`, `ego.pos.staff.access.audit`.
- Database tables: `AuditLog`, `LoginHistory`, `CompanyAccessLog`.
- Read path: POS panels, Super Admin audit, future Reports.
- Write path: POS client, Settings staff client, Prisma actions.
- Still mock: partial.
- Still localStorage: yes through central repository.
- Still server mock: partial.
- Migration needed: one audit service for all modules.

## 18. Super Admin / Subscription

- Current data source: Super Admin session and mixed demo/Prisma admin data.
- Target source of truth: platform repository.
- Demo repository/service: admin data fallback.
- Demo storage key: none for merchant localStorage.
- Database tables: `SuperAdmin`, `Company`, `User`, `Plan`, `SaaSSubscription`, `CompanyAccessLog`.
- Read path: `features/igo-admin/admin-data.ts`, admin session.
- Write path: admin APIs/actions future.
- Still mock: partial.
- Still localStorage: no.
- Still server mock: partial.
- Migration needed: enforce feature locks in merchant portal.

## 19. Localization

- Current data source: translation helpers plus runtime repair layer.
- Target source of truth: translation dictionaries.
- Demo repository/service: locale storage helper.
- Demo storage key: `ego-pos:locale`.
- Database table: user/company locale setting future.
- Read path: language toggles, runtime localization, components.
- Write path: language toggle.
- Still mock: no.
- Still localStorage: yes through stable key.
- Still server mock: no.
- Migration needed: remove runtime bridge after all UI strings use keys.
