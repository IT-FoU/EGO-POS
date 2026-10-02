"use client";

import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { receiptBusinessLogoSrc } from "@/features/pos/receipt-branding";
import { RECEIPT_PAPER_WIDTH_PX, type ReceiptPaperSize } from "@/features/settings/receipt-layout";

function formatSampleLak(value: number) {
  return value.toLocaleString("en-US");
}

export function ReceiptSettingsPreview({
  branchName,
  businessLogoUrl,
  locale,
  previewQrImageUrl = null,
  settings,
}: {
  branchName?: string | null;
  businessLogoUrl: string | null;
  locale: SupportedLocale;
  previewQrImageUrl?: string | null;
  settings: SettingsFormData;
}) {
  const paperSize: ReceiptPaperSize = settings.receiptPaperSize === "58mm" ? "58mm" : "80mm";
  const paperWidth = RECEIPT_PAPER_WIDTH_PX[paperSize];
  const logoSrc = receiptBusinessLogoSrc(settings.showLogoOnReceipt, businessLogoUrl);
  const showTaxRow = settings.vatEnabled && settings.showTaxOnReceipt;
  const sampleSubtotal = 40000;
  const sampleTax =
    showTaxRow && settings.vatEnabled
      ? settings.taxInclusive
        ? Math.round((sampleSubtotal * settings.vatRate) / (100 + settings.vatRate))
        : Math.round((sampleSubtotal * settings.vatRate) / 100)
      : 0;
  const sampleTotal = settings.taxInclusive || !showTaxRow ? sampleSubtotal : sampleSubtotal + sampleTax;
  const receiptNo = `${settings.receiptPrefix || "RCP"}-SAMPLE`;
  const sampleDate = "02/10/2026 16:00";
  const sampleCashier = locale === "lo" ? "ຕົວຢ່າງພະນັກງານ" : "Sample Cashier";
  const resolvedBranch = (branchName ?? "").trim();
  const qrSrc = String(previewQrImageUrl ?? "").trim() || null;

  return (
    <div className="rounded-md border border-border bg-background p-4" data-receipt-preview>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{tSettings("receiptPreviewTitle", locale)}</h3>
        <span className="text-xs text-muted-foreground">
          {tSettings("receiptPreviewSample", locale)} · {paperSize}
        </span>
      </div>
      <div className="overflow-x-auto">
        {/* Receipt paper is always white — Dark Mode must not invert the paper. */}
        <div
          className="mx-auto rounded-sm border border-neutral-300 bg-white p-3 font-mono text-[11px] leading-4 text-neutral-900 shadow-[0_1px_6px_rgba(0,0,0,0.12)] sm:text-xs sm:leading-5"
          data-receipt-paper
          data-receipt-paper-size={paperSize}
          style={{ maxWidth: "100%", width: paperWidth }}
        >
          {logoSrc ? (
            <div className="mb-2 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="max-h-14 w-auto object-contain" src={logoSrc} />
            </div>
          ) : null}

          {settings.receiptShowCompanyName !== false && settings.companyName.trim() ? (
            <div className="text-center text-sm font-semibold text-neutral-950">{settings.companyName}</div>
          ) : null}
          {settings.receiptShowBranchName !== false && resolvedBranch ? (
            <div className="text-center text-neutral-800">{resolvedBranch}</div>
          ) : null}
          {settings.receiptShowAddress !== false && settings.profileAddress?.trim() ? (
            <div className="text-center text-neutral-700">{settings.profileAddress}</div>
          ) : null}
          {settings.receiptShowPhone !== false && settings.profilePhone?.trim() ? (
            <div className="text-center text-neutral-700">{settings.profilePhone}</div>
          ) : null}
          {settings.receiptShowEmail !== false && settings.profileEmail?.trim() ? (
            <div className="text-center text-neutral-700">{settings.profileEmail}</div>
          ) : null}
          {settings.receiptShowTaxNumber !== false && settings.taxNumber?.trim() ? (
            <div className="text-center text-neutral-700">
              {tSettings("taxNumber", locale)}: {settings.taxNumber}
            </div>
          ) : null}

          {settings.receiptShowHeader !== false && settings.receiptHeader?.trim() ? (
            <div className="mt-2 text-center text-neutral-900">{settings.receiptHeader}</div>
          ) : null}

          <div className="my-2 border-t border-dashed border-neutral-400" />

          {settings.receiptShowReceiptNumber !== false ? (
            <div className="flex justify-between gap-2">
              <span>{tSettings("receiptNumber", locale)}</span>
              <span>{receiptNo}</span>
            </div>
          ) : null}
          {settings.receiptShowDateTime !== false ? (
            <div className="flex justify-between gap-2">
              <span>{tSettings("receiptDateTime", locale)}</span>
              <span>{sampleDate}</span>
            </div>
          ) : null}
          {settings.receiptShowCashier !== false ? (
            <div className="flex justify-between gap-2">
              <span>{tSettings("receiptPreviewCashier", locale)}</span>
              <span>{sampleCashier}</span>
            </div>
          ) : null}

          <div className="my-2 border-t border-dashed border-neutral-400" />

          <div className="space-y-2">
            <div>
              <div className="flex justify-between gap-2">
                <span>{locale === "lo" ? "ສິນຄ້າຕົວຢ່າງ A" : "Sample Product A"}</span>
                <span>{formatSampleLak(20000)}</span>
              </div>
              <div className="text-neutral-600">1 x {formatSampleLak(20000)}</div>
            </div>
            <div>
              <div className="flex justify-between gap-2">
                <span>{locale === "lo" ? "ສິນຄ້າຕົວຢ່າງ B" : "Sample Product B"}</span>
                <span>{formatSampleLak(20000)}</span>
              </div>
              <div className="text-neutral-600">2 x {formatSampleLak(10000)}</div>
            </div>
          </div>

          <div className="my-2 border-t border-dashed border-neutral-400" />

          <div className="flex justify-between gap-2">
            <span>{tSettings("receiptPreviewSubtotal", locale)}</span>
            <span>{formatSampleLak(sampleSubtotal)}</span>
          </div>
          {showTaxRow ? (
            <div className="flex justify-between gap-2">
              <span>
                {tSettings("receiptPreviewTaxRow", locale)}
                {settings.vatEnabled ? ` ${settings.vatRate}%` : ""}
                {settings.taxInclusive ? ` (${tSettings("taxInclusive", locale)})` : ""}
              </span>
              <span>{formatSampleLak(sampleTax)}</span>
            </div>
          ) : null}
          <div className="flex justify-between gap-2 font-semibold text-neutral-950">
            <span>{tSettings("receiptPreviewTotal", locale)}</span>
            <span>{formatSampleLak(sampleTotal)}</span>
          </div>

          {qrSrc ? (
            <div className="mt-3 flex flex-col items-center gap-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" className="max-h-24 w-auto object-contain" src={qrSrc} />
              <span className="text-[10px] text-neutral-600">{tSettings("receiptPreviewQrNote", locale)}</span>
            </div>
          ) : null}

          {settings.receiptShowFooter !== false && settings.receiptFooter?.trim() ? (
            <div className="mt-3 text-center text-neutral-900">{settings.receiptFooter}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
