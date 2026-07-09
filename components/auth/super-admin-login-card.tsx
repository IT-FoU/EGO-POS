"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import type { SupportedLocale } from "@/lib/constants";
import { getSuperAdminLoginCopy } from "@/lib/i18n/super-admin-login-copy";
import { readClientLocale } from "@/lib/i18n/locale";

export function SuperAdminLoginCard({ initialLocale }: { initialLocale: SupportedLocale }) {
  const router = useRouter();
  const [locale, setLocale] = useState<SupportedLocale>(initialLocale);
  const copy = useMemo(() => getSuperAdminLoginCopy(locale), [locale]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryLocale = searchParams.get("locale");
    if (queryLocale === "th" || queryLocale === "en") {
      setLocale(queryLocale);
      return;
    }
    setLocale(readClientLocale());
  }, []);

  function handleLocaleChange(nextLocale: SupportedLocale) {
    setLocale(nextLocale);
    router.replace(`/super-admin/login?locale=${nextLocale}`);
    router.refresh();
  }

  return (
    <section className="relative z-10 m-auto w-full max-w-[500px]">
      <div className="rounded-[2rem] border border-[#334155] bg-[#111827] p-6 shadow-xl sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl border border-[#5EEAD4] bg-[#1E293B] text-xl font-black text-[#5EEAD4]">
              E
            </div>
            <div className="text-left">
              <div className="text-sm font-black tracking-[0.22em] text-[#F8FAFC]">EGO POS</div>
              <div className="text-xs text-[#94A3B8]">{copy.brandKicker}</div>
            </div>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#F8FAFC] sm:text-[2rem]">{copy.title}</h1>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="rounded-full border border-[#334155] bg-[#1E293B] p-1 text-[#CBD5E1]">
            <LanguageToggle locale={locale} onLocaleChange={handleLocaleChange} />
          </div>
        </div>

        <PortalLoginForm
          dictionary={copy}
          identifierAutoComplete="email"
          identifierLabel={copy.email}
          identifierName="email"
          identifierType="email"
          loginApiPath="/api/super-admin/login"
          passwordLabel={copy.password}
          redirectTo="/super-admin"
          variant="premiumDark"
        />
      </div>
    </section>
  );
}
