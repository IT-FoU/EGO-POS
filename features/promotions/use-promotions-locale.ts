"use client";

import { useEffect, useState } from "react";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";

export function usePromotionsLocale(localeProp?: SupportedLocale): SupportedLocale {
  const [locale, setLocale] = useState<SupportedLocale>(localeProp ?? "en");

  useEffect(() => {
    setLocale(readClientLocale(localeProp));
  }, [localeProp]);

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

  return locale;
}
