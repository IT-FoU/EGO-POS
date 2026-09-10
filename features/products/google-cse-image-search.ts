import {
  GOOGLE_CSE_ENDPOINT,
  mapGoogleCseImageItems,
  type GoogleCseConfig,
  type ProductImageSearchHit,
} from "@/features/products/product-image-search";

export class ImageSearchConfigurationError extends Error {
  constructor() {
    super("Image search is not configured.");
    this.name = "ImageSearchConfigurationError";
  }
}

export class ImageSearchRequestError extends Error {
  constructor(message = "Image search failed.") {
    super(message);
    this.name = "ImageSearchRequestError";
  }
}

export async function searchGoogleCseImages(
  query: string,
  config: GoogleCseConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductImageSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ImageSearchRequestError("Image search query is empty.");
  }

  const url = new URL(GOOGLE_CSE_ENDPOINT);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("cx", config.cx);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "8");
  url.searchParams.set("safe", "active");
  url.searchParams.set("fields", "items(title,link,image/thumbnailLink,image/contextLink)");

  const response = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new ImageSearchRequestError("Image search failed.");
  }
  const payload = (await response.json()) as { items?: unknown };
  return mapGoogleCseImageItems(payload.items);
}
