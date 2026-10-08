"use client";

import { useState } from "react";
import { exportProductsAction, previewProductExportAction } from "@/features/products/actions";
import {
  DEFAULT_PRODUCT_EXPORT_FIELDS,
  PRODUCT_EXPORT_FIELDS,
  PRODUCT_EXPORT_PRESETS,
  type ProductExportField,
} from "@/features/products/product-export";
import type { ProductListQuery } from "@/features/products/list-query";
import { WhiteDataTable } from "@/features/products/components/selected-products-list";
import { fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type ExportScope = "all" | "filtered" | "selected";
type ExportFormat = "csv" | "xlsx";
type ExportLayout = "detailed" | "import";

const FIELD_LABELS: Record<ProductExportField, string> = {
  barcode: "barcode",
  brand: "brandName",
  category: "category",
  cost: "cost",
  createdAt: "exportCreatedDate",
  nameEn: "exportNameEn",
  onHand: "exportOnHand",
  productCode: "exportProductCode",
  productImage: "exportProductImage",
  productName: "productName",
  qtyInBase: "exportQtyInBase",
  reorderLevel: "exportReorderLevel",
  rounding: "exportRounding",
  sellingPrice: "sellingPrice",
  sku: "sku",
  status: "status",
  supplier: "supplier",
  unitEnabled: "exportUnitEnabled",
  unitImage: "exportUnitImage",
  unitName: "exportUnit",
  updatedAt: "exportUpdatedDate",
};

const FIELD_GROUPS: Array<{ fields: ProductExportField[]; label: string }> = [
  { fields: ["productName", "nameEn", "sku", "productCode", "status", "createdAt", "updatedAt"], label: "products" },
  { fields: ["category", "brand", "supplier"], label: "exportRelations" },
  { fields: ["unitName", "unitEnabled", "qtyInBase", "sellingPrice", "cost", "rounding", "barcode"], label: "exportUnits" },
  { fields: ["onHand", "reorderLevel"], label: "stock" },
  { fields: ["productImage", "unitImage"], label: "images" },
];

export function ExportProductsDrawer({ canViewCost = true, filteredCount, onClose, query, selectedIds }: {
  canViewCost?: boolean;
  filteredCount: number;
  onClose: () => void;
  query: ProductListQuery;
  selectedIds: string[];
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [scope, setScope] = useState<ExportScope>(selectedIds.length > 0 ? "selected" : "filtered");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [layout, setLayout] = useState<ExportLayout>("detailed");
  const [fields, setFields] = useState<ProductExportField[]>(DEFAULT_PRODUCT_EXPORT_FIELDS);
  const [phase, setPhase] = useState<"idle" | "previewing" | "exporting" | "done">("idle");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [count, setCount] = useState(0);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const requestKey = JSON.stringify({ fields: layout === "detailed" ? fields : [], format, layout, query, scope });
  const previewReady = preview !== null && previewKey === requestKey && phase !== "previewing";
  const scopeCount = scope === "selected" ? selectedIds.length : filteredCount;
  const scopeLabel = scope === "selected"
    ? fillProductsCopy(t("exportSelectedCount"), { count: selectedIds.length })
    : scope === "filtered"
      ? fillProductsCopy(t("exportFilteredCount"), { count: filteredCount })
      : t("exportAllProducts");

  function updateScope(next: ExportScope) {
    setScope(next);
    setPhase("idle");
  }

  function updateFields(next: ProductExportField[]) {
    setFields(PRODUCT_EXPORT_FIELDS.filter((field) => next.includes(field) && (field !== "cost" || canViewCost)));
    setPhase("idle");
  }

  function toggleField(field: ProductExportField) {
    if (field === "cost" && !canViewCost) return;
    updateFields(fields.includes(field) ? fields.filter((item) => item !== field) : [...fields, field]);
  }

  function toggleImages(enabled: boolean) {
    const without = fields.filter((field) => field !== "productImage" && field !== "unitImage");
    updateFields(enabled ? [...without, "productImage", "unitImage"] : without);
  }

  async function runPreview() {
    setPhase("previewing");
    setMessage("");
    const response = await previewProductExportAction(request());
    if (!response.ok || !response.data) {
      setPhase("idle");
      setMessage(errorText(response.error, t));
      return;
    }
    setPreview(response.data as PreviewState);
    setPreviewKey(requestKey);
    setPhase("idle");
  }

  async function runExport() {
    if (!previewReady) return;
    setPhase("exporting");
    setMessage("");
    const response = await exportProductsAction(request());
    if (!response.ok || !response.data) {
      setPhase("idle");
      setMessage(errorText(response.error, t));
      return;
    }
    const file = response.data as { base64: string; filename: string; mime: string; productCount: number };
    downloadBase64(file.filename, file.mime, file.base64);
    setFileName(file.filename);
    setCount(file.productCount);
    setPhase("done");
  }

  function request() {
    return {
      fields: layout === "detailed" ? fields : undefined,
      format,
      layout,
      productIds: scope === "selected" ? selectedIds : undefined,
      query,
      scope,
    };
  }

  return (
    <div className="grid gap-5" data-default-scope={selectedIds.length > 0 ? "selected" : "filtered"} data-layout={layout} data-selected-count={selectedIds.length} data-testid="products-export-workflow">
      <section className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
        {t("exportNotice")}
      </section>
      <p className="text-sm font-semibold" data-scope={scope} data-testid="products-export-scope-count">{scopeLabel}</p>
      <fieldset className="grid gap-2" data-testid="products-export-scope">
        <legend className="text-sm font-semibold">{t("exportScope")}</legend>
        <ScopeOption checked={scope === "selected"} disabled={selectedIds.length === 0} label={selectedIds.length > 0 ? `${t("exportSelectedProducts")} (${selectedIds.length})` : t("exportSelectedProducts")} onChange={() => updateScope("selected")} testId="products-export-selected"/>
        <ScopeOption checked={scope === "filtered"} label={`${t("exportFilteredProducts")} (${filteredCount})`} onChange={() => updateScope("filtered")} testId="products-export-filtered"/>
        <ScopeOption checked={scope === "all"} label={t("exportAllProducts")} onChange={() => updateScope("all")} testId="products-export-all"/>
      </fieldset>
      <fieldset className="flex flex-wrap gap-2" data-testid="products-export-layout">
        <legend className="w-full text-sm font-semibold">{t("exportLayout")}</legend>
        <FormatOption checked={layout === "detailed"} label={t("detailedExport")} onChange={() => { setLayout("detailed"); setPhase("idle"); }} testId="products-export-detailed"/>
        <FormatOption checked={layout === "import"} label={t("importCompatibleCsv")} onChange={() => { setLayout("import"); setFormat("csv"); setPhase("idle"); }} testId="products-export-import"/>
      </fieldset>
      <fieldset className="flex flex-wrap gap-2" data-testid="products-export-format">
        <legend className="w-full text-sm font-semibold">{t("exportFormat")}</legend>
        <FormatOption checked={format === "csv"} label="CSV" onChange={() => { setFormat("csv"); setPhase("idle"); }} testId="products-export-csv"/>
        <FormatOption checked={format === "xlsx"} disabled={layout === "import"} label={t("exportExcel")} onChange={() => { setFormat("xlsx"); setPhase("idle"); }} testId="products-export-xlsx"/>
      </fieldset>
      {layout === "detailed" ? (
        <section className="grid gap-3" data-testid="products-export-fields">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("chooseFields")}</h3>
            <div className="flex flex-wrap gap-2">
              <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-export-preset-basic" type="button" onClick={() => updateFields(PRODUCT_EXPORT_PRESETS.basic)}>{t("presetBasic")}</button>
              <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-export-preset-inventory" type="button" onClick={() => updateFields(PRODUCT_EXPORT_PRESETS.inventory)}>{t("presetInventory")}</button>
              <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-export-preset-full" type="button" onClick={() => updateFields(PRODUCT_EXPORT_PRESETS.full)}>{t("presetFull")}</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input checked={fields.includes("productImage") || fields.includes("unitImage")} data-testid="products-export-include-images" type="checkbox" onChange={(event) => toggleImages(event.target.checked)}/>
            {t("includeImages")}
          </label>
          {FIELD_GROUPS.map((group) => (
            <fieldset className="grid gap-2 rounded-lg border border-border p-3" key={group.label}>
              <legend className="px-1 text-xs font-semibold text-muted-foreground">{t(group.label)}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <label className="flex items-center gap-2 text-sm" key={field}>
                    <input checked={fields.includes(field)} data-testid={`products-export-field-${field}`} disabled={field === "cost" && !canViewCost} type="checkbox" onChange={() => toggleField(field)}/>
                    {t(FIELD_LABELS[field])}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
      ) : <p className="text-sm text-muted-foreground">{t("importCompatibleHint")}</p>}
      <p className="text-sm text-muted-foreground">{t("exportReadOnly")}</p>
      {previewReady && preview ? (
        <section className="grid gap-3 rounded-lg border border-border bg-background p-4" data-format={preview.format} data-images={preview.imageCount} data-products={preview.productCount} data-testid="products-export-preview-panel" data-units={preview.unitCount}>
          <h3 className="text-lg font-semibold">{t("preview")}</h3>
          <p className="text-sm">{scopeLabel}</p>
          <p className="text-sm">{t("exportFormat")}: {preview.format === "xlsx" ? t("exportExcel") : "CSV"}</p>
          <p className="text-sm">{t("products")}: {preview.productCount}</p>
          <p className="text-sm">{t("exportUnits")}: {preview.unitCount}</p>
          <p className="text-sm">{t("images")}: {preview.imageCount}</p>
          {preview.sampleRows.length > 0 ? (
            <WhiteDataTable minWidth={`${Math.max(preview.headers.length, 1) * 148}px`} testId="products-export-preview-table">
              <thead>
                <tr>
                  {preview.headers.map((header, index) => (
                    <th key={`${header}-${index}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.map((row, index) => (
                  <tr data-testid="products-export-preview-row" key={`${row[0] ?? "row"}-${index}`}>
                    {preview.headers.map((header, cellIndex) => (
                      <td key={`${index}-${header}-${cellIndex}`}>{row[cellIndex] || "-"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </WhiteDataTable>
          ) : <p className="text-sm">{t("exportNoProducts")}</p>}
        </section>
      ) : null}
      {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
      {phase === "done" ? (
        <section className="rounded-lg border border-border bg-background p-4" data-testid="products-export-result">
          <h3 className="text-lg font-semibold">{t("exportComplete")}</h3>
          <p className="mt-2 text-sm" data-testid="products-export-count">{count}</p>
          <p className="text-sm text-muted-foreground">{fileName}</p>
        </section>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{phase === "done" ? t("importDone") : t("closeDrawer")}</button>
        {phase !== "done" ? (
          <>
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid="products-export-preview" disabled={phase === "previewing" || phase === "exporting" || (scope === "selected" && selectedIds.length === 0)} type="button" onClick={() => { void runPreview(); }}>{phase === "previewing" ? t("exportBusy") : t("preview")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-export-confirm" disabled={!previewReady || phase === "exporting" || preview?.productCount === 0 || (scope === "selected" && selectedIds.length === 0)} type="button" onClick={() => { void runExport(); }}>
              {phase === "exporting" ? t("exportBusy") : t("exportAction")}
            </button>
          </>
        ) : null}
      </div>
      <span className="sr-only" data-scope-count={scopeCount}/>
    </div>
  );
}

type PreviewState = {
  format: "csv" | "xlsx";
  headers: string[];
  imageCount: number;
  productCount: number;
  sampleRows: string[][];
  unitCount: number;
};

function errorText(error: string | undefined, t: (key: string) => string) {
  const text = error ?? "";
  if (text.includes("Permission denied")) return t("importPermissionDenied");
  if (text.includes("No products")) return t("exportNoProducts");
  return text || t("exportNoProducts");
}

function ScopeOption({ checked, disabled, label, onChange, testId }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold" data-testid={testId}>
      <input checked={checked} disabled={disabled} name="product-export-scope" type="radio" onChange={onChange}/>
      {label}
    </label>
  );
}

function FormatOption({ checked, disabled, label, onChange, testId }: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
  testId: string;
}) {
  return (
    <label className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" data-testid={testId}>
      <input checked={checked} disabled={disabled} name={testId.includes("layout") || testId.includes("detailed") || testId.includes("import") ? "product-export-layout" : "product-export-format"} type="radio" onChange={onChange}/>
      {label}
    </label>
  );
}

function downloadBase64(filename: string, mime: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
