import { getSetupAdminSession } from "@/lib/setup-admin/session";

export async function requireSetupAdminApiSession() {
  const session = await getSetupAdminSession();

  if (!session) {
    return {
      ok: false as const,
      response: Response.json({ error: "Setup admin authentication required.", ok: false }, { status: 401 }),
    };
  }

  return { ok: true as const, session };
}
