import Link from "next/link";
import { cookies } from "next/headers";
import { LogoContainer } from "@/components/brand/logo-container";
import { APP_NAME } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={96} />
          <h1 className="mt-5 text-3xl font-bold tracking-normal">{APP_NAME}</h1>
        </div>
        <div className="grid gap-5 text-center">
          <h2 className="text-xl font-semibold">{dictionary.registerClosedTitle}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{dictionary.registerClosedDescription}</p>
          <p className="text-xs leading-5 text-muted-foreground">{dictionary.registerClosedUat5Note}</p>
          <Link
            className="flex h-12 items-center justify-center rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground transition hover:opacity-90"
            href="/login"
          >
            {dictionary.registerClosedBackToLogin}
          </Link>
        </div>
      </section>
    </main>
  );
}
