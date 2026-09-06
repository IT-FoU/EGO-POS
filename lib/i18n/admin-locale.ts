export const ADMIN_LOCALES = ["en", "th"] as const;
export type AdminLocale = (typeof ADMIN_LOCALES)[number];

export function isAdminLocale(value: unknown): value is AdminLocale {
  return value === "en" || value === "th";
}

export function normalizeAdminLocale(value?: string | null): AdminLocale {
  return value === "th" ? "th" : "en";
}
