import { PRODUCT_IMPORT_TUS_CHUNK_BYTES, PRODUCT_IMPORT_XLSX_MIME, tusMetadata } from "@/features/products/product-import-large";

export type LargeTusUpload = {
  abort: () => void;
  start: () => Promise<void>;
};

export function uploadLargeImportWithTus(input: {
  contentType?: string;
  endpoint: string;
  file: File;
  objectPath: string;
  onProgress: (loaded: number, total: number) => void;
  resumeUrl?: string | null;
  token: string;
}): LargeTusUpload {
  const controller = new AbortController();
  return {
    abort() {
      controller.abort();
    },
    async start() {
      let location = input.resumeUrl || "";
      let offset = 0;
      if (location) {
        const head = await tusRequest(location, "HEAD", input.token, controller.signal);
        if (head.ok) offset = headerNumber(head, "upload-offset");
        else location = "";
      }
      if (!location) {
        const created = await tusRequest(input.endpoint, "POST", input.token, controller.signal, {
          "upload-length": String(input.file.size),
          "upload-metadata": tusMetadata({
            bucketName: "product-import-temp",
            cacheControl: "3600",
            contentType: input.contentType || PRODUCT_IMPORT_XLSX_MIME,
            objectName: input.objectPath,
          }),
        });
        if (!created.ok) throw new Error("Upload could not be started.");
        const header = created.headers.get("location");
        if (!header) throw new Error("Upload location is missing.");
        location = new URL(header, input.endpoint).toString();
        sessionStorage.setItem(resumeKey(input.objectPath), location);
      }
      while (offset < input.file.size) {
        const end = Math.min(input.file.size, offset + PRODUCT_IMPORT_TUS_CHUNK_BYTES);
        const chunk = input.file.slice(offset, end);
        const patched = await fetch(location, {
          body: chunk,
          headers: tusHeaders(input.token, {
            "content-type": "application/offset+octet-stream",
            "upload-offset": String(offset),
          }),
          method: "PATCH",
          signal: controller.signal,
        });
        if (!patched.ok) throw new Error("Upload was interrupted.");
        offset = headerNumber(patched, "upload-offset") || end;
        input.onProgress(offset, input.file.size);
      }
      sessionStorage.removeItem(resumeKey(input.objectPath));
    },
  };
}

export function readLargeImportResumeUrl(objectPath: string) {
  return sessionStorage.getItem(resumeKey(objectPath));
}

function resumeKey(objectPath: string) {
  return `ego-large-import:${objectPath}`;
}

function tusHeaders(token: string, extra?: Record<string, string>) {
  return {
    "tus-resumable": "1.0.0",
    "x-signature": token,
    ...(extra ?? {}),
  };
}

function tusRequest(url: string, method: "HEAD" | "POST", token: string, signal: AbortSignal, extra?: Record<string, string>) {
  return fetch(url, { headers: tusHeaders(token, extra), method, signal });
}

function headerNumber(response: Response, name: string) {
  const value = Number(response.headers.get(name));
  return Number.isFinite(value) ? value : 0;
}
