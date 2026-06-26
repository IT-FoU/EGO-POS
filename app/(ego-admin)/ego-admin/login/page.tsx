import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LogoContainer } from "@/components/brand/logo-container";
import { PortalLocaleSwitcher } from "@/components/auth/portal-locale-switcher";
import { PortalLoginForm } from "@/components/auth/portal-login-form";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { getSetupAdminSession } from "@/lib/setup-admin/session";
import { getSetupAdminMigrationStatus } from "@/lib/setup-admin/migration-status";

export const dynamic = "force-dynamic";

export default async function EgoAdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const session = await getSetupAdminSession();

  if (session) {
    redirect("/ego-admin");
  }

  const migrationStatus = await getSetupAdminMigrationStatus();
  const params = await searchParams;
  const cookieStore = await cookies();
  const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={96} />
          <h1 className="mt-5 text-3xl font-semibold">{dictionary.egoAdminPortal}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{dictionary.egoAdminLoginSubtitle}</p>
        </div>
        {!migrationStatus.ready ? (
          <p className="mb-6 rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            {dictionary.egoAdminMigrationRequired}
          </p>
        ) : null}
        <div className="mb-6 flex justify-center">
          <PortalLocaleSwitcher locale={locale} loginPath="/ego-admin/login" />
        </div>
        <PortalLoginForm
          dictionary={dictionary}
          identifierLabel={dictionary.usernameOrEmail}
          identifierName="identifier"
          identifierType="text"
          loginApiPath="/api/ego-admin/login"
          passwordLabel={dictionary.password}
          redirectTo="/ego-admin"
        />
      </section>
    </main>
  );
}
