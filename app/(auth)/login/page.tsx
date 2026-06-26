import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveStorePostLoginRedirectForUser } from "@/lib/auth/store-membership";
import { LoginForm } from "@/components/auth/login-form";
import { LoginLocaleSwitcher } from "@/components/auth/login-locale-switcher";
import { LogoContainer } from "@/components/brand/logo-container";
import { APP_NAME } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string; password?: string; username?: string }>;
}) {
  const session = await getCurrentSession();

  if (session?.user?.id) {
    const resolved = await resolveStorePostLoginRedirectForUser(
      session.user.id,
      session.user.activeCompanyId,
    );
    redirect(resolved.redirectTo);
  }

  const params = await searchParams;
  if (params?.password || params?.username) {
    const cookieStore = await cookies();
    const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
    redirect(`/login?locale=${locale}`);
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={112} />
          <h1 className="mt-5 text-4xl font-bold tracking-normal">{APP_NAME}</h1>
          <p className="mt-2 text-sm font-semibold text-primary">{dictionary.storeLoginPortal}</p>
          <p className="mt-1 text-sm text-muted-foreground">{dictionary.loginTitle}</p>
        </div>
        <div className="mb-6 flex justify-center">
          <LoginLocaleSwitcher locale={locale} />
        </div>
        <LoginForm demoMode={process.env.IGO_DEMO_MODE === "true"} dictionary={dictionary} locale={locale} />
      </section>
    </main>
  );
}
