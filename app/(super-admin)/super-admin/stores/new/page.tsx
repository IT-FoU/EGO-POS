import Link from "next/link";
import { StoreProvisionForm } from "@/components/ego-admin/store-provision-form";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function SuperAdminNewStorePage() {
  await requireSuperAdminPortalAccess();
  const cookieStore = await cookies();
  const locale = getServerLocale(undefined, cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const dictionary = getDictionary(locale);

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">{dictionary.superAdminPortal}</p>
          <h1 className="mt-2 text-3xl font-semibold">{dictionary.createStore}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{dictionary.superAdminStoreProvisionNotice}</p>
        </div>
        <Link className="text-sm font-semibold text-primary underline" href="/super-admin">
          {dictionary.backToSuperAdmin}
        </Link>
      </header>
      <StoreProvisionForm
        backHref="/super-admin"
        backLabel={dictionary.backToSuperAdmin}
        dictionary={dictionary}
        provisionApiPath="/api/super-admin/stores"
      />
    </section>
  );
}
