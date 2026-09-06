import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { SuperAdminLoginCard } from "@/components/auth/super-admin-login-card";
import { getAdminSession } from "@/lib/admin/session";
import { normalizeAdminLocale } from "@/lib/i18n/admin-locale";

export const dynamic = "force-dynamic";

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string | string[] }> | { locale?: string | string[] };
}) {
  const session = await getAdminSession();

  if (session) {
    redirect("/super-admin");
  }

  const params = await Promise.resolve(searchParams);
  const queryLocale = Array.isArray(params?.locale) ? params?.locale[0] : params?.locale;
  const locale = normalizeAdminLocale(queryLocale);

  return (
    <main
      className="ego-center-theme relative flex min-h-screen overflow-hidden bg-[#020617] px-4 py-8 text-[#F8FAFC] sm:px-6"
      style={
        {
          "--center-bg-deep": "#020617",
          "--center-bg-main": "#0F172A",
          "--center-border": "#334155",
          "--center-card-bg": "#111827",
          "--center-panel-bg": "#1E293B",
          "--center-primary": "#5EEAD4",
          "--center-primary-active": "#14B8A6",
          "--center-primary-hover": "#2DD4BF",
          "--center-text-muted": "#94A3B8",
          "--center-text-primary": "#F8FAFC",
          "--center-text-secondary": "#CBD5E1",
        } as CSSProperties
      }
    >
      <SuperAdminLoginCard initialLocale={locale} />
    </main>
  );
}
