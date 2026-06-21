# Phase 0 Implementation Notes

## Architecture

The app is a cloud-ready modular monolith using Next.js App Router, PostgreSQL, Prisma, and NextAuth. It keeps business modules out of Phase 0 while preparing the database and route structure for future phases.

## Multi-Tenancy

Users are global and connected to companies through `company_users`. This supports the master spec requirement that one user can belong to multiple companies.

## Locale and Currency

The default locale foundation is Lao, with English dictionaries available from the beginning. The base currency is LAK and is represented in schema defaults.

## Security Foundation

Phase 0 includes:

- Credentials authentication
- Login history records
- Role and permission tables
- Company membership tables
- Audit log table and seed audit event

Full permission enforcement and audit coverage should be expanded in later approved security phases.
