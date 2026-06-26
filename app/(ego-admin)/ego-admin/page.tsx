import { cookies } from "next/headers";
import { EgoAdminLogoutButton } from "@/components/auth/ego-admin-logout-button";
import { SetupPortalReadiness } from "@/components/ego-admin/setup-portal-readiness";
import { requireEgoAdminPortalAccess } from "@/lib/auth/portal-guards";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function EgoAdminHomePage() {
  const session = await requireEgoAdminPortalAccess();
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{dictionary.egoAdminPortal}</p>
          <h1 className="mt-2 text-3xl font-semibold">{dictionary.egoAdminPortal}</h1>
        </div>
        <EgoAdminLogoutButton dictionary={dictionary} />
      </header>
      <SetupPortalReadiness dictionary={dictionary} email={session.email} username={session.username} />
    </main>
  );
}
