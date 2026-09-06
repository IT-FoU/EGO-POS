import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { LogoContainer } from "@/components/brand/logo-container";
import { isDemoMode } from "@/lib/demo-mode";
import { APP_NAME } from "@/lib/constants";
import { getCurrentSession } from "@/lib/auth/session";
import { resolveStorePostLoginRedirectForUser } from "@/lib/auth/store-membership";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

const tabClass =
  "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-bold transition";

export default async function AuthAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string; tab?: string }>;
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
  const cookieStore = await cookies();
  const locale = getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = {
    ...getDictionary(locale),
    registerNewAccount: "Create Business",
  };
  const activeTab = params?.tab === "create" ? "create" : "login";

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#020617] px-4 py-8 text-[#F8FAFC] sm:px-6">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl content-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,480px)]">
        <div className="min-w-0 rounded-2xl border border-[#334155] bg-[#111827] p-6 shadow-xl sm:p-8">
          <LogoContainer className="mb-6 shadow-lg" size={88} />
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#5EEAD4]">Store Access</p>
          <h1 className="mt-3 text-4xl font-black tracking-normal text-[#F8FAFC] md:text-5xl">{APP_NAME}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#CBD5E1]">
            Store owners, managers, and cashiers sign in here. New business creation is prepared as a guided setup,
            but backend provisioning stays disabled until the real creation workflow is connected.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Owner", "Manager", "Cashier"].map((role) => (
              <div className="rounded-xl border border-[#334155] bg-[#1E293B] p-4" key={role}>
                <div className="text-sm font-bold text-[#F8FAFC]">{role}</div>
                <div className="mt-1 text-xs leading-5 text-[#94A3B8]">Uses the existing store authentication flow.</div>
              </div>
            ))}
          </div>
        </div>

        <section className="min-w-0 rounded-2xl border border-[#334155] bg-[#111827] p-5 shadow-xl sm:p-6">
          <div className="mb-6 grid grid-cols-2 rounded-2xl border border-[#334155] bg-[#020617] p-1">
            <Link
              className={`${tabClass} ${activeTab === "login" ? "bg-[#5EEAD4] text-[#020617]" : "text-[#CBD5E1] hover:text-[#F8FAFC]"}`}
              href={`/auth?tab=login&locale=${locale}`}
            >
              {"Login"}
            </Link>
            <Link
              className={`${tabClass} ${activeTab === "create" ? "bg-[#5EEAD4] text-[#020617]" : "text-[#CBD5E1] hover:text-[#F8FAFC]"}`}
              href={`/auth?tab=create&locale=${locale}`}
            >
              {"Create Business"}
            </Link>
          </div>

          {activeTab === "login" ? (
            <div className="grid gap-5">
              <div>
                <h2 className="text-2xl font-black text-[#F8FAFC]">{"Store Login"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                  Use an existing store account. Owner and manager go to Back Office; cashier goes to POS when the existing auth rules resolve it.
                </p>
              </div>
              <LoginForm demoMode={isDemoMode()} dictionary={dictionary} locale={locale} registerHref={`/auth?tab=create&locale=${locale}`} />
            </div>
          ) : (
            <div className="grid gap-5">
              <div>
                <h2 className="text-2xl font-black text-[#F8FAFC]">{"Create Business"}</h2>
                <p className="mt-2 text-sm leading-6 text-[#94A3B8]">
                  Choose a template, enter business details, and select a plan in the setup wizard. Real business creation is not connected yet.
                </p>
              </div>
              <div className="rounded-2xl border border-[#334155] bg-[#020617] p-4">
                <div className="text-sm font-bold text-[#F8FAFC]">{"Connection status"}</div>
                <p className="mt-2 text-sm text-[#94A3B8]">
                  {"Business creation backend is not connected yet."}
                </p>
              </div>
              <button
                className="h-12 cursor-not-allowed rounded-2xl border border-[#334155] bg-[#1E293B] px-5 text-sm font-black text-[#64748B]"
                disabled
                type="button"
              >
                {"Not connected yet"}
              </button>
              <Link
                className="flex h-12 items-center justify-center rounded-2xl border border-[#5EEAD4] px-5 text-sm font-black text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10"
                href={`/onboarding?locale=${locale}`}
              >
                {"Open setup wizard"}
              </Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
