"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, persistClientLocale, readClientLocale } from "@/lib/i18n/locale";
import { runDemoStorageMigrations } from "@/lib/demo/storage";

export function LanguageToggle({
  locale,
  onLocaleChange,
}: {
  locale?: string;
  onLocaleChange?: (locale: SupportedLocale) => void;
}) {
  const [currentLocale, setCurrentLocale] = useState<SupportedLocale>(
    isSupportedLocale(locale) ? locale : DEFAULT_LOCALE,
  );

  useEffect(() => {
    runDemoStorageMigrations();
    const nextLocale = readClientLocale(locale);
    setCurrentLocale(nextLocale);
  }, [locale]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
      if (isSupportedLocale(detail?.locale)) {
        setCurrentLocale(detail.locale);
      }
    }

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  function updateLocale(nextLocale: SupportedLocale) {
    if (nextLocale === currentLocale) {
      return;
    }
    persistClientLocale(nextLocale);
    setCurrentLocale(nextLocale);
    onLocaleChange?.(nextLocale);
  }

  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-md border border-border px-2 text-xs font-semibold">
      <button
        className={cn("px-1.5 transition", currentLocale === "lo" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("lo")}
      >
        LO
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        className={cn("px-1.5 transition", currentLocale === "en" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
