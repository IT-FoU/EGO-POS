# IGO POS Integration Checklist

| Module | Action | Expected Behavior | Current Status | Connected To | Permission Check | Audit Log Check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| Login/Auth | Owner login | Owner signs in and gets full access | API callback returns 200 | NextAuth credentials | Partial, roles loaded | Login history for DB users only | PARTIAL |
| Login/Auth | Manager login | Manager signs in with configured permissions | API callback returns 200 | NextAuth demo user | Demo bypasses permission DB | Not audited in demo | PARTIAL |
| Login/Auth | Cashier login | Cashier signs in with POS-only access | API callback returns 200 | NextAuth demo user | Demo bypasses permission DB | Not audited in demo | PARTIAL |
| Login/Auth | Wrong password | Reject login | API callback returns 401 | NextAuth | Yes | DB failed login only | PASS |
| Dashboard | Load metrics | Show sales, inventory, alerts | Page loads 200 | Dashboard service / mixed data | View permission not enforced | No read audit | PARTIAL |
| Dashboard | Quick actions | Navigate to modules | UI links exist | Routes | Static locks only | No | PARTIAL |
| POS | Create sale | Sale, items, payments, stock movement, loyalty ledger | Repository implemented, blocked in demo writes | Sales, Inventory, Customers, Promotions, Settings | `pos.sell` server action | Yes through transaction if real writes | PARTIAL |
| POS | Stock deduction | Atomic decrement and stock movement | Implemented in repository | Inventory balance / stock movements | Via sale permission | Yes if real write | PARTIAL |
| POS | Promotion apply | Apply active promotion safely | Simplified engine only | Promotions | Not full stack/approval | Promotion usage if real write | PARTIAL |
| POS | QR payment | Use default QR account | UI/localStorage only | Settings localStorage | Not enforced | No | FAIL |
| POS | Receipt | Generate receipt | Client preview exists | POS cart/settings partially | N/A | No print audit | PARTIAL |
| POS | Customer display | Update checkout screen | localStorage display state | Customer display page | N/A | No | PARTIAL |
| Inventory | Quick stock in | Increase stock, lot, movement | Repository/action exists, UI exists | Inventory balance/lot/movement | `inventory.stock_in` | Yes if real write | PARTIAL |
| Inventory | Adjustment | Adjust stock safely | Repository/action exists | Inventory balance/movement | `inventory.adjust` | Yes if real write | PARTIAL |
| Inventory | Count | Save stock count | Repository/action exists | Inventory balance/movement | `inventory.count` | Yes if real write | PARTIAL |
| Inventory | Print/download slip | Print/PDF receiving slip | Placeholder message | None | None | No | FAIL |
| Products | Create/edit product | Persist product and units | Server actions/repo exist | Products/categories/units | Product permissions | Yes if real write | PARTIAL |
| Products | Import/export | Import/export products | Placeholder | None | None | No | FAIL |
| Products | Image search/upload | Store product/unit images | Placeholder/local UI | Product images partially | Not complete | No | FAIL |
| Purchasing | Create PO | Persist PO | Action/repo exists | Purchase orders/items | `purchasing.create` | Yes if real write | PARTIAL |
| Purchasing | Receive goods | Increase inventory and update PO | Repo/action exists | Inventory/Purchasing | `purchasing.receive` | Yes if real write | PARTIAL |
| Purchasing | Supplier payment | Record supplier payment | Repo/action exists | Purchasing/AP | `purchasing.payment` | Yes if real write | PARTIAL |
| Purchasing | Supplier profile link | Open real supplier profile | Placeholder messages on purchasing page | None | None | No | FAIL |
| Suppliers | Create/edit/delete | Persist supplier | Actions/repo exist | Suppliers | Supplier permissions | Yes if real write | PARTIAL |
| Suppliers | Products supplied | Link products to supplier | UI placeholder | Product relationship future | No | No | FAIL |
| Suppliers | Supplier ledger | Real AP ledger | UI/demo placeholder | Purchasing/AP future | No | No | FAIL |
| Customers | Create/edit customer | Persist customer | Actions/repo exist | Customers | Customer permissions | Yes if real write | PARTIAL |
| Customers | Customer payment | Record payment | API/action exists | Customer payments | Customer payment permission | Yes if real write | PARTIAL |
| Customers | Import/export | Import/export customers | Placeholder | None | None | No | FAIL |
| Membership Levels | CRUD | Manage levels | API/actions/repo exist | Customers/Promotions references | Membership permission | Yes if real write | PARTIAL |
| Membership Levels | Discount amount/rounding in POS | Apply membership discounts fully | UI exists, POS not fully proven | POS checkout | Not specific | Not specific | FAIL |
| Promotions | Create/edit/archive | Persist promotion | Actions/repo exist | Promotions | Promotion permissions | Yes if real write | PARTIAL |
| Promotions | Stack rules | Enforce stacking | UI/docs exist | Not checkout engine | Not enforced | No | FAIL |
| Promotions | Profit protection | Block loss-making promo/save/checkout | UI warning exists, checkout incomplete | Not fully connected | Not enforced | No | FAIL |
| Promotions | Analytics/calendar | Show analytics/calendar | Pages exist, mock/demo | Reports/mock | View permission partial | No | PARTIAL |
| Reports | Dashboard/report center | Show report widgets | UI and mock service exist | Mock/mixed sources | Not fully enforced | No | PARTIAL |
| Reports | Export/print/schedule | Export/print reports | UI shell mostly | Not final | Not enforced | No | FAIL |
| Settings | Company profile/tax/loyalty | Persist and affect POS | Server action/repo exists | POS tax/loyalty | `settings.manage` | Yes if real write | PARTIAL |
| Settings | QR banks/accounts | Dynamic banks and QR accounts | localStorage-heavy UI | POS localStorage | Not server enforced | Demo notices only | FAIL |
| Settings | Staff control/permissions | Configure roles/actions | UI/local data mostly | Permissions not source of truth | Not fully connected | Demo notices only | FAIL |
| Settings | Approval workflow | Create/approve/reject pending actions | UI/demo only | Not server enforced | Not enforced | Demo notices only | FAIL |
| Staff Activity | Track login/logout/sales/actions | Activity monitor real data | UI/demo | None/partial | No | No | FAIL |
| Audit Log | Important actions | Log all writes and decisions | Transaction writes only | AuditLog table | N/A | Partial | PARTIAL |
| Super Admin | Login | Separate admin login | Route/API exists | Super admin session | Separate cookie/session | Admin login route | PARTIAL |
| Super Admin | Subscription/feature lock | Enforce plan entitlements | UI foundation | Not merchant enforcement | Not combined with staff permission | No | FAIL |
| Business Templates | Select template/setup | Store draft and enter shell | Local onboarding context | localStorage/POS shell | N/A | No | PARTIAL |
| Localization | Language switch all pages | Single language only | Partial | Dictionaries/locales mixed | N/A | No | FAIL |

## Status Legend

- PASS: Behavior is implemented and verified at code/build/route level.
- PARTIAL: Some implementation exists, but missing persistence, permission, audit, real data, or full behavior.
- FAIL: UI-only, placeholder, disconnected, or missing source-of-truth integration.
