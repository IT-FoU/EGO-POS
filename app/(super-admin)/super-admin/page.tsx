import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SuperAdminHomePage() {
  await requireSuperAdminPortalAccess();
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <section className="grid gap-6">
      <div>
        <p className="text-sm font-semibold text-primary">{dictionary.superAdminPortal}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">{dictionary.superAdminPortal}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{dictionary.superAdminLoginSubtitle}</p>
      </div>
      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        {dictionary.superAdminPlaceholder}
      </section>
    </section>
  );
}
