import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

export { ContainerProxy };
import pg from "pg";
import { isTempImportObjectPath } from "../../features/products/product-import-large";
import {
  IMPORT_CONTAINER_ALLOWED_HOSTS,
  parseImportProcessMessage,
} from "../../features/products/product-import-process";

const QA = "arkhwskvcnntluoakmef";
const PRODUCTION = "ieutdqnlfiiaawctapor";
const PERMANENT = new Set(["malformed_file", "memory_limit", "time_limit", "unsafe_workbook"]);

const CONTAINER_INSTANCE = "preview-table";
const CATALOG_LIMIT = 20_000;

type Env = {
  HYPERDRIVE: { connectionString: string };
  IMPORT_CONTAINER: Parameters<typeof getContainer>[0];
  IMPORT_CONTAINER_TOKEN: string;
  IMPORT_PREVIEW_TOKEN: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
};

type PreviewCatalogItem = { barcode: string; productName: string; sku: string; unit: string };

type QueueBatch = {
  messages: Array<{
    ack(): void;
    attempts: number;
    body: { processId: string };
    retry(options?: { delaySeconds?: number }): void;
  }>;
};

export class ImportMetadataContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "1m";
  enableInternet = false;
  interceptHttps = true;
  allowedHosts = [...IMPORT_CONTAINER_ALLOWED_HOSTS];

  constructor(ctx: ConstructorParameters<typeof Container>[0], env: Env) {
    super(ctx, env);
    this.envVars = { IMPORT_CONTAINER_TOKEN: env.IMPORT_CONTAINER_TOKEN };
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/preview") return new Response(null, { status: 404 });
    if (!env.IMPORT_PREVIEW_TOKEN || request.headers.get("authorization") !== `Bearer ${env.IMPORT_PREVIEW_TOKEN}`) {
      return new Response(null, { status: 401 });
    }
    const connection = env.HYPERDRIVE?.connectionString || "";
    if (connection.includes(PRODUCTION) || !env.SUPABASE_URL?.includes(QA)) return json({ errorCode: "preview_unavailable", ok: false }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 100_000) return json({ errorCode: "preview_limit", ok: false }, 422);
      const body = JSON.parse(raw) as {
        choices?: Array<{ field?: string; index?: number }>;
        edits?: Array<{ field?: string; rowNumber?: number; value?: string }>;
        companyId?: string;
        filter?: string;
        mappedPage?: number;
        page?: number;
        pageSize?: number;
        processId?: string;
        sheetName?: string;
        userId?: string;
      };
      const processId = parseImportProcessMessage({ processId: body.processId }).processId;
      const companyId = String(body.companyId || "");
      const userId = String(body.userId || "");
      const sheetName = String(body.sheetName || "").slice(0, 80);
      if (!companyId || !userId || !sheetName) return json({ errorCode: "preview_unavailable", ok: false }, 422);
      const client = new pg.Client({ connectionString: connection });
      await client.connect();
      try {
        const current = await client.query(
          "select upload_id, company_id, user_id, status from product_import_processes where id = $1",
          [processId],
        );
        const row = current.rows[0] as { company_id: string; status: string; upload_id: string; user_id: string } | undefined;
        if (!row || row.company_id !== companyId || row.user_id !== userId) return json({ errorCode: "preview_unavailable", ok: false }, 403);
        if (row.status === "cancelled" || row.status === "expired") return json({ errorCode: "preview_closed", ok: false }, 422);
        if (row.status !== "ready") return json({ errorCode: "preview_not_ready", ok: false }, 422);
        const upload = await client.query(
          "select company_id, object_path, status, expires_at from product_import_uploads where id = $1",
          [row.upload_id],
        );
        const file = upload.rows[0] as { company_id: string; expires_at: Date; object_path: string; status: string } | undefined;
        if (!file || file.company_id !== companyId || file.status === "cancelled" || file.status === "expired" || !isTempImportObjectPath(file.object_path)) {
          return json({ errorCode: "preview_closed", ok: false }, 422);
        }
        if (file.expires_at.getTime() <= Date.now()) return json({ errorCode: "preview_closed", ok: false }, 422);
        const catalog = await loadCatalog(client, companyId);
        const categories = await loadCategories(client, companyId);
        const signedUrl = await signDownload(env, file.object_path);
        const container = getContainer(env.IMPORT_CONTAINER, CONTAINER_INSTANCE);
        const response = await container.fetch("http://container/preview", {
          body: JSON.stringify({
            cacheKey: `${processId}\n${sheetName}`,
            catalog,
            categories,
            choices: Array.isArray(body.choices) ? body.choices.slice(0, 40) : [],
            edits: cleanEdits(body.edits),
            filter: body.filter,
            mappedPage: body.mappedPage,
            page: body.page,
            pageSize: body.pageSize,
            sheetName,
            signedUrl,
          }),
          headers: {
            authorization: `Bearer ${env.IMPORT_CONTAINER_TOKEN}`,
            "content-type": "application/json",
          },
          method: "POST",
        });
        const payload = await response.json() as { diagnostics?: { cacheHit?: boolean; downloadMs?: number; heapMb?: number; parseMs?: number; responseBytes?: number }; errorCode?: string; ok?: boolean; preview?: unknown };
        const diagnostics = payload.diagnostics;
        if (diagnostics) {
          console.log(`import-preview cacheHit=${diagnostics.cacheHit ? 1 : 0} downloadMs=${diagnostics.downloadMs ?? 0} parseMs=${diagnostics.parseMs ?? 0} heapMb=${diagnostics.heapMb ?? 0} responseBytes=${diagnostics.responseBytes ?? 0}`);
        }
        if (!response.ok || !payload.ok || !payload.preview) {
          return json({ errorCode: String(payload.errorCode || "download_failed").slice(0, 40), ok: false }, response.status || 502);
        }
        return json({ ok: true, preview: payload.preview }, 200);
      } finally {
        await client.end();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "preview_unavailable";
      const code = message === "preview_limit" || message === "preview_closed" || message === "preview_not_ready" ? message : "preview_unavailable";
      console.log("import-preview-error " + code);
      return json({ errorCode: code, ok: false }, code === "preview_unavailable" ? 500 : 422);
    }
  },
  async queue(batch: QueueBatch, env: Env) {
    for (const message of batch.messages) {
      const outcome = await handleMessage(message.body, env, message.attempts).catch(() => "retry" as const);
      if (outcome === "retry") message.retry({ delaySeconds: 60 });
      else message.ack();
    }
  },
};

