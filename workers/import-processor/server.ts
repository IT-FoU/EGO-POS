import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MetadataReadError, readWorkbookMetadata } from "../../features/products/product-import-metadata";
import { IMPORT_CONTAINER_ALLOWED_HOSTS, IMPORT_METADATA_MAX_COMPRESSED_BYTES } from "../../features/products/product-import-process";

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
  if (request.method !== "POST" || request.url !== "/metadata") {
    response.writeHead(404);
    response.end();
    return;
  }
  if (!token || request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401);
    response.end();
    return;
  }
  const body = JSON.parse(await readBody(request)) as { signedUrl?: string };
  const signedUrl = new URL(String(body.signedUrl || ""));
  if (signedUrl.protocol !== "https:" || !allowed.has(signedUrl.host)) {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: "unsafe_workbook", ok: false }));
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "ego-import-"));
  const filePath = join(directory, "workbook.xlsx");
  try {
    await download(signedUrl, filePath);
    const metadata = await readWorkbookMetadata(filePath);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, ...metadata }));
  } catch (error) {
    const code = error instanceof MetadataReadError ? error.code : "download_failed";
    response.writeHead(code === "download_failed" ? 502 : 422, { "content-type": "application/json" });
    response.end(JSON.stringify({ errorCode: code, ok: false }));
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
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

function readBody(request: import("node:http").IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}
