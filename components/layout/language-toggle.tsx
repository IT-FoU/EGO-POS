"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, runDemoStorageMigrations, writeStringToStorage } from "@/lib/demo/storage";

const LANGUAGE_KEY = DemoStorageKeys.locale;

export function LanguageToggle({
  locale,
  onLocaleChange,
}: {
  locale?: string;
  onLocaleChange?: (locale: "lo" | "en") => void;
}) {
  const [currentLocale, setCurrentLocale] = useState<"lo" | "en">(locale === "en" ? "en" : "lo");

  useEffect(() => {
    runDemoStorageMigrations();
    const stored = readStringFromStorage(LANGUAGE_KEY);
    const nextLocale = stored === "en" || stored === "lo" ? stored : locale === "en" ? "en" : "lo";
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    setCurrentLocale(nextLocale);
    onLocaleChange?.(nextLocale);
  }, [locale, onLocaleChange]);

  function updateLocale(nextLocale: "lo" | "en") {
    writeStringToStorage(LANGUAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    window.dispatchEvent(new CustomEvent("ego-pos:locale-change", { detail: { locale: nextLocale } }));
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
        LAO
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        className={cn("px-1.5 transition", currentLocale === "en" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("en")}
      >
        ENG
      </button>
    </div>
  );
}
