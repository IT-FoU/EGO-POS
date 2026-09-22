import { NextResponse } from "next/server";
import { runAutoEndSweep } from "@/features/ot/prisma-repository";

/**
 * Secured Auto End sweep. Invoked by Cloudflare Cron custom worker.
 * Requires header: x-ego-cron-secret matching CRON_SECRET / EGO_CRON_SECRET.
 */
export async function POST(request: Request) {
  const expected =
    process.env.EGO_CRON_SECRET ||
    process.env.CRON_SECRET ||
    "";
  const provided = request.headers.get("x-ego-cron-secret") || "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAutoEndSweep(new Date());
  return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
}
