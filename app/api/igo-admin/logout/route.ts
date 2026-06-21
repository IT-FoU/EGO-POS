import { clearAdminSession } from "@/lib/admin/session";

export async function POST() {
  await clearAdminSession();
  return Response.json({ ok: true });
}
