import en from "@/locales/ui/en.json";
import th from "@/locales/ui/th.json";

type Locale = "th" | "en";

const dictionaries = { en, th } as Record<Locale, Record<string, string>>;

export function t(key: string, locale?: Locale) {
  const activeLocale =
    locale ??
    (typeof document !== "undefined" && document.documentElement.dataset.locale === "en"
      ? "en"
      : typeof document !== "undefined" && document.documentElement.dataset.locale === "th"
        ? "th"
        : "en");

  return dictionaries[activeLocale]?.[key] ?? dictionaries.en[key] ?? key;
}
