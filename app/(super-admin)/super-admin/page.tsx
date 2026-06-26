import { rejectMerchantSessionForAdminPortal } from "@/lib/auth/portal-guards";
import { requireAdminSession } from "@/lib/admin/session";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { cookies } from "next/headers";
import { SuperAdminLogoutButton } from "@/components/auth/super-admin-logout-button";

export const dynamic = "force-dynamic";

export default async function SuperAdminHomePage() {
  await rejectMerchantSessionForAdminPortal();
  const session = await requireAdminSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{dictionary.superAdminPortal}</p>
          <h1 className="mt-2 text-3xl font-semibold">{session.username}</h1>
        </div>
        <SuperAdminLogoutButton dictionary={dictionary} />
      </header>
      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {dictionary.superAdminPlaceholder}
      </section>
    </main>
  );
}
