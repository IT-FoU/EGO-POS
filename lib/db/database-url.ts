const FALLBACK_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/igo_pos?schema=public";

export function getDatabaseUrl() {
  return process.env.DATABASE_URL ?? FALLBACK_DATABASE_URL;
}

export const databaseUrl = getDatabaseUrl();
