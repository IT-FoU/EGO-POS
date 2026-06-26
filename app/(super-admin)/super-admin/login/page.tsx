import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LogoContainer } from "@/components/brand/logo-container";
import { PortalLocaleSwitcher } from "@/components/auth/portal-locale-switcher";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { getAdminSession } from "@/lib/admin/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function SuperAdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const session = await getAdminSession();

  if (session) {
    redirect("/super-admin");
  }

  const params = await searchParams;
  const cookieStore = await cookies();
  const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={96} />
          <h1 className="mt-5 text-3xl font-semibold">{dictionary.superAdminPortal}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{dictionary.superAdminLoginSubtitle}</p>
        </div>
        <div className="mb-6 flex justify-center">
          <PortalLocaleSwitcher locale={locale} loginPath="/super-admin/login" />
        </div>
        <PortalLoginForm
          dictionary={dictionary}
          identifierAutoComplete="email"
          identifierLabel={dictionary.email}
          identifierName="email"
          identifierType="email"
          loginApiPath="/api/super-admin/login"
          passwordLabel={dictionary.password}
          redirectTo="/super-admin"
        />
      </section>
    </main>
  );
}