async function handleMessage(body: unknown, env: Env, attempts: number): Promise<"ack" | "retry"> {
  const connection = env.HYPERDRIVE?.connectionString || "";
  if (connection.includes(PRODUCTION) || !env.SUPABASE_URL?.includes(QA)) return "ack";
  let processId = "";
  try {
    processId = parseImportProcessMessage(body).processId;
  } catch {
    return "ack";
  }
  const client = new pg.Client({ connectionString: connection });
  await client.connect();
  try {
    const current = await client.query(
      "select status, heartbeat_at, attempt from product_import_processes where id = $1",
      [processId],
    );
    const row = current.rows[0] as { attempt: number; heartbeat_at: Date | null; status: string } | undefined;
    if (!row) return "ack";
    if (row.status === "ready" || row.status === "cancelled" || row.status === "expired" || row.status === "failed") return "ack";
    if (row.status === "running" && row.heartbeat_at && Date.now() - row.heartbeat_at.getTime() < 2 * 60 * 1000) return "ack";
    if (row.attempt >= 3 && row.status !== "queued") return "ack";
    const claimed = await client.query(
      `update product_import_processes
       set status = 'running', phase = 'inspecting', progress_percent = 5, started_at = coalesce(started_at, now()), heartbeat_at = now()
       where id = $1 and status in ('queued', 'running')
       returning upload_id, company_id, user_id`,
      [processId],
    );
    const claim = claimed.rows[0] as { company_id: string; upload_id: string; user_id: string } | undefined;
    if (!claim) return "ack";
    const upload = await client.query(
      "select company_id, user_id, object_path, status, expires_at from product_import_uploads where id = $1",
      [claim.upload_id],
    );
    const file = upload.rows[0] as { company_id: string; expires_at: Date; object_path: string; status: string; user_id: string } | undefined;
    if (!file || file.company_id !== claim.company_id || file.user_id !== claim.user_id || file.status !== "uploaded" || !isTempImportObjectPath(file.object_path)) {
      await fail(client, processId, "unsafe_workbook");
      return "ack";
    }
    if (file.expires_at.getTime() < Date.now() + 2 * 60 * 60 * 1000) {
      await fail(client, processId, "expired");
      return "ack";
    }
    const signedUrl = await signDownload(env, file.object_path);
    const container = getContainer(env.IMPORT_CONTAINER, CONTAINER_INSTANCE);
    const response = await container.fetch("http://container/metadata", {
      body: JSON.stringify({ signedUrl }),
      headers: {
        authorization: `Bearer ${env.IMPORT_CONTAINER_TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    const payload = await response.json() as { errorCode?: string; ok?: boolean; sheets?: Array<{ name: string; rows: number }> } & Record<string, number>;
    if (!response.ok || !payload.ok) {
      const code = String(payload.errorCode || "download_failed").slice(0, 40);
      console.log("import-process-http " + response.status + " " + code);
      if (PERMANENT.has(code) || attempts >= 3) {
        await fail(client, processId, code);
        return "ack";
      }
      await release(client, processId);
      return "retry";
    }
    const names = JSON.stringify((payload.sheets ?? []).slice(0, 50)).slice(0, 4000);
    await client.query(
      `update product_import_processes
       set status = 'ready', phase = 'ready', progress_percent = 100, sheet_count = $2, row_count = $3,
           entry_count = $4, oversized_images = $5, uncompressed_bytes = $6, peak_memory_bytes = $7,
           duration_ms = $8, sheet_names = $9, error_code = null, finished_at = now(), heartbeat_at = now()
       where id = $1 and status = 'running'`,
      [processId, payload.sheetCount ?? 0, payload.rowCount ?? 0, payload.entryCount ?? 0, payload.oversizedImages ?? 0, payload.uncompressedBytes ?? 0, payload.peakMemoryBytes ?? 0, payload.durationMs ?? 0, names],
    );
    return "ack";
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.log("import-process-retry " + message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 180));
    if (processId && attempts >= 3) {
      await fail(client, processId, "download_failed").catch(() => undefined);
      return "ack";
    }
    if (processId) await release(client, processId).catch(() => undefined);
    return "retry";
  } finally {
    await client.end();
  }
}

async function release(client: pg.Client, processId: string) {
  await client.query(
    `update product_import_processes
     set status = 'queued', phase = 'queued', heartbeat_at = null
     where id = $1 and status = 'running'`,
    [processId],
  );
}

async function fail(client: pg.Client, processId: string, code: string) {
  await client.query(
    `update product_import_processes
     set status = case when $2 = 'expired' then 'expired' else 'failed' end,
         phase = 'failed', error_code = $2, finished_at = now(), heartbeat_at = now()
     where id = $1 and status = 'running'`,
    [processId, code],
  );
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function cleanEdits(value: Array<{ field?: string; rowNumber?: number; value?: string }> | undefined) {
  const fields = new Set(["box_barcode", "category", "notes", "opening_stock", "opening_stock_unit", "pack_barcode", "piece_barcode", "piece_cost", "piece_selling_price", "product_name", "sku"]);
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((edit) => {
    const field = String(edit.field || "");
    const rowNumber = Number(edit.rowNumber);
    if (!fields.has(field) || !Number.isInteger(rowNumber) || rowNumber < 1) return [];
    return [{ field, rowNumber, value: String(edit.value ?? "").slice(0, 120) }];
  });
}

async function loadCategories(client: pg.Client, companyId: string) {
  const rows = await client.query(
    "select name_lo, name_en from categories where company_id = $1 order by name_lo asc limit 200",
    [companyId],
  );
  const names = rows.rows.flatMap((row: { name_en?: string | null; name_lo?: string | null }) => [row.name_lo, row.name_en].filter((name): name is string => Boolean(name && name.trim())));
  return [...new Set(names.map((name) => name.trim()))].slice(0, 200);
}

async function loadCatalog(client: pg.Client, companyId: string): Promise<PreviewCatalogItem[]> {
  const counts = await client.query(
    `select
       (select count(*)::int from products where company_id = $1) as products,
       (select count(*)::int from product_units u join products p on p.id = u.product_id where p.company_id = $1 and coalesce(u.barcode, '') <> '') as units`,
    [companyId],
  );
  const products = Number(counts.rows[0]?.products ?? 0);
  const units = Number(counts.rows[0]?.units ?? 0);
  if (products + units > CATALOG_LIMIT) throw new Error("preview_limit");
  const rows = await client.query(
    `select p.name_lo as product_name, coalesce(p.sku, '') as sku, coalesce(p.barcode, '') as barcode, 'Piece' as unit
     from products p
     where p.company_id = $1 and (coalesce(p.sku, '') <> '' or coalesce(p.barcode, '') <> '')
     union all
     select p.name_lo, '' as sku, u.barcode, u.unit_name
     from product_units u
     join products p on p.id = u.product_id
     where p.company_id = $1 and coalesce(u.barcode, '') <> ''`,
    [companyId],
  );
  return rows.rows.map((row: { barcode?: string; product_name?: string; sku?: string; unit?: string }) => ({
    barcode: String(row.barcode ?? "").slice(0, 80),
    productName: String(row.product_name ?? "").slice(0, 120),
    sku: String(row.sku ?? "").slice(0, 80),
    unit: String(row.unit ?? "").slice(0, 40),
  }));
}

async function signDownload(env: Env, objectPath: string) {
  const root = env.SUPABASE_URL.replace(/\/+$/, "");
  const host = new URL(root).host;
  if (!host.startsWith(QA)) throw new Error("download_failed");
  const response = await fetch(`${root}/storage/v1/object/sign/product-import-temp/${objectPath}`, {
    body: JSON.stringify({ expiresIn: 600 }),
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  if (!response.ok) throw new Error("download_failed");
  const body = await response.json() as { signedURL?: string };
  const signed = body.signedURL || "";
  if (!signed) throw new Error("download_failed");
  return signed.startsWith("http") ? signed : `${root}/storage/v1${signed}`;
}
