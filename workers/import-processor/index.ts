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

type Env = {
  HYPERDRIVE: { connectionString: string };
  IMPORT_CONTAINER: Parameters<typeof getContainer>[0];
  IMPORT_CONTAINER_TOKEN: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_URL: string;
};

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
    const container = getContainer(env.IMPORT_CONTAINER, "metadata-rows");
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
