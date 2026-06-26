import { NextResponse } from "next/server";
import { getDemoModeHealthStatus } from "@/lib/env/demo-mode-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getDemoModeHealthStatus();

  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
