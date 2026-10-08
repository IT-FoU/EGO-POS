import { NextResponse } from "next/server";
import { cleanupExpiredLargeImports } from "@/features/products/product-import-large-service";

/**
 * Deletes expired temporary catalogue uploads from product-import-temp.
 * Requires header: x-ego-cron-secret matching CRON_SECRET / EGO_CRON_SECRET.
 */
export async function POST(request: Request) {
  const expected = process.env.EGO_CRON_SECRET || process.env.CRON_SECRET || "";
  const provided = request.headers.get("x-ego-cron-secret") || "";
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await cleanupExpiredLargeImports(new Date());
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (error) {
  return NextResponse.json({ ok: false, error: "Cleanup failed." }, { status: 500 });
  }
}
