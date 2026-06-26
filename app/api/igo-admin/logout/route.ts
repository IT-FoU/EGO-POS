import { clearAdminSession } from "@/lib/admin/session";

const DEPRECATION_HEADER = "X-Deprecated-Api: use /api/super-admin/logout";

export async function POST() {
  await clearAdminSession();
  return Response.json({ ok: true }, { headers: { [DEPRECATION_HEADER]: "true" } });
}
