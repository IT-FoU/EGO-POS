import { getCloudflareContext } from "@opennextjs/cloudflare";

function readWorkerBinding(name: string) {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>;
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** Strip accidental REST/Storage/Auth suffixes that break Storage API paths. */
export function normalizeSupabaseProjectUrl(raw?: string | null) {
  if (!raw) return undefined;
  let url = raw.trim().replace(/\/+$/, "");
  if (!url) return undefined;
  url = url.replace(/\/rest\/v1(?:\/.*)?$/i, "");
  url = url.replace(/\/storage\/v1(?:\/.*)?$/i, "");
  url = url.replace(/\/auth\/v1(?:\/.*)?$/i, "");
  return url.replace(/\/+$/, "") || undefined;
}

export function readSupabaseUrl() {
  return normalizeSupabaseProjectUrl(readWorkerBinding("SUPABASE_URL") ?? process.env.SUPABASE_URL);
}

export function readSupabaseServiceRoleKey() {
  return readWorkerBinding("SUPABASE_SERVICE_ROLE_KEY") ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

export function assertNoPublicSupabaseServiceRole() {
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must not be exposed as NEXT_PUBLIC_.");
  }
}
