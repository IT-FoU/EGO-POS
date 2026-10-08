// @ts-ignore — `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";
import webpDecoder from "./workers/webp_dec.wasm";

const workerScope = globalThis as typeof globalThis & { __EGO_WEBP_DECODER__?: WebAssembly.Module };
workerScope.__EGO_WEBP_DECODER__ = webpDecoder;

export default {
  fetch: handler.fetch,

  async scheduled(_event: { cron: string }, env: Record<string, any>, ctx: { waitUntil: (p: Promise<any>) => void }) {
    const secret = env.EGO_CRON_SECRET || env.CRON_SECRET;
    const base = env.NEXTAUTH_URL;
    if (!secret || !base) {
      console.error("auto-end cron skipped: missing EGO_CRON_SECRET/CRON_SECRET or NEXTAUTH_URL");
      return;
    }
    const root = String(base).replace(/\/$/, "");
    const call = (path: string) => handler.fetch(
      new Request(`${root}${path}`, {
        headers: { "x-ego-cron-secret": String(secret) },
        method: "POST",
      }),
      env,
      ctx,
    );
    ctx.waitUntil(call("/api/internal/attendance/auto-end"));
    ctx.waitUntil(call("/api/internal/product-import-cleanup"));
  },
};

// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
