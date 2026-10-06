"use client";

import { Gift } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { LoyaltyEarningRuleRecord } from "@/features/loyalty/earning-rules";
import type { SettingsFormData } from "@/features/settings/types";
import { Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";
import { LoyaltyRulesPanel, type LoyaltyCatalogItem } from "@/features/settings/components/loyalty-rules-panel";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

export function LoyaltySettingsSection({
  categories,
  locale,
  products,
  rules,
  settings,
  update,
}: {
  categories: LoyaltyCatalogItem[];
  locale: SupportedLocale;
  products: LoyaltyCatalogItem[];
  rules: LoyaltyEarningRuleRecord[];
  settings: SettingsFormData;
  update: SettingsFieldUpdate;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={Gift} title={tSettings("loyaltyRules", locale)} />
      <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm" data-loyalty-summary>
        {settings.loyaltyEnabled ? tSettings("loyaltyStatusOn", locale) : tSettings("loyaltyStatusOff", locale)}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{tSettings("loyaltyHelp", locale)}</p>
      <div className="mt-5">
        <Toggle label={tSettings("enableLoyalty", locale)} checked={settings.loyaltyEnabled} onChange={(value) => update("loyaltyEnabled", value)} />
      </div>
      <LoyaltyRulesPanel categories={categories} initialRules={rules} locale={locale} products={products} />
      <div className="mt-6 rounded-lg border border-border bg-background p-4" data-loyalty-policy>
        <h3 className="text-sm font-semibold">{tSettings("redemptionRules", locale)}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Field label={tSettings("pointValueLak", locale)}>
            <input className="field-input" min="0" type="number" value={settings.loyaltyPointValueLak} onChange={(event) => update("loyaltyPointValueLak", Number(event.target.value))} />
          </Field>
          <Field label={tSettings("minRedeemPoints", locale)}>
            <input className="field-input" min="1" type="number" value={settings.loyaltyMinRedeemPoints} onChange={(event) => update("loyaltyMinRedeemPoints", Number(event.target.value))} />
          </Field>
          <Field label={tSettings("maximumRedeemPoints", locale)}>
            <input className="field-input" min="0" type="number" value={settings.loyaltyMaxRedeemPoints} onChange={(event) => update("loyaltyMaxRedeemPoints", Number(event.target.value))} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{tSettings("maximumRedeemHelp", locale)}</p>
        <div className="mt-4 grid gap-3">
          <Toggle label={tSettings("allowPartialRedemption", locale)} checked={settings.loyaltyAllowPartial} onChange={(value) => update("loyaltyAllowPartial", value)} />
          <Toggle label={tSettings("allowRedeemWithDiscount", locale)} checked={settings.loyaltyAllowRedeemWithDiscount} onChange={(value) => update("loyaltyAllowRedeemWithDiscount", value)} />
        </div>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold">{tSettings("pointPolicy", locale)}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-[auto_160px_160px] md:items-end">
          <Toggle label={tSettings("pointsExpire", locale)} checked={settings.loyaltyExpiryEnabled} onChange={(value) => update("loyaltyExpiryEnabled", value)} />
          <Field label={tSettings("expiryAmount", locale)}>
            <input className="field-input" disabled={!settings.loyaltyExpiryEnabled} min="1" type="number" value={settings.loyaltyExpiryDays} onChange={(event) => update("loyaltyExpiryDays", Number(event.target.value))} />
          </Field>
          <Field label={tSettings("expiryUnit", locale)}>
            <select className="field-input" disabled={!settings.loyaltyExpiryEnabled} value={settings.loyaltyExpiryUnit} onChange={(event) => update("loyaltyExpiryUnit", event.target.value === "months" ? "months" : "days")}>
              <option value="days">{tSettings("expiryDays", locale)}</option>
              <option value="months">{tSettings("expiryMonths", locale)}</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{tSettings("loyaltyCalcHelp", locale)}</p>
      </div>
    </section>
  );
}
