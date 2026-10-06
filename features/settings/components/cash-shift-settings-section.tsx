"use client";

import { Banknote } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { SectionTitle, Toggle } from "@/features/settings/components/settings-fields";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

export function CashShiftSettingsSection({
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
      <SectionTitle icon={Banknote} title={tSettings("requireCashShiftBeforeSale", locale)} />
      <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium" data-cash-shift-summary>
        {settings.requireCashShiftBeforeSale !== false
          ? (locale === "lo" ? "ບັງຄັບ" : "Required")
          : (locale === "lo" ? "ບໍ່ບັງຄັບ" : "Not required")}
      </div>
      <div className="mt-5 grid gap-4">
        <Toggle
          label={tSettings("requireCashShiftBeforeSale", locale)}
          checked={settings.requireCashShiftBeforeSale !== false}
          onChange={(value) => update("requireCashShiftBeforeSale", value)}
        />
        <p className="text-sm text-muted-foreground">{tSettings("cashShiftOnHelp", locale)}</p>
        <p className="text-sm text-muted-foreground">{tSettings("cashShiftOffHelp", locale)}</p>
        <p className="text-sm text-muted-foreground">{tSettings("requireCashShiftBeforeSaleHelp", locale)}</p>
      </div>
    </section>
  );
}
