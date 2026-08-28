# EGO POS Demo, Mock, and Live Data Audit

Audit date: 2026-08-28. All database inspection was read-only. No customer, password, payment, or credential values were printed.

## Target identity and configuration result

* `.env.local` has a configured Supabase/PostgreSQL URL.
* The configured target matches the Supabase project reference used by `scripts/go-box-catalog-migration.ts` as its production target.
* Current local `NEXTAUTH_URL` is `http://localhost:3000`; it is appropriate only for local test use, not a deployed public origin.
* Effective demo mode is configured false locally. The production demo guard source/harness confirms production resolves demo mode false and rejects a production demo flag.

## Current live-record counts

| Data set | Count | Interpretation |
| --- | ---: | --- |
| Companies / branches / warehouses | 1 / 1 / 1 | One active Mini Mart store exists |
| Users / company memberships | 1 / 1 | One active Owner membership |
| Plans / subscriptions | 1 / 1 | One plan assignment exists |
| Products / product units / categories | 0 / 0 / 0 | No saleable catalogue in the verified target |
| Inventory balances / lots / movements | 0 / 0 / 0 | No inventory history or opening stock |
| Suppliers / POs / goods receipts / payables | 0 / 0 / 0 / 0 | No purchasing history |
| Customers / promotions / sales / sale items | 0 / 0 / 0 / 0 | No customer or commerce history |
| Cash sessions / audit logs / store activity | 0 / 0 / 0 | No operational audit trail in this target |
| Super Admins / setup admins | 0 / 0 | Platform administration cannot be logged into here |

## Business and user classification

| Record | Classification | Evidence |
| --- | --- | --- |
| GO BOX Mini Mart, store code 0001 | Real current configured store record | Active Mini Mart template, one main branch, no operational data |
| `gobox` Owner | Real current configured store user | Active membership, POS and Back Office access enabled |
| EGO QA / LP4 / demo / test / seed business records | Not present in verified target | No matching company/product/promotion data found in read-only aggregate inventory |
| Hundreds of promotions | Not present in verified target | Promotions count is zero |
| BETA WATER fixture assumed by cleanliness script | Test-harness assumption only | Not present in the current live count; script did not complete |

## Repository mock/demo classification

| Location | State | Production impact |
| --- | --- | --- |
| `lib/demo-mode.ts`, `lib/env/demo-mode-guard.ts` | Guarded demo system | Effective false in production |
| `lib/demo/**` local-storage repositories | Demo/local state | Not the reviewed production service source of truth |
| `lib/auth/options.ts` demo users | Demo-only credentials path | Only used when demo mode is explicitly effective |
| `features/*/mock-data.ts` | Fixture files | Present for UI/history; reviewed production services use Prisma repositories |
| Product shell tools and Super Admin status surfaces | Static/read-only UI | Explicitly labelled disabled/not connected/coming soon |

## Data-readiness conclusions

1. There is no detected old test/demo/QA business clutter in the configured target.
2. The target has no sample or operational dataset suitable for proving POS, reports, promotions, receiving, returns, or cash reconciliation.
3. The target has no Super Admin account, so there is no supported way to use the existing Create Store control plane on this target until a protected bootstrap account is established.
4. A prior local test/product result should not be assumed to describe this target: the currently inspected database has zero products and zero inventory.

## Data policy before pilot

* Do not run seed or release-readiness scripts against this target without a dedicated approval: several repository scripts create, update, close, refund, void, or adjust data.
* Use a separate controlled UAT dataset/database for product, receiving, POS, cash, refund, and reporting verification.
* Create only approved named test stores and users through the provisioning flow after Super Admin bootstrap is verified.
* Define backup/restore and retention procedures before real customer or payment data is entered. Current Super Admin backup/status screens are read-only only.
