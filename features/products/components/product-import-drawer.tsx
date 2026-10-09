"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { cancelLargeImportProcessAction, cancelLargeProductImportUploadAction, importProductsFileAction, previewProductImportFileAction, readLargeImportPreviewAction, readLargeImportProcessAction, startLargeImportProcessAction, startLargeProductImportUploadAction, uploadProductImageAction, verifyLargeProductImportUploadAction } from "@/features/products/actions";
import { ProductImportPreviewPanel } from "@/features/products/components/product-import-preview-panel";
import { readStoredPreviewPageSize, type LargeImportPreview, type PreviewEdit, type PreviewFilter, type PreviewPageSize } from "@/features/products/product-import-preview";
import { optimizeProductImageFile } from "@/features/products/product-image-optimize";
import type { ProductImportEmbeddedImage } from "@/features/products/product-import-images";
import {
  PRODUCT_IMPORT_BATCH_SIZE,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_MAX_CHARS,
  PRODUCT_IMPORT_TEMPLATE_CSV,
  type ProductImportColumn,
  type ProductImportColumnChoice,
  type ProductImportIssue,
  type ProductImportMappedColumn,
  type ProductImportPreviewRow,
} from "@/features/products/product-import";
import { PRODUCT_IMPORT_LARGE_MAX_BYTES } from "@/features/products/product-import-large";
import { readLargeImportResumeUrl, uploadLargeImportWithTus } from "@/features/products/product-import-large-tus";
import { displayProductUnitName, fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

type PreviewData = {
  columns: ProductImportMappedColumn[];
  errorCount: number;
  fileIssues: ProductImportIssue[];
  format: string | null;
  imageCount: number;
  imageReviewCount: number;
  images: ProductImportEmbeddedImage[];
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
  size: number;
};

type LargeUploadState = {
  byteSize: number;
  file: File;
  fileName: string;
  idempotencyKey: string;
  jobId: string;
  objectPath: string;
  percent: number;
  status: "uploading" | "verifying" | "uploaded" | "failed" | "cancelled";
};

type ProcessView = {
  errorCode: string | null;
  processId: string;
  rowCount: number | null;
  sheets: Array<{ name: string; rows: number }>;
  status: string;
};

type ResultRow = {
  issues: ProductImportIssue[];
  outcome: "created" | "failed" | "skipped";
  productId?: string;
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
  const [includeImages, setIncludeImages] = useState(true);
  const [largeUpload, setLargeUpload] = useState<LargeUploadState | null>(null);
  const [processView, setProcessView] = useState<ProcessView | null>(null);
  const [excelPreview, setExcelPreview] = useState<LargeImportPreview | null>(null);
  const [previewSheet, setPreviewSheet] = useState("");
  const [previewChoices, setPreviewChoices] = useState<ProductImportColumnChoice[]>([]);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const previewEdits = useRef<PreviewEdit[]>([]);
  const previewRequest = useRef(0);
  const autoPreview = useRef("");
  const processPoll = useRef(0);
  const largeTransfer = useRef<ReturnType<typeof uploadLargeImportWithTus> | null>(null);
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

  async function beginLargeUpload(file: File, idempotencyKey: string) {
    processPoll.current += 1;
    setProcessView(null);
    largeTransfer.current?.abort();
    setStoredFile(null);
    setPreview(null);
    setResult(null);
    setMessage("");
    setPhase("idle");
    const started = await startLargeProductImportUploadAction({
      byteSize: file.size,
      fileName: file.name,
      idempotencyKey,
    });
    if (!started.ok || !started.data) {
      setLargeUpload(null);
      setMessage(started.error?.includes("Permission denied") ? t("importPermissionDenied") : started.error || t("importLargeFailed"));
      return;
    }
    const upload = started.data;
    if (upload.status === "uploaded" || !upload.token || !upload.tusEndpoint) {
      setLargeUpload({
        byteSize: file.size,
        file,
        fileName: file.name,
        idempotencyKey,
        jobId: upload.jobId,
        objectPath: upload.objectPath,
        percent: upload.status === "uploaded" ? 100 : 0,
        status: upload.status === "uploaded" ? "uploaded" : "failed",
      });
      return;
    }
    setLargeUpload({
      byteSize: file.size,
      file,
      fileName: file.name,
      idempotencyKey,
      jobId: upload.jobId,
      objectPath: upload.objectPath,
      percent: 0,
      status: "uploading",
    });
    const transfer = uploadLargeImportWithTus({
      endpoint: upload.tusEndpoint,
      file,
      objectPath: upload.objectPath,
      onProgress: (loaded, total) => {
        setLargeUpload((current) => current && current.jobId === upload.jobId ? { ...current, percent: Math.min(100, Math.round((loaded / total) * 100)) } : current);
      },
      resumeUrl: readLargeImportResumeUrl(upload.objectPath),
      token: upload.token,
    });
    largeTransfer.current = transfer;
    try {
      await transfer.start();
      setLargeUpload((current) => current && current.jobId === upload.jobId ? { ...current, percent: 100, status: "verifying" } : current);
      const verified = await verifyLargeProductImportUploadAction(upload.jobId);
      const status = verified.ok && verified.data?.status === "uploaded" ? "uploaded" : "failed";
      setLargeUpload((current) => current && current.jobId === upload.jobId ? { ...current, status } : current);
      if (status !== "uploaded") setMessage(t("importLargeFailed"));
    } catch {
      setLargeUpload((current) => current && current.jobId === upload.jobId && current.status !== "cancelled" ? { ...current, status: "failed" } : current);
      setMessage(t("importLargeFailed"));
    }
  }

  async function beginMetadata() {
    if (!largeUpload || largeUpload.status !== "uploaded") return;
    const started = await startLargeImportProcessAction(largeUpload.jobId);
    if (!started.ok || !started.data) {
      setMessage(started.error || t("importProcessFailed"));
      return;
    }
    let view = started.data as ProcessView;
    setProcessView(view);
    const token = processPoll.current + 1;
    processPoll.current = token;
    while (token === processPoll.current && !terminalProcess(view.status)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      if (token !== processPoll.current) return;
      const current = await readLargeImportProcessAction(view.processId);
      if (!current.ok || !current.data) break;
      view = current.data as ProcessView;
      setProcessView(view);
    }
  }

  function confirmDiscardPreviewEdits() {
    if (previewEdits.current.length === 0) return true;
    return window.confirm(t("importPreviewDiscard"));
  }

  async function loadExcelPreview(next: { choices?: ProductImportColumnChoice[]; edits?: PreviewEdit[]; filter?: PreviewFilter; mappedPage?: number; page?: number; pageSize?: PreviewPageSize; sheetName?: string }) {
    if (!processView || processView.status !== "ready") return;
    const sheetName = next.sheetName || previewSheet || processView.sheets[0]?.name || "";
    const choices = next.choices ?? previewChoices;
    const edits = (next.edits ?? previewEdits.current).slice(-200);
    const filter = next.filter ?? previewFilter;
    const pageSize = next.pageSize ?? readStoredPreviewPageSize(window.localStorage);
    previewEdits.current = edits;
    setPreviewChoices(choices);
    setPreviewFilter(filter);
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    const request = {
      choices,
      edits,
      filter,
      mappedPage: next.mappedPage ?? 0,
      page: next.page ?? 0,
      pageSize,
      processId: processView.processId,
      sheetName,
    };
    let result = await readLargeImportPreviewAction(request);
    for (let attempt = 0; attempt < 2 && requestId === previewRequest.current && !result.ok && result.error === "preview_unavailable"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (requestId !== previewRequest.current) return;
      result = await readLargeImportPreviewAction(request);
    }
    if (requestId !== previewRequest.current) return;
    if (!result.ok || !result.data) {
      setMessage(previewErrorMessage(result.ok ? "" : result.error, t));
      return;
    }
    setMessage("");
    setExcelPreview(result.data);
  }

  useEffect(() => {
    if (processView?.status !== "ready") return;
    if (autoPreview.current === processView.processId) return;
    autoPreview.current = processView.processId;
    const sheetName = processView.sheets[0]?.name ?? "";
    setPreviewSheet(sheetName);
    void loadExcelPreview({ mappedPage: 0, page: 0, sheetName });
  }, [processView?.processId, processView?.status]);

  async function cancelMetadata() {
    if (!processView) return;
    processPoll.current += 1;
    const cancelled = await cancelLargeImportProcessAction(processView.processId);
    if (cancelled.ok && cancelled.data) setProcessView(cancelled.data as ProcessView);
  }

  async function cancelLargeUpload() {
    if (!largeUpload) return;
    largeTransfer.current?.abort();
    const cancelled = await cancelLargeProductImportUploadAction(largeUpload.jobId);
    setLargeUpload((current) => current ? { ...current, status: cancelled.ok ? "cancelled" : "failed" } : current);
    if (!cancelled.ok) setMessage(t("importLargeFailed"));
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return;
    if (file.name.toLowerCase().endsWith(".xlsx") && file.size > PRODUCT_IMPORT_MAX_CHARS) {
      if (file.size > PRODUCT_IMPORT_LARGE_MAX_BYTES) {
    setProcessView(null);
    setLargeUpload(null);
    setStoredFile(null);
        setPreview(null);
        setResult(null);
        setMessage(t("importIssue_large_file_too_large"));
        return;
      }
      const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
        setLargeUpload(null);
        setMessage(t("importIssue_malformed_file"));
        return;
      }
      await beginLargeUpload(file, idempotencyKeyFor(file));
      return;
    }
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
    setLargeUpload(null);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = { fileBase64: bytesToBase64(bytes), fileName: file.name, size: file.size };
    setStoredFile(stored);
    setIncludeImages(true);
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
      setMessage(fillProductsCopy(t("importBatchProgress"), { created: String(created) }));
      if (batch.remaining <= 0) break;
    }
    let imageFailures = 0;
    if (includeImages) {
      for (const row of rows) {
        const image = preview.images.find((item) => item.status === "mapped" && item.rowNumber === row.rowNumber && item.dataUrl);
        if (row.outcome !== "created" || !row.productId || !image?.dataUrl) continue;
        try {
          const optimized = await optimizeProductImageFile(await fileFromDataUrl(image.dataUrl));
          const form = new FormData();
          form.set("main", optimized.main);
          form.set("thumb", optimized.thumb);
          form.set("setProductMain", "true");
          const uploaded = await uploadProductImageAction(row.productId, form);
          if (!uploaded.ok) imageFailures += 1;
        } catch {
          imageFailures += 1;
        }
      }
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
    setMessage(imageFailures > 0 ? t("importImageAttachFailed") : "");
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
  const mappedImages = preview?.images ?? [];
  const imageByRow = new Map(mappedImages.filter((image) => image.status === "mapped" && image.dataUrl).map((image) => [image.rowNumber, image]));
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
        {storedFile ? <span className="text-sm text-muted-foreground" data-testid="products-import-filesize">{formatImportFileSize(storedFile.size)}</span> : null}
        {largeUpload ? <span className="text-sm text-muted-foreground" data-testid="products-import-filesize">{formatImportFileSize(largeUpload.byteSize)}</span> : null}
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
      {largeUpload ? (
        <section className="grid gap-3 rounded-lg border border-border bg-background p-4" data-testid="products-import-large-upload">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold" data-testid="products-import-large-name">{largeUpload.fileName}</p>
              <p className="text-sm text-muted-foreground">{formatImportFileSize(largeUpload.byteSize)}</p>
            </div>
            <p className="text-sm font-semibold" data-testid="products-import-large-status">{largeStatusLabel(largeUpload.status, t)}</p>
          </div>
          <p className="text-sm text-muted-foreground" data-testid="products-import-large-progress">{fillProductsCopy(t("importLargeProgress"), { percent: String(largeUpload.percent) })}</p>
          <p className="text-sm text-muted-foreground">{t("importLargeHint")}</p>
          <div className="flex flex-wrap gap-2">
            {largeUpload.status === "failed" || largeUpload.status === "cancelled" ? (
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-large-retry" type="button" onClick={() => { void beginLargeUpload(largeUpload.file, largeUpload.idempotencyKey); }}>{t("importLargeRetry")}</button>
            ) : null}
            {largeUpload.status === "uploading" || largeUpload.status === "verifying" ? (
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-large-cancel" type="button" onClick={() => { void cancelLargeUpload(); }}>{t("importLargeCancel")}</button>
            ) : null}
            {largeUpload.status === "uploaded" && (!processView || processView.status === "failed") ? (
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-process-start" type="button" onClick={() => { void beginMetadata(); }}>{t("importProcessStart")}</button>
            ) : null}
            {processView && (processView.status === "queued" || processView.status === "running") ? (
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-process-cancel" type="button" onClick={() => { void cancelMetadata(); }}>{t("importProcessCancel")}</button>
            ) : null}
          </div>
          {processView ? (
            <div data-testid="products-import-process">
              <p className="text-sm font-semibold" data-testid="products-import-process-status">{processStatusLabel(processView.status, t)}</p>
              <p className="text-sm text-muted-foreground">{t("importProcessHint")}</p>
              {processView.sheets.length > 0 ? (
                <ul className="grid gap-1 text-sm" data-testid="products-import-process-sheets">
                  {processView.sheets.map((sheet) => <li key={sheet.name}>{sheet.name}: {sheet.rows} {t("importProcessRows")}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
          {processView?.status === "ready" ? (
            <div className="flex flex-wrap items-center gap-2">
              <select className="h-11 rounded-md border border-border bg-background px-3 text-sm" data-testid="products-import-preview-sheet" value={previewSheet || processView.sheets[0]?.name || ""} onChange={(event) => {
                if (!confirmDiscardPreviewEdits()) return;
                previewEdits.current = [];
                setPreviewChoices([]);
                setPreviewSheet(event.target.value);
                setExcelPreview(null);
                void loadExcelPreview({ choices: [], edits: [], mappedPage: 0, page: 0, sheetName: event.target.value });
              }}>
                {processView.sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
              </select>
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-import-preview-excel" type="button" onClick={() => { void loadExcelPreview({ mappedPage: 0, page: 0, sheetName: previewSheet || processView.sheets[0]?.name || "" }); }}>{t("importPreviewExcel")}</button>
            </div>
          ) : null}
        </section>
      ) : null}
      {excelPreview ? (
        <ProductImportPreviewPanel
          preview={excelPreview}
          onEdit={(edit) => {
            const current = previewEdits.current.filter((item) => !(item.rowNumber === edit.rowNumber && item.field === edit.field));
            void loadExcelPreview({ edits: [...current, edit].slice(-200), mappedPage: excelPreview.mapped.page, page: excelPreview.mapped.page });
          }}
          onFilter={(filter) => { void loadExcelPreview({ filter, mappedPage: 0, page: 0 }); }}
          onMapping={(index, field) => {
            if (!confirmDiscardPreviewEdits()) return;
            previewEdits.current = [];
            const choices = excelPreview.columns.map((column) => ({
              field: column.index === index ? (field || null) as ProductImportColumnChoice["field"] : column.choice,
              index: column.index,
            }));
            void loadExcelPreview({ choices, edits: [], mappedPage: 0, page: 0 });
          }}
          onPage={(page) => { void loadExcelPreview({ mappedPage: page, page }); }}
          onPageSize={(pageSize) => { void loadExcelPreview({ mappedPage: 0, page: 0, pageSize }); }}
        />
      ) : null}
      <p className="text-sm text-muted-foreground">{t("importSampleHint")}</p>
      {mappingColumns.length > 0 ? (
        <section className="grid gap-3" data-testid="products-import-mapping">
          <div>
            <h3 className="text-base font-semibold">{t("importMappingTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("importMappingHint")}</p>
          </div>
          {!productNameMapped ? <p className="text-sm font-semibold text-danger" data-testid="products-import-name-required">{t("importMappingNameRequired")}</p> : null}
          {mappedImages.length > 0 ? (
            <div className="grid gap-2" data-testid="products-import-images">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input checked={includeImages} data-testid="products-import-include-images" disabled={busy} type="checkbox" onChange={(event) => setIncludeImages(event.target.checked)} />
                {t("importIncludeImages")}
              </label>
              <p className="text-sm text-muted-foreground">{fillProductsCopy(t("importImageCount"), { count: String(preview?.imageCount ?? 0), review: String(preview?.imageReviewCount ?? 0) })}</p>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {imageReviewReasons(mappedImages).map((reason) => (
                  <li data-testid={`products-import-image-reason-${reason}`} key={reason}>{t(`importImageReason_${reason}`)}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
      {message ? <p className={cn("text-sm font-semibold", phase === "importing" ? "text-muted-foreground" : "text-danger")} data-testid="products-import-message">{message}</p> : null}

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
                    <td className="p-3 font-semibold">
                      <div className="flex items-center gap-2">
                        {imageByRow.get(row.rowNumber)?.dataUrl ? <img alt="" className="size-10 rounded-md border border-border object-cover" data-testid={`products-import-thumb-${row.rowNumber}`} src={imageByRow.get(row.rowNumber)?.dataUrl ?? ""} /> : null}
                        <span>{row.productName || "-"}</span>
                      </div>
                      {reviewReasonsForRow(mappedImages, row.rowNumber).map((reason) => (
                        <div className="mt-1 text-xs text-muted-foreground" key={`${row.rowNumber}-${reason}`}>{t(`importImageReason_${reason}`)}</div>
                      ))}
                    </td>
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
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => { setPreview(null); setResult(null); setStoredFile(null); setLargeUpload(null); setPhase("idle"); }}>{t("importAnother")}</button>
        ) : null}
        <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{phase === "done" ? t("importDone") : t("closeDrawer")}</button>
        {phase !== "done" && !largeUpload ? (
          <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-import-confirm" disabled={!canImport || busy || readyCount === 0 || !productNameMapped} type="button" onClick={() => { void confirmImport(); }}>
            {phase === "importing" ? t("importBusy") : t("importConfirm")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function imageReviewReasons(images: ProductImportEmbeddedImage[]) {
  return [...new Set(images.flatMap((image) => image.status === "review" && image.reason ? [image.reason] : []))];
}

function reviewReasonsForRow(images: ProductImportEmbeddedImage[], rowNumber: number) {
  return [...new Set(images.flatMap((image) => image.status === "review" && image.rowNumber === rowNumber && image.reason ? [image.reason] : []))];
}

function formatImportFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function terminalProcess(status: string) {
  return status === "ready" || status === "failed" || status === "cancelled" || status === "expired";
}

function previewErrorMessage(code: string | undefined, t: (key: string) => string) {
  if (code === "preview_closed") return t("importPreviewClosed");
  if (code === "preview_limit" || code === "memory_limit") return t("importPreviewLimit");
  if (code === "preview_unavailable" || code === "preview_not_ready") return t("importPreviewUnavailable");
  return t("importPreviewUnavailable");
}

function processStatusLabel(status: string, t: (key: string) => string) {
  if (status === "ready") return t("importProcessReady");
  if (status === "failed") return t("importProcessFailed");
  if (status === "cancelled") return t("importProcessCancelled");
  if (status === "running") return t("importProcessRunning");
  return t("importProcessQueued");
}

function largeStatusLabel(status: LargeUploadState["status"], t: (key: string) => string) {
  if (status === "uploaded") return t("importLargeUploaded");
  if (status === "verifying") return t("importLargeVerifying");
  if (status === "failed") return t("importLargeFailed");
  if (status === "cancelled") return t("importLargeCancelled");
  return t("importLargeUploading");
}

function idempotencyKeyFor(file: File) {
  const stamp = `ego-large-import-key:${file.name}:${file.size}:${file.lastModified}`;
  const existing = sessionStorage.getItem(stamp);
  if (existing) return existing;
  const key = crypto.randomUUID();
  sessionStorage.setItem(stamp, key);
  return key;
}

function fileFromDataUrl(dataUrl: string) {
  return fetch(dataUrl).then(async (response) => {
    const blob = await response.blob();
    return new File([blob], "import-image", { type: blob.type || "image/png" });
  });
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
