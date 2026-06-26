import Link from "next/link";

type SetupPortalDictionary = {
  createStore: string;
  egoAdminActionChooseTemplate: string;
  egoAdminActionCreateOwner: string;
  egoAdminActionCreateStore: string;
  egoAdminActionInitialSettings: string;
  egoAdminLp4Notice: string;
  egoAdminPlaceholder: string;
  egoAdminProvisioningActions: string;
  egoAdminSignedInAs: string;
};

export function SetupPortalReadiness({
  dictionary,
  email,
  username,
}: {
  dictionary: SetupPortalDictionary;
  email: string;
  username: string;
}) {
  return (
    <div className="grid gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">{dictionary.egoAdminSignedInAs}</p>
        <h2 className="mt-1 text-2xl font-semibold">{username}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{email}</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <p>{dictionary.egoAdminPlaceholder}</p>
        <p className="mt-3">{dictionary.egoAdminLp4Notice}</p>
      </section>

      <section className="rounded-lg border border-border bg-card p-6">
        <h3 className="text-base font-semibold">{dictionary.egoAdminProvisioningActions}</h3>
        <ul className="mt-4 grid gap-3">
          <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
            <span className="text-sm">{dictionary.egoAdminActionCreateStore}</span>
            <Link
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              href="/ego-admin/stores/new"
            >
              {dictionary.createStore}
            </Link>
          </li>
          <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 text-muted-foreground">
            <span className="text-sm">{dictionary.egoAdminActionChooseTemplate}</span>
            <span className="text-xs font-semibold">LP-5</span>
          </li>
          <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 text-muted-foreground">
            <span className="text-sm">{dictionary.egoAdminActionCreateOwner}</span>
            <span className="text-xs font-semibold">LP-5</span>
          </li>
          <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 text-muted-foreground">
            <span className="text-sm">{dictionary.egoAdminActionInitialSettings}</span>
            <span className="text-xs font-semibold">LP-5</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
