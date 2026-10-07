"use client";

import { useState } from "react";
import { exportProductsAction } from "@/features/products/actions";
import type { ProductListQuery } from "@/features/products/list-query";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type ExportScope = "all" | "filtered" | "selected";
type ExportFormat = "csv" | "xlsx";

export function ExportProductsDrawer({ onClose, query, selectedIds }: {
  onClose: () => void;
  query: ProductListQuery;
  selectedIds: string[];
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [scope, setScope] = useState<ExportScope>(selectedIds.length > 0 ? "selected" : "filtered");
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [phase, setPhase] = useState<"idle" | "exporting" | "done">("idle");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [count, setCount] = useState(0);

  async function runExport() {
    setPhase("exporting");
    setMessage("");
    const response = await exportProductsAction({
      format,
      productIds: scope === "selected" ? selectedIds : undefined,
      query,
      scope,
    });
    if (!response.ok || !response.data) {
      setPhase("idle");
      const error = response.error ?? "";
      setMessage(error.includes("Permission denied") ? t("importPermissionDenied") : error.includes("No products") ? t("exportNoProducts") : error || t("exportNoProducts"));
      return;
    }
    const file = response.data as { base64: string; filename: string; mime: string; productCount: number };
    downloadBase64(file.filename, file.mime, file.base64);
    setFileName(file.filename);
    setCount(file.productCount);
    setPhase("done");
  }

  return (
    <div className="grid gap-5" data-default-scope={selectedIds.length > 0 ? "selected" : "filtered"} data-selected-count={selectedIds.length} data-testid="products-export-workflow">
      <section className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
        {t("exportNotice")}
      </section>
      <fieldset className="grid gap-2" data-testid="products-export-scope">
        <legend className="text-sm font-semibold">{t("exportScope")}</legend>
        <ScopeOption checked={scope === "all"} label={t("exportAllProducts")} onChange={() => setScope("all")} testId="products-export-all"/>
        <ScopeOption checked={scope === "filtered"} label={t("exportFilteredProducts")} onChange={() => setScope("filtered")} testId="products-export-filtered"/>
        <ScopeOption checked={scope === "selected"} disabled={selectedIds.length === 0} label={selectedIds.length > 0 ? `${t("exportSelectedProducts")} (${selectedIds.length})` : t("exportSelectedProducts")} onChange={() => setScope("selected")} testId="products-export-selected"/>
      </fieldset>
      <fieldset className="flex flex-wrap gap-2" data-testid="products-export-format">
        <legend className="w-full text-sm font-semibold">{t("exportFormat")}</legend>
        <FormatOption checked={format === "csv"} label="CSV" onChange={() => setFormat("csv")} testId="products-export-csv"/>
        <FormatOption checked={format === "xlsx"} label={t("exportExcel")} onChange={() => setFormat("xlsx")} testId="products-export-xlsx"/>
      </fieldset>
      <p className="text-sm text-muted-foreground">{t("exportReadOnly")}</p>
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
          <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-export-confirm" disabled={phase === "exporting" || (scope === "selected" && selectedIds.length === 0)} type="button" onClick={() => { void runExport(); }}>
            {phase === "exporting" ? t("exportBusy") : t("exportAction")}
          </button>
        ) : null}
      </div>
    </div>
  );
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

function FormatOption({ checked, label, onChange, testId }: {
  checked: boolean;
  label: string;
  onChange: () => void;
  testId: string;
}) {
  return (
    <label className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" data-testid={testId}>
      <input checked={checked} name="product-export-format" type="radio" onChange={onChange}/>
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
