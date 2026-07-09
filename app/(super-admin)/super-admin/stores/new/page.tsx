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
    <section className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-[#334155] bg-[#111827] p-6">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-[#5EEAD4]">EGO POS Center</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#F8FAFC]">Create Store</h1>
          <p className="mt-2 text-sm leading-6 text-[#CBD5E1]">
            Create a customer business, first store, owner account, Mini Mart template, and Free plan assignment.
          </p>
        </div>
        <Link
          className="rounded-md border border-[#334155] px-4 py-2 text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#5EEAD4]"
          href="/super-admin/stores"
        >
          Back to Stores
        </Link>
      </header>

      <StoreProvisionForm
        backHref="/super-admin/stores"
        backLabel="Back to Stores"
        dictionary={dictionary}
        provisionApiPath="/api/super-admin/stores"
        variant="superAdmin"
      />
    </section>
  );
}
