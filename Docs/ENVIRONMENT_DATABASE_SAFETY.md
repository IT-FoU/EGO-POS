# Environment database safety

Local development must never write to the Production database.

Production fingerprint (non-secret): `ieutdqnlfiiaawctapor`

## LOCAL POSTGRES (Docker)

```
docker start ego-pos-postgres-dev
docker stop ego-pos-postgres-dev
docker ps --filter name=ego-pos-postgres-dev
```

Container: `ego-pos-postgres-dev`  
Volume: `ego-pos-postgres-data`  
Image: `postgres:17`  
Bind: `127.0.0.1:5432`  
User / password: `postgres` / `postgres` (local only)

Development DB: `igo_pos`  
Test DB: `igo_pos_test`

## LOCAL DEV

`npm run dev` and `npm run dev:uat` use `DEV_DATABASE_URL` only.

```
postgresql://postgres:postgres@127.0.0.1:5432/igo_pos?schema=public
```

First-time local data:

```
npm run db:seed
npx tsx scripts/phase-env-01a-local-fixture.ts
```

Local store login (synthetic): `igo-admin` / `AdminChangeMe123!`

Missing or Production `DEV_DATABASE_URL` fails closed. There is no fallback to `DATABASE_URL`.

## AUTOMATED TESTS

DB-backed tests use `TEST_DATABASE_URL`:

```
postgresql://postgres:postgres@127.0.0.1:5432/igo_pos_test?schema=public
```

They refuse the Production fingerprint.

Fixture POS / hydration tests do not need a database.

## PRODUCTION

Cloudflare Worker `egopos` → Hyperdrive `b8ec6fa6a71f44e5a40a6a108ffe6a85` → Production Supabase.

Do not change Hyperdrive ID, PrismaPg `max`, or PrismaPg `maxUses`.

## PRODUCTION UAT

Use `https://egopos.i-goto.workers.dev` only.

Never use `localhost` against Production.

## PRODUCTION MIGRATION

```
EGO_ALLOW_PRODUCTION_MIGRATION=true
npx prisma migrate deploy
```

`npm run prisma:migrate` and `npm run prisma:migrate:status` refuse Production unless that flag is set.

Local `prisma migrate deploy` uses `DEV_DATABASE_URL` / `TEST_DATABASE_URL`.

## PRODUCTION READ-ONLY SCRIPTS

```
EGO_PRODUCTION_READONLY=true
npx tsx scripts/phase-fix-15-production-safety.ts
```

Do not add a general `ALLOW_PRODUCTION_WRITES` flag.

## NEVER

- `localhost` → Production database
- `DEV_DATABASE_URL` missing → use Production `DATABASE_URL`
- seed, checkout, hold, refund, void, cash, or stock writes from local/dev/test against Production
