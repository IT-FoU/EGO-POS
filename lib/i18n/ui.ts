import en from "@/locales/ui/en.json";
import lo from "@/locales/ui/lo.json";

type Locale = "lo" | "en";

const dictionaries = { en, lo } as Record<Locale, Record<string, string>>;

export function t(key: string, locale?: Locale) {
  const activeLocale =
    locale ??
    (typeof document !== "undefined" && document.documentElement.dataset.locale === "en"
      ? "en"
      : typeof document !== "undefined" && document.documentElement.dataset.locale === "lo"
        ? "lo"
        : "en");

  return dictionaries[activeLocale]?.[key] ?? dictionaries.en[key] ?? key;
}
