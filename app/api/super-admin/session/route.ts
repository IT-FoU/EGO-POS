import { getCurrentPlatformUser } from "@/lib/auth/platform-user";

export async function GET() {
  const user = await getCurrentPlatformUser();
  if (!user) {
    return Response.json({ error: "Super admin authentication required.", ok: false }, { status: 401 });
  }

  return Response.json({ ok: true, user });
}
