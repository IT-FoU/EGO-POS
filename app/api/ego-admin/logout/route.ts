import { clearSetupAdminSession } from "@/lib/setup-admin/session";

export async function POST() {
  await clearSetupAdminSession();
  return Response.json({ ok: true });
}
