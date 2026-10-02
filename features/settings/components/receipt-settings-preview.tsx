"use client";

import { LogoContainer } from "@/components/brand/logo-container";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";

export function ReceiptSettingsPreview({
  businessLogoUrl,
  locale,
  settings,
}: {
  businessLogoUrl: string | null;
  locale: SupportedLocale;
  settings: SettingsFormData;
}) {
  const showLogo = settings.showLogoOnReceipt && Boolean(businessLogoUrl);
  const showTax = settings.vatEnabled && settings.showTaxOnReceipt;

  return (
    <div className="rounded-md border border-border bg-background p-4" data-receipt-preview>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{tSettings("receiptPreviewTitle", locale)}</h3>
        <span className="text-xs text-muted-foreground">{tSettings("receiptPreviewSample", locale)}</span>
      </div>
      <div className="mx-auto w-full max-w-[320px] rounded-md border border-dashed border-border bg-card p-4 font-mono text-xs leading-5 text-foreground">
        {showLogo ? (
          <div className="mb-3 flex justify-center">
            <LogoContainer fallbackName={settings.companyName} logoUrl={businessLogoUrl} size={56} variant="settings" />
          </div>
        ) : null}
        <div className="text-center text-sm font-semibold">{settings.companyName || "—"}</div>
        {settings.profileAddress ? <div className="mt-1 text-center text-muted-foreground">{settings.profileAddress}</div> : null}
        {settings.profilePhone ? <div className="text-center text-muted-foreground">{settings.profilePhone}</div> : null}
        {settings.profileEmail ? <div className="text-center text-muted-foreground">{settings.profileEmail}</div> : null}
        {settings.taxNumber ? <div className="text-center text-muted-foreground">{settings.taxNumber}</div> : null}
        {settings.receiptHeader ? <div className="mt-3 text-center">{settings.receiptHeader}</div> : null}
        <div className="my-3 border-t border-dashed border-border" />
        <div className="flex justify-between gap-3">
          <span>{tSettings("receiptPreviewBranch", locale)}</span>
          <span>—</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{tSettings("receiptPreviewCashier", locale)}</span>
          <span>—</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>{settings.receiptPrefix || "RCP"}-SAMPLE</span>
          <span>1 × item</span>
        </div>
        {showTax ? (
          <div className="mt-2 flex justify-between gap-3">
            <span>
              {tSettings("receiptPreviewTaxRow", locale)}
              {settings.vatEnabled ? ` ${settings.vatRate}%` : ""}
              {settings.taxInclusive ? ` (${tSettings("taxInclusive", locale)})` : ""}
            </span>
            <span>—</span>
          </div>
        ) : null}
        <div className="my-3 border-t border-dashed border-border" />
        {settings.receiptFooter ? <div className="text-center">{settings.receiptFooter}</div> : null}
      </div>
    </div>
  );
}
