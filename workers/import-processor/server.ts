import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { EmbeddedImageAnchor } from "../../features/products/product-import-images";
import { MetadataReadError, readWorkbookMetadata } from "../../features/products/product-import-metadata";
import { loadAnchorsForRows, readWorkbookPreviewSource } from "../../features/products/product-import-preview-sheet";
import { loadCachedWorkbook, resetPreviewCacheForTests } from "../../features/products/product-import-preview-cache";
import { buildLargeImportPreview, previewSourceRowNumbers, type PreviewCatalogItem, type PreviewEdit, type PreviewFilter, type PreviewPageSize } from "../../features/products/product-import-preview";
import { IMPORT_CONTAINER_ALLOWED_HOSTS, IMPORT_METADATA_MAX_COMPRESSED_BYTES, IMPORT_PROCESS_MEMORY_STOP_BYTES } from "../../features/products/product-import-process";
import type { ProductImportColumnChoice } from "../../features/products/product-import";

const token = process.env.IMPORT_CONTAINER_TOKEN || "";
const allowed = new Set<string>(IMPORT_CONTAINER_ALLOWED_HOSTS);

createServer((request, response) => {
  void handle(request, response).catch(() => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: "download_failed", ok: false }));
  });
}).listen(8080);

async function handle(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) {
  if (request.method === "GET" && request.url === "/ping") {
    response.writeHead(200);
    response.end("ok");
    return;
  }
  if (request.method !== "POST" || (request.url !== "/metadata" && request.url !== "/preview")) {
    response.writeHead(404);
    response.end();
    return;
  }
  if (!token || request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401);
    response.end();
    return;
  }
  const rawBody = await readBody(request, request.url === "/preview" ? 1_500_000 : 100_000);
  if (request.url === "/preview" && rawBody.length > 1_500_000) {
    response.writeHead(422, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: "preview_limit", ok: false }));
    return;
  }
  const body = JSON.parse(rawBody) as {
    cacheKey?: string;
    catalog?: PreviewCatalogItem[];
    categories?: string[];
    choices?: ProductImportColumnChoice[];
    edits?: PreviewEdit[];
    filter?: PreviewFilter;
    includeImages?: boolean;
    mappedPage?: number;
    page?: number;
    pageSize?: PreviewPageSize;
    sheetName?: string;
    signedUrl?: string;
  };
  const signedUrl = new URL(String(body.signedUrl || ""));
  if (signedUrl.protocol !== "https:" || !allowed.has(signedUrl.host)) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: "unsafe_workbook", ok: false }));
    return;
  }
  if (request.url === "/preview") {
    const cacheKey = String(body.cacheKey || "");
    let downloadMs = 0;
    let parseMs = 0;
    const loaded = await loadCachedWorkbook(cacheKey, async () => {
      const directory = await mkdtemp(join(tmpdir(), "ego-import-"));
      const cachedPath = join(directory, "workbook.xlsx");
      try {
        const downloadStarted = Date.now();
        await download(signedUrl, cachedPath);
        downloadMs = Date.now() - downloadStarted;
        const parseStarted = Date.now();
        const source = await readWorkbookPreviewSource(cachedPath, String(body.sheetName || ""));
        parseMs = Date.now() - parseStarted;
        return { directory, filePath: cachedPath, images: source.images, rows: source.rows };
      } catch (error) {
        await rm(directory, { force: true, recursive: true });
        throw error;
      }
    });
    try {
      const heap = process.memoryUsage().heapUsed;
      if (heap > IMPORT_PROCESS_MEMORY_STOP_BYTES) {
        resetPreviewCacheForTests();
        throw new Error("memory_limit");
      }
      const includeImages = body.includeImages !== false;
      const previewInput = {
        catalog: body.catalog ?? [],
        categories: body.categories,
        choices: body.choices,
        edits: body.edits,
        filter: body.filter,
        mappedPage: body.mappedPage,
        page: body.page,
        pageSize: body.pageSize,
        sheetName: String(body.sheetName || ""),
      };
      const pageImages = !includeImages
        ? []
        : loaded.filePath
          ? await loadPageImages(loaded.filePath, loaded.images, loaded.rows, previewInput)
          : loaded.images;
      const preview = buildLargeImportPreview({
        ...previewInput,
        images: pageImages,
        rows: loaded.rows,
      });
      const payload = JSON.stringify({
        diagnostics: {
          cacheHit: loaded.cacheHit,
          downloadMs: loaded.cacheHit ? 0 : downloadMs,
          heapMb: Math.round(heap / 1024 / 1024),
          images: includeImages ? 1 : 0,
          parseMs: loaded.cacheHit ? 0 : parseMs,
          responseBytes: Buffer.byteLength(JSON.stringify(preview)),
        },
        ok: true,
        preview,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(payload);
      return;
    } catch (error) {
      const named = error instanceof Error ? error.message : "";
      const code = named === "preview_limit" || named === "worksheet_limit" || named === "unsafe_workbook" || named === "malformed_file" || named === "memory_limit" ? named : "download_failed";
      response.writeHead(code === "download_failed" ? 502 : 422, { "content-type": "application/json" });
      response.end(JSON.stringify({ errorCode: code, ok: false }));
      return;
    }
  }
  const directory = await mkdtemp(join(tmpdir(), "ego-import-"));
  const filePath = join(directory, "workbook.xlsx");
  try {
    await download(signedUrl, filePath);
    const metadata = await readWorkbookMetadata(filePath);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, ...metadata }));
  } catch (error) {
    const named = error instanceof Error ? error.message : "";
    const code = error instanceof MetadataReadError ? error.code : named === "preview_limit" || named === "worksheet_limit" || named === "unsafe_workbook" || named === "malformed_file" || named === "memory_limit" ? named : "download_failed";
    response.writeHead(code === "download_failed" ? 502 : 422, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: code, ok: false }));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function loadPageImages(
  filePath: string,
  images: EmbeddedImageAnchor[],
  rows: string[][],
  input: {
    catalog: PreviewCatalogItem[];
    categories?: string[];
    choices?: ProductImportColumnChoice[];
    edits?: PreviewEdit[];
    filter?: PreviewFilter;
    mappedPage?: number;
    page?: number;
    pageSize?: PreviewPageSize;
    sheetName: string;
  },
) {
  const planned = buildLargeImportPreview({ ...input, images, rows });
  const pageRows = [...planned.excel.rows.map((row) => row.rowNumber), ...planned.mapped.rows.map((row) => row.rowNumber)];
  return loadAnchorsForRows(filePath, images, previewSourceRowNumbers(rows), pageRows);
}

async function download(url: URL, filePath: string) {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.log("container-download-error " + message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 120));
    throw new Error("download_failed");
  }
  if (!response.ok || !response.body) {
    console.log("container-download " + response.status);
    throw new Error("download_failed");
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IMPORT_METADATA_MAX_COMPRESSED_BYTES) throw new MetadataReadError("unsafe_workbook");
  let seen = 0;
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    new Transform({
      transform(chunk, _encoding, callback) {
        seen += chunk.length;
        if (seen > IMPORT_METADATA_MAX_COMPRESSED_BYTES) callback(new MetadataReadError("unsafe_workbook"));
        else callback(null, chunk);
      },
    }),
    createWriteStream(filePath),
  );
}

function readBody(request: import("node:http").IncomingMessage, maxBytes: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("preview_limit"));
        request.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
