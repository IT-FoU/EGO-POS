"use client";

import { useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/layout/language-toggle";
import type { SupportedLocale } from "@/lib/constants";

export function LoginLocaleSwitcher({ locale }: { locale: SupportedLocale }) {
  const router = useRouter();

  return (
    <LanguageToggle
      locale={locale}
      onLocaleChange={(nextLocale) => {
        router.replace(`/login?locale=${nextLocale}`);
        router.refresh();
      }}
    />
  );
}
