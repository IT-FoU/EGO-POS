import Link from "next/link";
import { EgoAdminLogoutButton } from "@/components/auth/ego-admin-logout-button";
import { StoreProvisionForm } from "@/components/ego-admin/store-provision-form";
import { requireEgoAdminPortalAccess } from "@/lib/auth/portal-guards";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function EgoAdminNewStorePage() {
  await requireEgoAdminPortalAccess();
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{dictionary.egoAdminPortal}</p>
          <h1 className="mt-2 text-3xl font-semibold">{dictionary.createStore}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link className="text-sm font-semibold text-primary underline" href="/ego-admin">
            {dictionary.backToEgoAdmin}
          </Link>
          <EgoAdminLogoutButton dictionary={dictionary} />
        </div>
      </header>
      <StoreProvisionForm dictionary={dictionary} />
    </main>
  );
}
