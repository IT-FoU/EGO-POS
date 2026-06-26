"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/layout/language-toggle";
import type { SupportedLocale } from "@/lib/constants";

export function PortalLocaleSwitcher({
  locale,
  loginPath,
}: {
  locale: SupportedLocale;
  loginPath: string;
}) {
  const router = useRouter();

  const handleLocaleChange = useCallback(
    (nextLocale: SupportedLocale) => {
      if (nextLocale === locale) {
        return;
      }

      router.replace(`${loginPath}?locale=${nextLocale}`);
      router.refresh();
    },
    [locale, loginPath, router],
  );

  return <LanguageToggle locale={locale} onLocaleChange={handleLocaleChange} />;
}
