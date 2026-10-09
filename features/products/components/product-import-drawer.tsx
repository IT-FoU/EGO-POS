"use client";

import { useEffect, useRef, useState } from "react";
import { cancelLargeImportProcessAction, cancelLargeProductImportUploadAction, previewUnifiedProductFileAction, readLargeImportPreviewAction, readLargeImportProcessAction, startLargeImportProcessAction, startLargeProductImportUploadAction, verifyLargeProductImportUploadAction } from "@/features/products/actions";
import { ProductImportPreviewPanel } from "@/features/products/components/product-import-preview-panel";
import { chooseImportSurface, IMPORT_IMAGES_STORAGE_KEY, readImportImagesPreference, readStoredPreviewPageSize, type LargeImportPreview, type PreviewEdit, type PreviewFilter, type PreviewPageSize } from "@/features/products/product-import-preview";
import { type ProductImportColumnChoice } from "@/features/products/product-import";
import { readLargeImportResumeUrl, uploadLargeImportWithTus } from "@/features/products/product-import-large-tus";
import { fillProductsCopy, tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

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

export function ImportProductsDrawer({ canImport, onClose, onImported }: {
  canImport: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const fileRef = useRef<HTMLInputElement>(null);
  void onImported;
  const [storedFile, setStoredFile] = useState<StoredFile | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "validating">("idle");
  const [message, setMessage] = useState("");
  const [localFormat, setLocalFormat] = useState("");
  const [localSheet, setLocalSheet] = useState("");
  const [localSheets, setLocalSheets] = useState<Array<{ name: string }>>([]);
  const [largeUpload, setLargeUpload] = useState<LargeUploadState | null>(null);
  const [processView, setProcessView] = useState<ProcessView | null>(null);
  const [excelPreview, setExcelPreview] = useState<LargeImportPreview | null>(null);
  const [previewSheet, setPreviewSheet] = useState("");
  const [previewChoices, setPreviewChoices] = useState<ProductImportColumnChoice[]>([]);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const previewEdits = useRef<PreviewEdit[]>([]);
  const previewRequest = useRef(0);
  const autoPreview = useRef("");
  const importImages = useRef(true);
  const [importImagesChecked, setImportImagesChecked] = useState(true);
  const processPoll = useRef(0);
  const startedProcessJob = useRef("");
  const largeTransfer = useRef<ReturnType<typeof uploadLargeImportWithTus> | null>(null);

  function methodPayload() {
    return { letters: {}, method: "auto" as const };
  }

  async function loadLocalPreview(file: StoredFile, next: { choices?: ProductImportColumnChoice[]; edits?: PreviewEdit[]; filter?: PreviewFilter; mappedPage?: number; page?: number; pageSize?: PreviewPageSize; sheetName?: string }) {
    const choices = next.choices ?? previewChoices;
    const edits = (next.edits ?? previewEdits.current).slice(-200);
    const filter = next.filter ?? previewFilter;
    const pageSize = next.pageSize ?? readStoredPreviewPageSize(window.localStorage);
    const sheetName = next.sheetName ?? localSheet;
    previewEdits.current = edits;
    setPreviewChoices(choices);
    setPreviewFilter(filter);
    setPhase("validating");
    const requestId = previewRequest.current + 1;
    previewRequest.current = requestId;
    const response = await previewUnifiedProductFileAction({
      choices,
      edits,
      includeImages: importImages.current,
      ...methodPayload(),
      fileBase64: file.fileBase64,
      fileName: file.fileName,
      filter,
      mappedPage: next.mappedPage ?? 0,
      page: next.page ?? 0,
      pageSize,
      sheetName,
    });
    if (requestId !== previewRequest.current) return;
    setPhase("idle");
    if (!response.ok || !response.data) {
      setExcelPreview(null);
      const code = response.ok ? "" : response.error;
      setMessage(code?.includes("Permission denied") ? t("importPermissionDenied") : previewErrorMessage(code, t));
      return;
    }
    const data = response.data as { format: string | null; preview: LargeImportPreview; selectedSheet: string | null; sheets: Array<{ name: string }> };
    setLocalFormat(data.format ?? "");
    setLocalSheet(data.selectedSheet ?? "");
    setLocalSheets(data.sheets ?? []);
    setMessage("");
    setExcelPreview(data.preview);
  }

  async function beginLargeUpload(file: File, idempotencyKey: string) {
    processPoll.current += 1;
    previewRequest.current += 1;
    setProcessView(null);
    setLargeUpload((current) => current ? { ...current, byteSize: file.size, file, fileName: file.name, idempotencyKey, percent: 0, status: "uploading" } : current);
    largeTransfer.current?.abort();
    setStoredFile(null);
    setLocalFormat("");
    setLocalSheets([]);
    setExcelPreview(null);
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
      includeImages: importImages.current,
      ...methodPayload(),
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
    const stored = readImportImagesPreference(window.localStorage);
    importImages.current = stored;
    setImportImagesChecked(stored);
  }, []);

  useEffect(() => {
    if (processView?.status !== "ready") return;
    if (autoPreview.current === processView.processId) return;
    autoPreview.current = processView.processId;
    const sheetName = processView.sheets[0]?.name ?? "";
    setPreviewSheet(sheetName);
    void loadExcelPreview({ mappedPage: 0, page: 0, sheetName });
  }, [processView?.processId, processView?.status]);

  useEffect(() => {
    if (!largeUpload || largeUpload.status !== "uploaded") return;
    if (startedProcessJob.current === largeUpload.jobId) return;
    startedProcessJob.current = largeUpload.jobId;
    void beginMetadata();
  }, [largeUpload?.jobId, largeUpload?.status]);

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

  function reloadPreview(next: { choices?: ProductImportColumnChoice[]; edits?: PreviewEdit[]; filter?: PreviewFilter; mappedPage?: number; page?: number; pageSize?: PreviewPageSize; sheetName?: string }) {
    if (processView?.status === "ready") {
      void loadExcelPreview(next);
      return;
    }
    if (storedFile) void loadLocalPreview(storedFile, next);
  }

  async function onLocalSheetChange(sheetName: string) {
    if (!storedFile || !confirmDiscardPreviewEdits()) return;
    previewEdits.current = [];
    setPreviewChoices([]);
    setLocalSheet(sheetName);
    await loadLocalPreview(storedFile, { choices: [], edits: [], mappedPage: 0, page: 0, sheetName });
  }

  async function onFileChange(file: File | undefined) {
    if (!file) return;
    previewRequest.current += 1;
    const surface = chooseImportSurface(file.name, file.size);
    setExcelPreview(null);
    setMessage("");
    previewEdits.current = [];
    setPreviewChoices([]);
    if (surface === "unified-upload") {
      const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
        setLargeUpload(null);
        setMessage(t("importIssue_malformed_file"));
        return;
      }
      await beginLargeUpload(file, idempotencyKeyFor(file));
      return;
    }
    setProcessView(null);
    setLargeUpload(null);
    if (surface === "rejected") {
      setStoredFile(null);
      setLocalFormat("");
      setLocalSheets([]);
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      const xlsx = extension === "xlsx";
      setMessage(t(xlsx ? "importIssue_large_file_too_large" : ["csv", "tsv", "xls", "ods"].includes(extension) ? "importIssue_file_too_large" : "importIssue_unsupported_file"));
      return;
    }
    setPhase("reading");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const stored = { fileBase64: bytesToBase64(bytes), fileName: file.name, size: file.size };
    setStoredFile(stored);
    await loadLocalPreview(stored, { choices: [], edits: [], mappedPage: 0, page: 0, sheetName: "" });
  }

  const busy = phase === "reading" || phase === "validating" || largeUpload?.status === "uploading" || largeUpload?.status === "verifying" || processView?.status === "queued" || processView?.status === "running";
  const fileLabel = storedFile?.fileName || largeUpload?.fileName || "";
  const progressLabel = progressText();
  const identityReady = Boolean(excelPreview && !excelPreview.notices.some((notice) => notice.code === "missing_field"));
  const sheetOptions = localSheets.length > 0 ? localSheets.map((sheet) => sheet.name) : (processView?.sheets.map((sheet) => sheet.name) ?? []);

  function progressText() {
    if (phase === "reading" || phase === "validating") return t("importProcessRunning");
    if (processView && processView.status !== "ready") return processStatusLabel(processView.status, t);
    if (largeUpload && largeUpload.status !== "uploaded") return `${largeStatusLabel(largeUpload.status, t)} ${largeUpload.percent}%`;
    if (excelPreview) return t("importProcessReady");
    if (largeUpload) return largeStatusLabel(largeUpload.status, t);
    return "";
  }

  function toggleImages() {
    const checked = !importImages.current;
    importImages.current = checked;
    setImportImagesChecked(checked);
    window.localStorage.setItem(IMPORT_IMAGES_STORAGE_KEY, checked ? "1" : "0");
    reloadPreview({});
  }

return (
    <div className="grid gap-4" data-ignores-selection="true" data-testid="products-import-workflow">
      {!canImport ? <p className="text-sm font-semibold text-danger">{t("importPermissionDenied")}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm font-semibold" data-testid="products-import-file" disabled={!canImport || busy} type="button" onClick={() => fileRef.current?.click()}>
          {t("importChooseFile")}
        </button>
        <button aria-checked={importImagesChecked} className="inline-flex h-11 items-center gap-3 rounded-full border border-border px-4 text-sm font-semibold" data-testid="products-import-images" role="switch" type="button" onClick={toggleImages}>
          <span>{t("importImages")}</span>
          <span className={importImagesChecked ? "rounded-full bg-neutral-950 px-2 py-0.5 text-xs text-white" : "rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-950"} data-testid="products-import-images-state">{importImagesChecked ? "ON" : "OFF"}</span>
        </button>
        <input ref={fileRef} accept=".csv,.tsv,.xlsx,.xls,.ods,text/csv,text/tab-separated-values" className="hidden" data-testid="products-import-input" type="file" onChange={(event) => { void onFileChange(event.target.files?.[0]); event.target.value = ""; }}/>
      </div>
      {fileLabel ? (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="products-import-progress">
          <span className="font-semibold" data-testid="products-import-filename">{fileLabel}</span>
          <span data-testid="products-import-large-status">{progressLabel}</span>
          {largeUpload && (largeUpload.status === "uploading" || largeUpload.status === "verifying") ? (
            <button className="h-9 rounded-full border border-border px-3 text-sm font-semibold" data-testid="products-import-large-cancel" type="button" onClick={() => { void cancelLargeUpload(); }}>{t("importLargeCancel")}</button>
          ) : null}
          {sheetOptions.length > 1 ? (
            <label className="flex items-center gap-2">
              {t("importSheet")}
              <select className="h-9 rounded-md border border-border bg-background px-2" data-testid="products-import-sheet" value={localSheet || previewSheet} onChange={(event) => {
                if (storedFile) { void onLocalSheetChange(event.target.value); return; }
                if (!confirmDiscardPreviewEdits()) return;
                previewEdits.current = [];
                setPreviewSheet(event.target.value);
                setExcelPreview(null);
                autoPreview.current = "";
                void loadExcelPreview({ choices: [], edits: [], mappedPage: 0, page: 0, sheetName: event.target.value });
              }}>
                {sheetOptions.map((sheet) => <option key={sheet} value={sheet}>{sheet}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      {excelPreview ? (
        <ProductImportPreviewPanel
          preview={excelPreview}
          onEdit={(edit) => {
            const current = previewEdits.current.filter((item) => !(item.rowNumber === edit.rowNumber && item.field === edit.field));
            reloadPreview({ edits: [...current, edit].slice(-200), mappedPage: excelPreview.mapped.page, page: excelPreview.excel.page });
          }}
          onFilter={(filter) => { reloadPreview({ filter, mappedPage: 0, page: 0 }); }}
          onPage={(page) => { reloadPreview({ mappedPage: page, page }); }}
          onPageSize={(pageSize) => { reloadPreview({ mappedPage: 0, page: 0, pageSize }); }}
        />
      ) : null}
      {message ? <p className={cn("text-sm font-semibold", "text-danger")} data-testid="products-import-message">{message}</p> : null}
      {fileLabel ? (
        <div className="flex flex-wrap justify-end gap-2">
          <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("closeDrawer")}</button>
          <div className="grid justify-items-end gap-1">
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-identity-ready={identityReady ? "yes" : "no"} data-testid="products-import-confirm" disabled type="button">{t("importConfirm")}</button>
            <p className="text-xs text-muted-foreground" data-testid="products-import-save-awaiting">{t("importSaveAwaiting")}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function terminalProcess(status: string) {
  return status === "ready" || status === "failed" || status === "cancelled" || status === "expired";
}

function previewErrorMessage(code: string | undefined, t: (key: string) => string) {
  if (!code) return t("importPreviewUnavailable");
  if (code.includes("Permission denied")) return t("importPermissionDenied");
  const issueKey = `importIssue_${code}`;
  const issue = t(issueKey);
  if (issue !== issueKey) return issue;
  if (code === "preview_closed") return t("importPreviewClosed");
  if (code === "preview_limit" || code === "memory_limit") return t("importPreviewLimit");
  if (code === "worksheet_limit") return t("importPreviewWorksheetLimit");
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
