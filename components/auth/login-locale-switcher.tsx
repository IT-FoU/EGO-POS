"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/layout/language-toggle";
import type { SupportedLocale } from "@/lib/constants";

export function LoginLocaleSwitcher({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();

  const handleLocaleChange = useCallback(
    (nextLocale: SupportedLocale) => {
      if (nextLocale === locale) {
        return;
      }

      router.replace(`/login?locale=${nextLocale}`);
      router.refresh();
    },
    [locale, router],
  );

  return <LanguageToggle locale={locale} onLocaleChange={handleLocaleChange} />;
}
