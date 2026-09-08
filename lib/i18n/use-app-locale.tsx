"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SupportedLocale } from "@/lib/constants";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, normalizeLocale, readClientLocale } from "@/lib/i18n/locale";

const AppLocaleContext = createContext<SupportedLocale | null>(null);

export function AppLocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: string | null;
}) {
  const [locale, setLocale] = useState<SupportedLocale>(normalizeLocale(initialLocale));

  useEffect(() => {
    setLocale(readClientLocale(initialLocale));
  }, [initialLocale]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
      if (isSupportedLocale(detail?.locale)) {
        setLocale(detail.locale);
      }
    }

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  return <AppLocaleContext.Provider value={locale}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale(localeProp?: SupportedLocale | string | null): SupportedLocale {
  const locale = useContext(AppLocaleContext);
  if (locale) return locale;
  return normalizeLocale(localeProp) || DEFAULT_LOCALE;
}
