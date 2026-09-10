export const BRAVE_SEARCH_API_KEY_ENV = "BRAVE_SEARCH_API_KEY";
export const BRAVE_IMAGES_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/images/search";
export const IMAGE_SEARCH_PROVIDER = "brave_search";
export const BRAVE_IMAGE_SEARCH_COUNT = 10;

export type ImageSearchSource = "name" | "barcode";

export type ImageSearchQueryResult =
  | { ok: true; query: string; source: ImageSearchSource }
  | { ok: false; reason: "empty-name" | "empty-barcode"; source: ImageSearchSource };

export type ProductImageSearchHit = {
  height?: number;
  id: string;
  importUrl: string;
  sourcePageUrl?: string;
  thumbnailUrl: string;
  title: string;
  width?: number;
};

function trimValue(value: unknown) {
  return String(value ?? "").trim();
}

export function resolveImageSearchQuery(
  source: ImageSearchSource,
  input: { barcode?: string; productName?: string },
): ImageSearchQueryResult {
  if (source === "name") {
    const query = trimValue(input.productName);
    if (!query) return { ok: false, reason: "empty-name", source };
    return { ok: true, query, source };
  }
  const query = trimValue(input.barcode);
  if (!query) return { ok: false, reason: "empty-barcode", source };
  return { ok: true, query, source };
}

export function readBraveSearchApiKey(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const apiKey = trimValue(env[BRAVE_SEARCH_API_KEY_ENV]);
  return apiKey.length > 0 ? apiKey : null;
}

function httpsUrl(value: unknown) {
  const url = trimValue(value);
  return url.startsWith("https://") ? url : "";
}

function dimension(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

export function mapBraveImageResults(payload: unknown): ProductImageSearchHit[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const hits: ProductImageSearchHit[] = [];
  for (const [index, item] of results.entries()) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      properties?: { height?: unknown; url?: unknown; width?: unknown };
      thumbnail?: { src?: unknown };
      title?: unknown;
      url?: unknown;
    };
    const importUrl = httpsUrl(record.properties?.url) || httpsUrl(record.thumbnail?.src);
    const thumbnailUrl = httpsUrl(record.thumbnail?.src) || importUrl;
    if (!importUrl || !thumbnailUrl) continue;
    hits.push({
      height: dimension(record.properties?.height),
      id: `${index}:${importUrl}`,
      importUrl,
      sourcePageUrl: httpsUrl(record.url) || undefined,
      thumbnailUrl,
      title: trimValue(record.title) || "Image",
      width: dimension(record.properties?.width),
    });
  }
  return hits;
}

export function redactImageSearchSecrets(message: string) {
  return message
    .replace(/X-Subscription-Token:\s*\S+/gi, "X-Subscription-Token: [redacted]")
    .replace(/BRAVE_SEARCH_API_KEY[=:]\s*\S+/gi, "BRAVE_SEARCH_API_KEY=[redacted]");
}
