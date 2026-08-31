import { t } from "@/lib/i18n/ui";

export const NO_MEMBERSHIP_I18N_KEY = "ui.no.membership";

export function membershipLevelNameFromRelation(name: unknown): string | null {
  if (typeof name !== "string") {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function membershipDisplayLabel(level: string | null | undefined, locale?: "en" | "th"): string {
  return level && level.trim().length > 0 ? level : t(NO_MEMBERSHIP_I18N_KEY, locale);
}
