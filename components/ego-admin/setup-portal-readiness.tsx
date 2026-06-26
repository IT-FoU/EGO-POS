type SetupPortalDictionary = {
  egoAdminComingSoonLabel: string;
  egoAdminLp4Notice: string;
  egoAdminPlaceholder: string;
  egoAdminSignedInAs: string;
  egoAdminActionCreateStore: string;
  egoAdminActionChooseTemplate: string;
  egoAdminActionCreateOwner: string;
  egoAdminActionInitialSettings: string;
};

const comingSoonActions: Array<{ labelKey: keyof SetupPortalDictionary }> = [
  { labelKey: "egoAdminActionCreateStore" },
  { labelKey: "egoAdminActionChooseTemplate" },
  { labelKey: "egoAdminActionCreateOwner" },
  { labelKey: "egoAdminActionInitialSettings" },
];

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
        <h3 className="text-base font-semibold">{dictionary.egoAdminComingSoonLabel}</h3>
        <ul className="mt-4 grid gap-3">
          {comingSoonActions.map((action) => (
            <li className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3" key={action.labelKey}>
              <span className="text-sm">{dictionary[action.labelKey]}</span>
              <button
                className="rounded-md border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
                disabled
                type="button"
              >
                LP-4
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
