"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importProductsFileAction, previewProductImportFileAction } from "@/features/products/actions";
import {
  PRODUCT_IMPORT_BATCH_SIZE,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_MAX_CHARS,
  PRODUCT_IMPORT_TEMPLATE_CSV,
  type ProductImportColumn,
  type ProductImportIssue,
  type ProductImportMappedColumn,
  type ProductImportPreviewRow,
} from "@/features/products/product-import";
import { displayProductUnitName, fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

type PreviewData = {
  columns: ProductImportMappedColumn[];
  errorCount: number;
  fileIssues: ProductImportIssue[];
  format: string | null;
  rows: ProductImportPreviewRow[];
  selectedSheet: string | null;
  sheets: Array<{ empty: boolean; name: string }>;
  skippedBlankRows: number;
  validCount: number;
  warningCount: number;
};

type StoredFile = {
  fileBase64: string;
  fileName: string;
};

type ResultRow = {
  issues: ProductImportIssue[];
  outcome: "created" | "failed" | "skipped";
  productName: string;
  rowNumber: number;
};

export function ImportProductsDrawer({ canImport, onClose, onImported }: {
  canImport: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [storedFile, setStoredFile] = useState<StoredFile | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "validating" | "importing" | "done">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ created: number; failed: number; rows: ResultRow[]; skipped: number; warnings: number } | null>(null);

  function issueText(issue: ProductImportIssue) {
    const fieldKey = issue.field ? `importField_${issue.field}` : "";
    const field = fieldKey && t(fieldKey) !== fieldKey ? t(fieldKey) : issue.field ?? "";
    const detail = issue.detail && ["Piece", "Pack", "Box"].includes(issue.detail)
      ? displayProductUnitName(issue.detail, locale)
      : issue.detail ?? "";
    const template = t(`importIssue_${issue.code}`);
    return fillProductsCopy(template === `importIssue_${issue.code}` ? issue.code : template, { detail, field });
  }

  function downloadTemplate() {
    downloadText("ego-product-import-template.csv", PRODUCT_IMPORT_TEMPLATE_CSV);
  }

  async function validateFile(file: StoredFile, sheetName?: string, columns?: Array<{ field: string | null; index: number }>) {
    setPhase("validating");
    setResult(null);
    setMessage("");
    const response = await previewProductImportFileAction({
      columns,
      fileBase64: file.fileBase64,
      fileName: file.fileName,
      sheetName,
    });
    if (!response.ok || !response.data) {
      setPreview(null);
      setPhase("idle");
      setMessage(response.error?.includes("Permission denied") ? t("importPermissionDenied") : response.error || t("importPermissionDenied"));
      return;
    }
    setPreview(response.data as PreviewData);
    setPhase("idle");
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return;
    if (file.size > PRODUCT_IMPORT_MAX_CHARS) {
      setStoredFile(null);
      setPreview(null);
      setResult(null);
      setMessage(t("importIssue_file_too_large"));
      return;
    }
    setPhase("reading");
    setMessage("");
    setPreview(null);
    setResult(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = { fileBase64: bytesToBase64(bytes), fileName: file.name };
    setStoredFile(stored);
    await validateFile(stored);
  }

  async function onSheetChange(sheetName: string) {
    if (!storedFile) return;
    setPreview(null);
    await validateFile(storedFile, sheetName);
  }

  async function onMappingChange(index: number, field: string) {
    if (!storedFile || !preview) return;
    const columns = preview.columns.map((column) => ({
      field: column.index === index ? field : (column.choice ?? ""),
      index: column.index,
    }));
    await validateFile(storedFile, preview.selectedSheet ?? undefined, columns);
  }

  async function confirmImport() {
    if (!storedFile || !preview || preview.validCount + preview.warningCount === 0) return;
    setPhase("importing");
    setMessage("");
    let afterRow = 0;
    let created = 0;
    let failed = 0;
    let warnings = 0;
    const rows: ResultRow[] = preview.rows
      .filter((row) => row.state === "error")
      .map((row) => ({ issues: row.issues, outcome: "skipped" as const, productName: row.productName, rowNumber: row.rowNumber }));
    let guard = 0;
    while (guard < 60) {
      guard += 1;
      const response = await importProductsFileAction({
        afterRow,
        columns: preview.columns.map((column) => ({ field: column.choice ?? "", index: column.index })),
        fileBase64: storedFile.fileBase64,
        fileName: storedFile.fileName,
        limit: PRODUCT_IMPORT_BATCH_SIZE,
        sheetName: preview.selectedSheet ?? undefined,
      });
      if (!response.ok || !response.data) {
        setPhase("idle");
        setMessage(response.error?.includes("Permission denied") ? t("importPermissionDenied") : response.error || t("importFailed"));
        return;
      }
      const batch = response.data as {
        blocked: boolean;
        created: number;
        failed: number;
        nextAfterRow: number;
        remaining: number;
        rows: ResultRow[];
        warnings: number;
      };
      if (batch.blocked) {
        setPhase("idle");
        setMessage(batch.rows[0] ? issueText(batch.rows[0].issues[0]!) : t("importNoValidRows"));
        return;
      }
      created += batch.created;
      failed += batch.failed;
      warnings += batch.warnings;
      rows.push(...batch.rows);
      afterRow = batch.nextAfterRow;
      if (batch.remaining <= 0) break;
    }
    const summary = {
      created,
      failed,
      rows: rows.sort((left, right) => left.rowNumber - right.rowNumber),
      skipped: preview.errorCount,
      warnings,
    };
    setResult(summary);
    setPhase("done");
    if (created > 0) await onImported();
  }

  function downloadErrors() {
    const source = result?.rows.filter((row) => row.outcome !== "created") ?? preview?.rows.filter((row) => row.state === "error") ?? [];
    const lines = ["row,product_name,outcome,reason", ...source.map((row) => [
      String(row.rowNumber),
      csvCell(row.productName),
      "outcome" in row ? row.outcome : row.state,
      csvCell(("issues" in row ? row.issues : []).map((issue) => issueText(issue)).join("; ")),
    ].join(","))];
    downloadText("ego-product-import-errors.csv", `${lines.join("\n")}\n`);
  }

  const readyCount = (preview?.validCount ?? 0) + (preview?.warningCount ?? 0);
  const busy = phase === "reading" || phase === "validating" || phase === "importing";
  const formatLabel = preview?.format ? preview.format.toUpperCase() : "";
  const workbookSheets = preview?.sheets ?? [];
  const mappingColumns = preview?.columns ?? [];
  const productNameMapped = mappingColumns.some((column) => column.status === "mapped" && column.choice === "product_name");

  return (
    <div className="grid gap-5" data-ignores-selection="true" data-testid="products-import-workflow">
      <section className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
        {t("importNotice")}
      </section>
      {!canImport ? <p className="text-sm font-semibold text-danger">{t("importPermissionDenied")}</p> : null}
      <p className="text-sm text-muted-foreground" data-testid="products-import-formats">{t("importFormatsHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-template" type="button" onClick={downloadTemplate}>
          {t("importDownloadTemplate")}
        </button>
        <button className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-file" disabled={!canImport || busy} type="button" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden="true" className="size-4"/>
          {t("importChooseFile")}
        </button>
        <button className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid="products-import-validate" disabled={!canImport || !storedFile || busy} type="button" onClick={() => storedFile && void validateFile(storedFile, preview?.selectedSheet ?? undefined)}>
          {phase === "validating" || phase === "reading" ? t("importParsing") : t("importValidate")}
        </button>
        {formatLabel ? <span className="rounded-full border border-border px-3 py-1 text-sm font-semibold" data-testid="products-import-format">{t("importFileFormat")}: {formatLabel}</span> : null}
        {storedFile ? <span className="text-sm text-muted-foreground" data-testid="products-import-filename">{storedFile.fileName}</span> : null}
        <input ref={fileRef} accept=".csv,.tsv,.xlsx,.xls,.ods,text/csv,text/tab-separated-values" className="hidden" data-testid="products-import-input" type="file" onChange={(event) => { void onFileChange(event.target.files?.[0]); event.target.value = ""; }}/>
      </div>
      {workbookSheets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" data-testid="products-import-sheet-name">{t("importSelectedSheet")}: {preview?.selectedSheet}</span>
          {workbookSheets.length > 1 ? (
            <label className="flex items-center gap-2 text-sm">
              {t("importSheet")}
              <select className="h-11 rounded-md border border-border bg-background px-3" data-testid="products-import-sheet" disabled={busy} value={preview?.selectedSheet ?? ""} onChange={(event) => { void onSheetChange(event.target.value); }}>
                {workbookSheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("importSampleHint")}</p>
      {mappingColumns.length > 0 ? (
        <section className="grid gap-3" data-testid="products-import-mapping">
          <div>
            <h3 className="text-base font-semibold">{t("importMappingTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("importMappingHint")}</p>
          </div>
          {!productNameMapped ? <p className="text-sm font-semibold text-danger" data-testid="products-import-name-required">{t("importMappingNameRequired")}</p> : null}
          <div className="max-h-[320px] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("importMapHeader")}</th>
                  <th className="p-3">{t("importMapSample")}</th>
                  <th className="p-3">{t("importMapSuggested")}</th>
                  <th className="p-3">{t("importMapField")}</th>
                  <th className="p-3">{t("importMapStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {mappingColumns.map((column) => (
                  <tr className="border-t border-border" key={column.index}>
                    <td className="p-3 font-semibold">{column.header.trim() || "-"}</td>
                    <td className="p-3 font-mono text-xs">{column.sample || "-"}</td>
                    <td className="p-3">{mappingFieldLabel(column.suggestion, t)}</td>
                    <td className="p-3">
                      <select className="h-11 w-full max-w-56 rounded-md border border-border bg-background px-3" data-testid={`products-import-map-${column.index}`} disabled={busy} value={column.status === "review" ? "" : (column.choice ?? "")} onChange={(event) => { void onMappingChange(column.index, event.target.value); }}>
                        <option value="">{t("importMapChoose")}</option>
                        <option value="ignore">{t("importMapIgnore")}</option>
                        {PRODUCT_IMPORT_COLUMNS.map((field) => <option key={field} value={field}>{mappingFieldLabel(field, t)}</option>)}
                      </select>
                    </td>
                    <td className={cn("p-3 font-semibold", column.status === "conflict" ? "text-danger" : column.status === "mapped" ? "text-success" : column.status === "review" ? "text-primary" : "text-muted-foreground")} data-testid={`products-import-map-status-${column.index}`}>{t(mappingStatusKey(column.status))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {message ? <p className="text-sm font-semibold text-danger" data-testid="products-import-message">{message}</p> : null}

      {preview ? (
        <section className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="products-import-summary">
            <Summary label={t("importValid")} value={preview.validCount}/>
            <Summary label={t("importWarnings")} value={preview.warningCount}/>
            <Summary label={t("importError")} value={preview.errorCount}/>
            <Summary label={t("importSkippedBlank")} testId="products-import-blank-skipped" value={preview.skippedBlankRows}/>
            <Summary label={t("importReady")} value={readyCount}/>
          </div>
          {preview.fileIssues.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {preview.fileIssues.map((issue, index) => (
                <li className={issue.level === "error" ? "text-danger" : "text-muted-foreground"} key={`${issue.code}-${index}`}>{issueText(issue)}</li>
              ))}
            </ul>
          ) : null}
          <div className="max-h-[360px] overflow-auto rounded-lg border border-border" data-testid="products-import-preview">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-3">{t("importRow")}</th>
                  <th className="p-3">{t("productName")}</th>
                  <th className="p-3">{t("sku")}</th>
                  <th className="p-3">{t("importUnits")}</th>
                  <th className="p-3">{t("status")}</th>
                  <th className="p-3">{t("importValidate")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr className="border-t border-border" key={row.rowNumber}>
                    <td className="p-3">{row.rowNumber}</td>
                    <td className="p-3 font-semibold">{row.productName || "-"}</td>
                    <td className="p-3 font-mono text-xs">{row.sku || "-"}</td>
                    <td className="p-3">{row.units.split(", ").filter(Boolean).map((unit) => displayProductUnitName(unit, locale)).join(", ")}</td>
                    <td className="p-3">{row.status || "-"}</td>
                    <td className="p-3">
                      <div className={cn("font-semibold", row.state === "error" ? "text-danger" : row.state === "warning" ? "text-primary" : "text-success")}>
                        {row.state === "error" ? t("importError") : row.state === "warning" ? t("importWarning") : t("importValid")}
                      </div>
                      {row.issues.slice(0, 2).map((issue, index) => <div className="text-xs text-muted-foreground" key={`${row.rowNumber}-${index}`}>{issueText(issue)}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="grid gap-3 rounded-lg border border-border bg-background p-4" data-testid="products-import-result">
          <h3 className="text-lg font-semibold">{t("importComplete")}</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <Summary label={t("importCreated")} testId="products-import-created" value={result.created}/>
            <Summary label={t("importSkipped")} testId="products-import-skipped" value={result.skipped}/>
            <Summary label={t("importFailed")} testId="products-import-failed" value={result.failed}/>
            <Summary label={t("importWarnings")} testId="products-import-warnings" value={result.warnings}/>
          </div>
          <p className="text-sm text-muted-foreground">{t("importResultHint")}</p>
          {result.rows.filter((row) => row.outcome !== "created").slice(0, 8).map((row) => (
            <p className="text-sm" key={`${row.outcome}-${row.rowNumber}`}>{t("importRow")} {row.rowNumber}: {row.issues.map((issue) => issueText(issue)).join(" ")}</p>
          ))}
        </section>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {preview && (preview.errorCount > 0 || (result?.failed ?? 0) > 0) ? (
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={downloadErrors}>{t("importDownloadErrors")}</button>
        ) : null}
        {phase === "done" ? (
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => { setPreview(null); setResult(null); setStoredFile(null); setPhase("idle"); }}>{t("importAnother")}</button>
        ) : null}
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{phase === "done" ? t("importDone") : t("closeDrawer")}</button>
        {phase !== "done" ? (
          <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-import-confirm" disabled={!canImport || busy || readyCount === 0 || !productNameMapped} type="button" onClick={() => { void confirmImport(); }}>
            {phase === "importing" ? t("importBusy") : t("importConfirm")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function mappingStatusKey(status: ProductImportMappedColumn["status"]) {
  if (status === "mapped") return "importMapMapped";
  if (status === "ignored") return "importMapIgnored";
  if (status === "conflict") return "importMapConflict";
  return "importMapReview";
}

function mappingFieldLabel(field: ProductImportColumn | "ignore" | null, t: (key: string) => string) {
  if (field === "ignore") return t("importMapIgnore");
  if (!field) return t("importMapNone");
  const key = `importField_${field}`;
  const label = t(key);
  return label === key ? field : label;
}

function Summary({ label, testId, value }: { label: string; testId?: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3" data-testid={testId}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function downloadText(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
