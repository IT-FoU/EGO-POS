import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/demo-mode";
import { cookies } from "next/headers";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveStorePostLoginRedirectForUser } from "@/lib/auth/store-membership";
import { LoginForm } from "@/components/auth/login-form";
import { LoginLocaleSwitcher } from "@/components/auth/login-locale-switcher";
import { APP_NAME } from "@/lib/constants";
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
  const dictionary = {
    authNotReady: "Authentication is not ready. Check the database and environment settings.",
    databaseUnavailable: "Database is not available.",
    hidePassword: "Hide password",
    invalidCredentials: "Email, username, or password is incorrect.",
    password: "Password",
    registerNewAccount: "",
    showPassword: "Show password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    username: "Email / Username",
  };

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#020617] px-4 py-8 text-[#F8FAFC] sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(94,234,212,0.12),transparent_32rem)]" />
      <section className="relative z-10 m-auto w-full max-w-[500px]">
        <div className="rounded-[2rem] border border-[#334155] bg-[#111827] p-6 shadow-xl sm:p-8">
          <div className="mb-7 flex flex-col items-center text-center">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl border border-[#5EEAD4] bg-[#1E293B] text-xl font-black text-[#5EEAD4]">
                E
              </div>
              <div className="text-left">
                <div className="text-sm font-black tracking-[0.22em] text-[#F8FAFC]">{APP_NAME}</div>
                <div className="text-xs text-[#94A3B8]">Store access</div>
              </div>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#F8FAFC] sm:text-[2rem]">{APP_NAME}</h1>
            <p className="mt-2 text-sm text-[#94A3B8]">Store access</p>
          </div>

          <div className="mb-6 flex justify-center">
            <div className="rounded-full border border-[#334155] bg-[#1E293B] p-1 text-[#CBD5E1]">
              <LoginLocaleSwitcher locale={locale} />
            </div>
          </div>

          <LoginForm
            demoMode={isDemoMode()}
            dictionary={dictionary}
            locale={locale}
            showRegisterLink={false}
            variant="premiumDark"
          />
        </div>
      </section>
    </main>
  );
}
