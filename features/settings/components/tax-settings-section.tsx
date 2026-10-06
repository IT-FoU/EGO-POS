"use client";

import { Percent } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

export function TaxSettingsSection({
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
      <SectionTitle icon={Percent} title={tSettings("taxVatSettings", locale)} />
      <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm" data-tax-summary>
        {settings.vatEnabled
          ? (locale === "lo"
            ? `ເປີດ • ${settings.vatRate}% • ${settings.taxInclusive ? "ລວມພາສີ" : "ແຍກພາສີ"}`
            : `On • ${settings.vatRate}% • ${settings.taxInclusive ? "Inclusive" : "Exclusive"}`)
          : (locale === "lo" ? "ປິດ" : "Off")}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Toggle label={tSettings("enableVat", locale)} checked={settings.vatEnabled} onChange={(value) => update("vatEnabled", value)} />
        <Toggle label={tSettings("taxInclusive", locale)} checked={settings.taxInclusive} onChange={(value) => update("taxInclusive", value)} />
        <Toggle label={tSettings("showTaxOnReceipt", locale)} checked={settings.showTaxOnReceipt} onChange={(value) => update("showTaxOnReceipt", value)} />
        <Field label={tSettings("vatRate", locale)}>
          <input className="field-input" max="100" min="0" step="0.01" type="number" value={settings.vatRate} onChange={(event) => update("vatRate", Number(event.target.value))} />
        </Field>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
        <p>{tSettings("taxHelpInclusive", locale)}</p>
        <p>{tSettings("taxHelpExclusive", locale)}</p>
      </div>
    </section>
  );
}
