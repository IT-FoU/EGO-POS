import { authenticateSuperAdminLogin } from "@/lib/auth/super-admin-login";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; identifier?: unknown; password?: unknown; username?: unknown }
    | null;
  const identifier =
    typeof body?.email === "string"
      ? body.email.trim()
      : typeof body?.identifier === "string"
        ? body.identifier.trim()
        : typeof body?.username === "string"
          ? body.username.trim()
          : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const result = await authenticateSuperAdminLogin(identifier, password);

  if (!result.ok) {
    return Response.json({ error: result.error, ok: false }, { status: result.status });
  }

  return Response.json({ ok: true, redirectTo: result.redirectTo });
}
