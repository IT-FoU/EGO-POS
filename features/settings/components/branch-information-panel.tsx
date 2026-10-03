"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Save } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import { updateActiveBranchInformationAction } from "@/features/settings/actions";
import type { ActiveBranchInformation } from "@/features/settings/branch-information";
import { Field, SectionTitle } from "@/features/settings/components/settings-fields";

export function BranchInformationPanel({
  initialBranch,
  locale: localeProp,
}: {
  initialBranch: ActiveBranchInformation;
  locale: SupportedLocale;
}) {
  const locale = localeProp;
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialBranch.name);
  const [phone, setPhone] = useState(initialBranch.phone);
  const [address, setAddress] = useState(initialBranch.address);
  const [baseline, setBaseline] = useState(initialBranch);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  useEffect(() => {
    setName(initialBranch.name);
    setPhone(initialBranch.phone);
    setAddress(initialBranch.address);
    setBaseline(initialBranch);
  }, [initialBranch]);

  const dirty =
    name.trim() !== baseline.name.trim() ||
    phone.trim() !== baseline.phone.trim() ||
    address.trim() !== baseline.address.trim();

  function save() {
    if (isPending) return;
    const nextName = name.trim();
    if (!nextName) {
      setMessage({ text: tSettings("branchNameRequired", locale), tone: "error" });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await updateActiveBranchInformationAction({
        address,
        name: nextName,
        phone,
      });
      if (!result.ok || !result.data) {
        setMessage({ text: result.error || tSettings("saveFailed", locale), tone: "error" });
        return;
      }
      setBaseline(result.data);
      setName(result.data.name);
      setPhone(result.data.phone);
      setAddress(result.data.address);
      setMessage({ text: tSettings("branchSaved", locale), tone: "success" });
    });
  }

  return (
    <div className="grid gap-5">
      {message ? (
        <div
          className={
            message.tone === "success"
              ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
          role="status"
        >
          {message.text}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Building2} title={tSettings("branchInformation", locale)} />
        <p className="mt-2 text-sm text-muted-foreground">{tSettings("branchInformationHelp", locale)}</p>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label={tSettings("branchName", locale)}>
            <input
              aria-required="true"
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={tSettings("branchPhone", locale)}>
            <input
              className="field-input"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label={tSettings("branchAddress", locale)}>
              <textarea
                className="field-input min-h-24 resize-y"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
          </div>
          <div className="md:col-span-2 rounded-md border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{tSettings("mainBranchStatus", locale)}: </span>
            {baseline.isMainBranch
              ? tSettings("mainBranchYes", locale)
              : tSettings("mainBranchNo", locale)}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            className="settings-motion-save inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            disabled={isPending || !dirty}
            type="button"
            onClick={save}
          >
            <Save aria-hidden="true" className="size-4" />
            {isPending ? tSettings("saving", locale) : tSettings("saveSettings", locale)}
          </button>
        </div>
      </section>
    </div>
  );
}
