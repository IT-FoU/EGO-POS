// @ts-ignore — `.open-next/worker.js` is generated at build time
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(_event: { cron: string }, env: Record<string, any>, ctx: { waitUntil: (p: Promise<any>) => void }) {
    const secret = env.EGO_CRON_SECRET || env.CRON_SECRET;
    const base = env.NEXTAUTH_URL;
    if (!secret || !base) {
      console.error("auto-end cron skipped: missing EGO_CRON_SECRET/CRON_SECRET or NEXTAUTH_URL");
      return;
    }
    const url = `${String(base).replace(/\/$/, "")}/api/internal/attendance/auto-end`;
    ctx.waitUntil(
      handler.fetch(
        new Request(url, {
          headers: { "x-ego-cron-secret": String(secret) },
          method: "POST",
        }),
        env,
        ctx,
      ),
    );
  },
};

// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";
