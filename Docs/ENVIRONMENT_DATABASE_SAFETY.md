# Environment database safety

Local development must never write to the Production database.

Production fingerprint (non-secret): `ieutdqnlfiiaawctapor`

## LOCAL DEV

`npm run dev` and `npm run dev:uat` use `DEV_DATABASE_URL` only.

Current committed default: local Postgres `127.0.0.1:5432/igo_pos`.

Missing or Production `DEV_DATABASE_URL` fails closed. There is no fallback to `DATABASE_URL`.

## AUTOMATED TESTS

DB-backed tests use `TEST_DATABASE_URL`, then `DEV_DATABASE_URL`.

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
