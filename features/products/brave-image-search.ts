import {
  BRAVE_IMAGES_SEARCH_ENDPOINT,
  BRAVE_IMAGE_SEARCH_COUNT,
  mapBraveImageResults,
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

function statusError(status: number) {
  if (status === 401 || status === 403) {
    return new ImageSearchRequestError("Image search is not authorized.");
  }
  if (status === 429) {
    return new ImageSearchRequestError("Image search is temporarily limited. Try again later.");
  }
  if (status >= 500) {
    return new ImageSearchRequestError("Image search is temporarily unavailable.");
  }
  return new ImageSearchRequestError("Image search failed.");
}

export async function searchBraveImages(
  query: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProductImageSearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new ImageSearchRequestError("Image search query is empty.");
  }
  if (!apiKey.trim()) {
    throw new ImageSearchConfigurationError();
  }

  const url = new URL(BRAVE_IMAGES_SEARCH_ENDPOINT);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("count", String(BRAVE_IMAGE_SEARCH_COUNT));
  url.searchParams.set("safesearch", "strict");
  url.searchParams.set("country", "ALL");

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof ImageSearchRequestError || error instanceof ImageSearchConfigurationError) {
      throw error;
    }
    throw new ImageSearchRequestError("Image search is temporarily unavailable.");
  }

  if (!response.ok) {
    throw statusError(response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ImageSearchRequestError("Image search failed.");
  }

  return mapBraveImageResults(payload);
}
