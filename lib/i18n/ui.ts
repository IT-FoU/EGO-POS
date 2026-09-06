import en from "@/locales/ui/en.json";
import lo from "@/locales/ui/lo.json";
import { normalizeLocale } from "@/lib/i18n/locale";

type MiniMartUiLocale = "en" | "lo";

const dictionaries = { en, lo } as Record<MiniMartUiLocale, Record<string, string>>;

function resolveUiLocale(locale?: string): MiniMartUiLocale {
  if (locale) {
    return normalizeLocale(locale);
  }

  if (typeof document !== "undefined") {
    return normalizeLocale(document.documentElement.dataset.locale);
  }

  return "en";
}

export function t(key: string, locale?: string) {
  const activeLocale = resolveUiLocale(locale);
  // Phase 01: only Dashboard uses Lao copy. Other Mini Mart modules stay English
  // so POS / Settings / Reports are not translated accidentally via t().
  if (activeLocale === "lo") {
    return dictionaries.en[key] ?? dictionaries.lo[key] ?? key;
  }

  return dictionaries.en[key] ?? key;
}
