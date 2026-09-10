export const GOOGLE_CSE_API_KEY_ENV = "GOOGLE_CSE_API_KEY";
export const GOOGLE_CSE_CX_ENV = "GOOGLE_CSE_CX";
export const GOOGLE_CSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
export const IMAGE_SEARCH_PROVIDER = "google_programmable_search";

export type ImageSearchSource = "name" | "barcode";

export type ImageSearchQueryResult =
  | { ok: true; query: string; source: ImageSearchSource }
  | { ok: false; reason: "empty-name" | "empty-barcode"; source: ImageSearchSource };

export type ProductImageSearchHit = {
  id: string;
  importUrl: string;
  sourcePageUrl?: string;
  thumbnailUrl: string;
  title: string;
};

export type GoogleCseConfig = {
  apiKey: string;
  cx: string;
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

export function readGoogleCseConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): GoogleCseConfig | null {
  const apiKey = trimValue(env[GOOGLE_CSE_API_KEY_ENV]);
  const cx = trimValue(env[GOOGLE_CSE_CX_ENV]);
  if (!apiKey || !cx) return null;
  return { apiKey, cx };
}

export function mapGoogleCseImageItems(items: unknown): ProductImageSearchHit[] {
  if (!Array.isArray(items)) return [];
  const results: ProductImageSearchHit[] = [];
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      image?: { contextLink?: string; thumbnailLink?: string };
      link?: string;
      title?: string;
    };
    const importUrl = trimValue(record.link);
    const thumbnailUrl = trimValue(record.image?.thumbnailLink) || importUrl;
    if (!importUrl.startsWith("https://") || !thumbnailUrl.startsWith("https://")) continue;
    results.push({
      id: `${index}:${importUrl}`,
      importUrl,
      sourcePageUrl: trimValue(record.image?.contextLink) || undefined,
      thumbnailUrl,
      title: trimValue(record.title) || "Image",
    });
  }
  return results;
}
