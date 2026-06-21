import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/session";
import { LoginForm } from "@/components/auth/login-form";
import { LogoContainer } from "@/components/brand/logo-container";
import { APP_NAME } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n/dictionaries";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string; password?: string; username?: string }>;
}) {
  const session = await getCurrentSession();

  if (session?.user) {
    redirect("/businesses");
  }

  const params = await searchParams;
  if (params?.password || params?.username) {
    redirect(params.locale ? `/login?locale=${params.locale}` : "/login");
  }

  const dictionary = getDictionary(params?.locale);
  const selectedLocale = params?.locale === "en" ? "en" : "lo";
  const languageLabels =
    selectedLocale === "en"
      ? { en: "English", lo: "Lao" }
      : { en: "ອັງກິດ", lo: "ລາວ" };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl md:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoContainer className="shadow-lg" size={112} />
          <h1 className="mt-5 text-4xl font-bold tracking-normal">{APP_NAME}</h1>
        </div>
        <div className="mb-6 flex justify-center gap-2">
          <Link
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-card-foreground transition hover:border-primary"
            href="/login?locale=lo"
          >
            {languageLabels.lo}
          </Link>
          <Link
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold text-card-foreground transition hover:border-primary"
            href="/login?locale=en"
          >
            {languageLabels.en}
          </Link>
        </div>
        <LoginForm dictionary={dictionary} />
      </section>
    </main>
  );
}
