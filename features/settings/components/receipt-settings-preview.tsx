"use client";

import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";
import { receiptBusinessLogoSrc } from "@/features/pos/receipt-branding";
import {
  asPaperSize,
  isDocumentPaperSize,
  resolvePaperDimensionsMm,
  resolvePreviewPaperStyle,
  type ReceiptPaperSize,
} from "@/features/settings/receipt-layout";

function formatSampleLak(value: number) {
  return value.toLocaleString("en-US");
}

function paperSizeLabel(size: ReceiptPaperSize, locale: SupportedLocale) {
  if (size === "58mm") return tSettings("receiptPaperSize58", locale);
  if (size === "80mm") return tSettings("receiptPaperSize80", locale);
  if (size === "a5") return tSettings("receiptPaperSizeA5", locale);
  if (size === "a4") return tSettings("receiptPaperSizeA4", locale);
  return tSettings("receiptPaperSizeCustom", locale);
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
  const paperSize = asPaperSize(settings.receiptPaperSize);
  const dims = resolvePaperDimensionsMm(paperSize, settings.receiptCustomWidthMm, settings.receiptCustomHeightMm);
  const previewBox = resolvePreviewPaperStyle(paperSize, settings.receiptCustomWidthMm, settings.receiptCustomHeightMm);
  const documentLayout = isDocumentPaperSize(paperSize);
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
  const productA = locale === "lo" ? "ສິນຄ້າຕົວຢ່າງ A" : "Sample Product A";
  const productB = locale === "lo" ? "ສິນຄ້າຕົວຢ່າງ B" : "Sample Product B";
  const dimLabel = dims.continuous
    ? `${dims.widthMm} mm`
    : `${dims.widthMm} × ${dims.heightMm} mm`;

  const identity = (
    <>
      {logoSrc ? (
        <div className={documentLayout ? "mb-3 flex justify-start" : "mb-2 flex justify-center"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className={documentLayout ? "max-h-16 w-auto object-contain" : "max-h-14 w-auto object-contain"} src={logoSrc} />
        </div>
      ) : null}
      {settings.receiptShowCompanyName !== false && settings.companyName.trim() ? (
        <div className={documentLayout ? "text-base font-bold text-neutral-950" : "text-center text-sm font-semibold text-neutral-950"}>
          {settings.companyName}
        </div>
      ) : null}
      {settings.receiptShowBranchName !== false && resolvedBranch ? (
        <div className={documentLayout ? "text-neutral-800" : "text-center text-neutral-800"}>{resolvedBranch}</div>
      ) : null}
      {settings.receiptShowAddress !== false && settings.profileAddress?.trim() ? (
        <div className={documentLayout ? "text-neutral-700" : "text-center text-neutral-700"}>{settings.profileAddress}</div>
      ) : null}
      {settings.receiptShowPhone !== false && settings.profilePhone?.trim() ? (
        <div className={documentLayout ? "text-neutral-700" : "text-center text-neutral-700"}>{settings.profilePhone}</div>
      ) : null}
      {settings.receiptShowEmail !== false && settings.profileEmail?.trim() ? (
        <div className={documentLayout ? "text-neutral-700" : "text-center text-neutral-700"}>{settings.profileEmail}</div>
      ) : null}
      {settings.receiptShowTaxNumber !== false && settings.taxNumber?.trim() ? (
        <div className={documentLayout ? "text-neutral-700" : "text-center text-neutral-700"}>
          {tSettings("taxNumber", locale)}: {settings.taxNumber}
        </div>
      ) : null}
      {settings.receiptShowHeader !== false && settings.receiptHeader?.trim() ? (
        <div className={documentLayout ? "mt-2 text-neutral-900" : "mt-2 text-center text-neutral-900"}>{settings.receiptHeader}</div>
      ) : null}
    </>
  );

  const meta = (
    <>
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
    </>
  );

  const totals = (
    <>
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
    </>
  );

  const footerBlock = (
    <>
      {qrSrc ? (
        <div className={documentLayout ? "mt-4 flex flex-col items-start gap-1" : "mt-3 flex flex-col items-center gap-1"}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="max-h-24 w-auto object-contain" src={qrSrc} />
          <span className="text-[10px] text-neutral-600">{tSettings("receiptPreviewQrNote", locale)}</span>
        </div>
      ) : null}
      {settings.receiptShowFooter !== false && settings.receiptFooter?.trim() ? (
        <div className={documentLayout ? "mt-4 text-neutral-900" : "mt-3 text-center text-neutral-900"}>{settings.receiptFooter}</div>
      ) : null}
    </>
  );

  return (
    <div className="rounded-md border border-border bg-background p-4" data-receipt-preview>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{tSettings("receiptPreviewTitle", locale)}</h3>
        <span className="text-xs text-muted-foreground">
          {tSettings("receiptPreviewSample", locale)} · {paperSizeLabel(paperSize, locale)} · {dimLabel}
        </span>
      </div>
      <div className="overflow-x-auto">
        {/* Receipt paper is always white — Dark Mode must not invert the paper. */}
        <div
          className={
            documentLayout
              ? "mx-auto overflow-hidden rounded-sm border border-neutral-300 bg-white p-4 text-[11px] leading-4 text-neutral-900 shadow-[0_1px_6px_rgba(0,0,0,0.12)] sm:p-5 sm:text-xs sm:leading-5"
              : "mx-auto rounded-sm border border-neutral-300 bg-white p-3 font-mono text-[11px] leading-4 text-neutral-900 shadow-[0_1px_6px_rgba(0,0,0,0.12)] sm:text-xs sm:leading-5"
          }
          data-receipt-paper
          data-receipt-paper-layout={documentLayout ? "document" : "thermal"}
          data-receipt-paper-size={paperSize}
          style={{
            height: previewBox.heightPx === "auto" ? "auto" : previewBox.heightPx,
            maxWidth: "100%",
            width: previewBox.widthPx,
          }}
        >
          {documentLayout ? (
            <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
              <div>{identity}</div>
              <div className="border-t border-neutral-300 pt-2">{meta}</div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-neutral-400 text-[10px] uppercase tracking-wide text-neutral-600">
                      <th className="py-1 pr-2 font-semibold">{tSettings("receiptColItem", locale)}</th>
                      <th className="py-1 pr-2 text-right font-semibold">{tSettings("receiptColQty", locale)}</th>
                      <th className="py-1 pr-2 text-right font-semibold">{tSettings("receiptColUnitPrice", locale)}</th>
                      <th className="py-1 text-right font-semibold">{tSettings("receiptColAmount", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-neutral-200">
                      <td className="py-1.5 pr-2 align-top">{productA}</td>
                      <td className="py-1.5 pr-2 text-right align-top">1</td>
                      <td className="py-1.5 pr-2 text-right align-top">{formatSampleLak(20000)}</td>
                      <td className="py-1.5 text-right align-top">{formatSampleLak(20000)}</td>
                    </tr>
                    <tr className="border-b border-neutral-200">
                      <td className="py-1.5 pr-2 align-top">{productB}</td>
                      <td className="py-1.5 pr-2 text-right align-top">2</td>
                      <td className="py-1.5 pr-2 text-right align-top">{formatSampleLak(10000)}</td>
                      <td className="py-1.5 text-right align-top">{formatSampleLak(20000)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="ml-auto w-full max-w-[220px] space-y-1 border-t border-neutral-300 pt-2">{totals}</div>
              <div>{footerBlock}</div>
            </div>
          ) : (
            <>
              {identity}
              <div className="my-2 border-t border-dashed border-neutral-400" />
              {meta}
              <div className="my-2 border-t border-dashed border-neutral-400" />
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between gap-2">
                    <span>{productA}</span>
                    <span>{formatSampleLak(20000)}</span>
                  </div>
                  <div className="text-neutral-600">1 x {formatSampleLak(20000)}</div>
                </div>
                <div>
                  <div className="flex justify-between gap-2">
                    <span>{productB}</span>
                    <span>{formatSampleLak(20000)}</span>
                  </div>
                  <div className="text-neutral-600">2 x {formatSampleLak(10000)}</div>
                </div>
              </div>
              <div className="my-2 border-t border-dashed border-neutral-400" />
              {totals}
              {footerBlock}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
