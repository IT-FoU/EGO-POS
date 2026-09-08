"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import type { SupportedLocale } from "@/lib/constants";
import { persistClientLocale } from "@/lib/i18n/locale";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { runDemoStorageMigrations } from "@/lib/demo/storage";

export function LanguageToggle({
  locale,
  onLocaleChange,
}: {
  locale?: string;
  onLocaleChange?: (locale: SupportedLocale) => void;
}) {
  const currentLocale = useAppLocale(locale);

  useEffect(() => {
    runDemoStorageMigrations();
  }, [locale]);

  function updateLocale(nextLocale: SupportedLocale) {
    if (nextLocale === currentLocale) {
      return;
    }
    persistClientLocale(nextLocale);
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
