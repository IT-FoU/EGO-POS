# EGO POS

EGO POS is a modern POS and retail management platform for Go BOX first, then a SaaS-ready platform for stores in Laos.

## Phase 0 Scope

- Next.js foundation with TypeScript
- Tailwind CSS dark/light theme foundation
- Lao and English dictionary foundation
- PostgreSQL + Prisma schema skeleton
- NextAuth credentials authentication
- Company, branch, warehouse, user, role, permission, and audit log foundation
- Protected dashboard layout

Business modules such as inventory, purchasing, POS, promotions, and reporting are intentionally not implemented in Phase 0.

## Environment

Copy `.env.example` to `.env.local` and set:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/igo_pos?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-secure-random-secret"
IGO_DEFAULT_LOCALE="lo"
IGO_BASE_CURRENCY="LAK"
```

## Commands

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name phase_0_foundation
npm run db:seed
npm run dev
```

Use `http://localhost:3000` for local development. Avoid `http://127.0.0.1:3000`
so auth cookies and local sessions stay on the same canonical host.

Seed login:

- Username: `owner`
- Password: `ChangeMe123!`

Change the seeded password before production use.

