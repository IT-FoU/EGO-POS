"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importProductsAction, previewProductImportAction } from "@/features/products/actions";
import {
  PRODUCT_IMPORT_BATCH_SIZE,
  PRODUCT_IMPORT_TEMPLATE_CSV,
  type ProductImportIssue,
  type ProductImportPreviewRow,
} from "@/features/products/product-import";
import { displayProductUnitName, fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

type PreviewData = {
  errorCount: number;
  fileIssues: ProductImportIssue[];
  rows: ProductImportPreviewRow[];
  validCount: number;
  warningCount: number;
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
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [phase, setPhase] = useState<"idle" | "validating" | "importing" | "done">("idle");
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

  async function validateFile(text: string) {
    setPhase("validating");
    setResult(null);
    setMessage("");
    const response = await previewProductImportAction(text);
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
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv")) {
      setCsvText("");
      setFileName(file.name);
      setPreview(null);
      setResult(null);
      setMessage(t("importCsvOnly"));
      return;
    }
    const text = await file.text();
    setFileName(file.name);
    setCsvText(text);
    await validateFile(text);
  }

  async function confirmImport() {
    if (!csvText || !preview || preview.validCount + preview.warningCount === 0) return;
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
      const response = await importProductsAction(csvText, { afterRow, limit: PRODUCT_IMPORT_BATCH_SIZE });
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
  const busy = phase === "validating" || phase === "importing";

  return (
    <div className="grid gap-5" data-testid="products-import-workflow">
      <section className="rounded-lg border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
        {t("importNotice")}
      </section>
      {!canImport ? <p className="text-sm font-semibold text-danger">{t("importPermissionDenied")}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-template" type="button" onClick={downloadTemplate}>
          {t("importDownloadTemplate")}
        </button>
        <button className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-file" disabled={!canImport || busy} type="button" onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden="true" className="size-4"/>
          {t("importChooseFile")}
        </button>
        <button className="inline-flex h-11 items-center rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid="products-import-validate" disabled={!canImport || !csvText || busy} type="button" onClick={() => validateFile(csvText)}>
          {phase === "validating" ? t("importValidating") : t("importValidate")}
        </button>
        <span className="rounded-full border border-border px-3 py-1 text-sm font-semibold">CSV</span>
        {fileName ? <span className="text-sm text-muted-foreground">{fileName}</span> : null}
        <input ref={fileRef} accept=".csv,text/csv" className="hidden" data-testid="products-import-input" type="file" onChange={(event) => { void onFileChange(event.target.files?.[0]); event.target.value = ""; }}/>
      </div>
      <p className="text-sm text-muted-foreground">{t("importSampleHint")}</p>
      {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}

      {preview ? (
        <section className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-4" data-testid="products-import-summary">
            <Summary label={t("importValid")} value={preview.validCount}/>
            <Summary label={t("importWarnings")} value={preview.warningCount}/>
            <Summary label={t("importError")} value={preview.errorCount}/>
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
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => { setPreview(null); setResult(null); setCsvText(""); setFileName(""); setPhase("idle"); }}>{t("importAnother")}</button>
        ) : null}
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{phase === "done" ? t("importDone") : t("closeDrawer")}</button>
        {phase !== "done" ? (
          <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-import-confirm" disabled={!canImport || busy || readyCount === 0} type="button" onClick={() => { void confirmImport(); }}>
            {phase === "importing" ? t("importBusy") : t("importConfirm")}
          </button>
        ) : null}
      </div>
    </div>
  );
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

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
