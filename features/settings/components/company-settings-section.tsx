"use client";

import { Building2 } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { Field, SectionTitle } from "@/features/settings/components/settings-fields";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

export function CompanySettingsSection({
  locale,
  settings,
  update,
}: {
  locale: SupportedLocale;
  settings: SettingsFormData;
  update: SettingsFieldUpdate;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={Building2} title={tSettings("companyProfile", locale)} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label={tSettings("companyName", locale)}>
          <input className="field-input" required value={settings.companyName} onChange={(event) => update("companyName", event.target.value)} />
        </Field>
        <Field label={tSettings("taxNumber", locale)}>
          <input className="field-input" value={settings.taxNumber ?? ""} onChange={(event) => update("taxNumber", event.target.value)} />
        </Field>
        <Field label={tSettings("phone", locale)}>
          <input className="field-input" value={settings.profilePhone ?? ""} onChange={(event) => update("profilePhone", event.target.value)} />
        </Field>
        <Field label={tSettings("email", locale)}>
          <input className="field-input" type="email" value={settings.profileEmail ?? ""} onChange={(event) => update("profileEmail", event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <Field label={tSettings("address", locale)}>
            <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={settings.profileAddress ?? ""} onChange={(event) => update("profileAddress", event.target.value)} />
          </Field>
        </div>
      </div>
    </section>
  );
}
