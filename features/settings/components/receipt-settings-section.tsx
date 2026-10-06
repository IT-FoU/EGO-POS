"use client";

import Link from "next/link";
import { ReceiptText } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { receiptPrintModeLabel, tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";
import { ReceiptSettingsPreview } from "@/features/settings/components/receipt-settings-preview";
import { RECEIPT_PAPER_SIZE_OPTIONS, asPaperSize, type ReceiptPaperSize } from "@/features/settings/receipt-layout";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

export function ReceiptSettingsSection({
  branchName,
  businessLogoUrl,
  initialReceiptPreviewQrUrl,
  locale,
  settings,
  update,
  updatePrintMode,
}: {
  branchName: string | null;
  businessLogoUrl: string | null;
  initialReceiptPreviewQrUrl: string | null;
  locale: SupportedLocale;
  settings: SettingsFormData;
  update: SettingsFieldUpdate;
  updatePrintMode: (value: SettingsFormData["receiptPrintMode"]) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={ReceiptText} title={tSettings("receiptSettings", locale)} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{tSettings("scopeCompany", locale)}</span>
          <span className="text-sm text-muted-foreground">{tSettings("receiptContentShared", locale)}</span>
        </div>
        <fieldset className="md:col-span-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-semibold">{tSettings("receiptPaperSize", locale)}</legend>
          <p className="mb-3 text-xs text-muted-foreground">{tSettings("receiptPaperSizeHelp", locale)}</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tSettings("receiptPaperSize", locale)}>
            {RECEIPT_PAPER_SIZE_OPTIONS.map((size) => {
              const selected = asPaperSize(settings.receiptPaperSize) === size;
              const label =
                size === "58mm" ? tSettings("receiptPaperSize58", locale)
                : size === "80mm" ? tSettings("receiptPaperSize80", locale)
                : size === "a5" ? tSettings("receiptPaperSizeA5", locale)
                : size === "a4" ? tSettings("receiptPaperSizeA4", locale)
                : tSettings("receiptPaperSizeCustom", locale);
              return (
                <button
                  aria-checked={selected}
                  aria-pressed={selected}
                  className={selected
                    ? "settings-motion-tab h-11 min-w-[88px] rounded-md border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    : "settings-motion-tab h-11 min-w-[88px] rounded-md border border-border bg-background px-3 text-sm font-semibold hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}
                  key={size}
                  role="radio"
                  type="button"
                  onClick={() => update("receiptPaperSize", size as ReceiptPaperSize)}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {asPaperSize(settings.receiptPaperSize) === "custom" ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={`${tSettings("receiptCustomWidth", locale)} (${tSettings("receiptUnitMm", locale)})`}>
                <input aria-required="true" className="field-input" inputMode="decimal" min={40} step="0.1" type="number" value={settings.receiptCustomWidthMm} onChange={(event) => update("receiptCustomWidthMm", Number(event.target.value))} />
              </Field>
              <Field label={`${tSettings("receiptCustomHeight", locale)} (${tSettings("receiptUnitMm", locale)})`}>
                <input aria-required="true" className="field-input" inputMode="decimal" min={60} step="0.1" type="number" value={settings.receiptCustomHeightMm} onChange={(event) => update("receiptCustomHeightMm", Number(event.target.value))} />
              </Field>
              <p className="sm:col-span-2 text-xs text-muted-foreground">{tSettings("receiptCustomSizeHelp", locale)}</p>
            </div>
          ) : null}
        </fieldset>
        <Field label={tSettings("receiptPrefix", locale)}>
          <input className="field-input font-mono" required value={settings.receiptPrefix} onChange={(event) => update("receiptPrefix", event.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <div className="mb-2 text-sm font-semibold">{tSettings("receiptVisibility", locale)}</div>
          <p className="mb-3 text-xs text-muted-foreground">{tSettings("receiptVisibilityHelp", locale)}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Toggle label={tSettings("showLogoOnReceipt", locale)} checked={settings.showLogoOnReceipt} onChange={(value) => update("showLogoOnReceipt", value)} />
            <Toggle label={tSettings("showStoreNameOnReceipt", locale)} checked={settings.receiptShowCompanyName} onChange={(value) => update("receiptShowCompanyName", value)} />
            <Toggle label={tSettings("showBranchNameOnReceipt", locale)} checked={settings.receiptShowBranchName} onChange={(value) => update("receiptShowBranchName", value)} />
            <Toggle label={tSettings("showAddressOnReceipt", locale)} checked={settings.receiptShowAddress} onChange={(value) => update("receiptShowAddress", value)} />
            <Toggle label={tSettings("showPhoneOnReceipt", locale)} checked={settings.receiptShowPhone} onChange={(value) => update("receiptShowPhone", value)} />
            <Toggle label={tSettings("showEmailOnReceipt", locale)} checked={settings.receiptShowEmail} onChange={(value) => update("receiptShowEmail", value)} />
            <Toggle label={tSettings("showTaxNumberOnReceipt", locale)} checked={settings.receiptShowTaxNumber} onChange={(value) => update("receiptShowTaxNumber", value)} />
            <Toggle label={tSettings("showCashierOnReceipt", locale)} checked={settings.receiptShowCashier} onChange={(value) => update("receiptShowCashier", value)} />
            <Toggle label={tSettings("showReceiptNumberOnReceipt", locale)} checked={settings.receiptShowReceiptNumber} onChange={(value) => update("receiptShowReceiptNumber", value)} />
            <Toggle label={tSettings("showDateTimeOnReceipt", locale)} checked={settings.receiptShowDateTime} onChange={(value) => update("receiptShowDateTime", value)} />
            <Toggle label={tSettings("showHeaderOnReceipt", locale)} checked={settings.receiptShowHeader} onChange={(value) => update("receiptShowHeader", value)} />
            <Toggle label={tSettings("showFooterOnReceipt", locale)} checked={settings.receiptShowFooter} onChange={(value) => update("receiptShowFooter", value)} />
            <Toggle describedBy="receipt-show-qr-help" label={tSettings("showQrOnReceipt", locale)} checked={settings.receiptShowQr} onChange={(value) => update("receiptShowQr", value)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground" id="receipt-show-qr-help">{tSettings("showQrOnReceiptHelp", locale)}</p>
          {settings.receiptShowQr && !initialReceiptPreviewQrUrl ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">
              {tSettings("receiptQrNoneEligible", locale)}{" "}
              <Link className="font-semibold text-primary underline" href="/settings/qr-payments">{tSettings("goToQrPayments", locale)}</Link>
            </p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <Field label={tSettings("receiptHeader", locale)}>
            <input className="field-input" value={settings.receiptHeader ?? ""} onChange={(event) => update("receiptHeader", event.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label={tSettings("receiptFooter", locale)}>
            <input className="field-input" value={settings.receiptFooter ?? ""} onChange={(event) => update("receiptFooter", event.target.value)} />
          </Field>
        </div>
        <div className="md:col-span-2 mt-2 border-t border-border pt-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{tSettings("scopeThisDevice", locale)}</span>
            <span className="text-sm text-muted-foreground">{tSettings("printBehaviorThisBrowser", locale)}</span>
          </div>
          <Field label={tSettings("receiptPrintMode", locale)}>
            <select className="field-input" value={settings.receiptPrintMode} onChange={(event) => updatePrintMode(event.target.value as SettingsFormData["receiptPrintMode"])}>
              <option value="ask_every_time">{receiptPrintModeLabel("ask_every_time", locale)}</option>
              <option value="auto_print">{receiptPrintModeLabel("auto_print", locale)}</option>
              <option value="no_auto_print">{receiptPrintModeLabel("no_auto_print", locale)}</option>
            </select>
          </Field>
        </div>
        <div className="md:col-span-2">
          <ReceiptSettingsPreview
            branchName={branchName}
            businessLogoUrl={businessLogoUrl}
            locale={locale}
            previewQrImageUrl={initialReceiptPreviewQrUrl}
            settings={settings}
          />
        </div>
      </div>
    </section>
  );
}
