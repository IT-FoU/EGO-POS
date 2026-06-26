"use client";

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

  return (
    <LanguageToggle
      locale={locale}
      onLocaleChange={(nextLocale) => {
        router.replace(`${loginPath}?locale=${nextLocale}`);
        router.refresh();
      }}
    />
  );
}
