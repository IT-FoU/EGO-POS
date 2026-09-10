import {
  MAX_SOURCE_IMAGE_BYTES,
  ProductImageValidationError,
  detectImageMimeFromMagicBytes,
  validateProductImageBytes,
} from "@/lib/storage/image-validate";

const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 8_000;
const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

export class RemoteImageImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteImageImportError";
  }
}

function isBlockedHostname(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    return true;
  }
  return false;
}

function isPrivateIPv4(ip: string) {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "::1" || value === "::" || value === "0:0:0:0:0:0:0:1") return true;
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80")) return true;
  if (value.startsWith("::ffff:")) {
    return isPrivateIPv4(value.slice("::ffff:".length));
  }
  return false;
}

export function assertSafeRemoteImageUrl(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new RemoteImageImportError("Image URL is invalid.");
  }
  if (parsed.protocol !== "https:") {
    throw new RemoteImageImportError("Only HTTPS image URLs are allowed.");
  }
  if (parsed.username || parsed.password) {
    throw new RemoteImageImportError("Image URL is invalid.");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(hostname)) {
    throw new RemoteImageImportError("Image URL is not allowed.");
  }
  if (isPrivateIPv4(hostname) || isPrivateIPv6(hostname)) {
    throw new RemoteImageImportError("Image URL is not allowed.");
  }
  return parsed;
}

async function assertPublicHostname(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new RemoteImageImportError("Image URL is not allowed.");
  }
  try {
    const dns = await import("node:dns/promises");
    const lookup = dns.lookup(host, { all: true, verbatim: true });
    const addresses = await Promise.race([
      lookup,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new RemoteImageImportError("Image URL timed out.")), 3_000);
      }),
    ]);
    for (const entry of addresses) {
      const address = String(entry.address ?? "");
      if (isPrivateIPv4(address) || isPrivateIPv6(address) || isBlockedHostname(address)) {
        throw new RemoteImageImportError("Image URL is not allowed.");
      }
    }
  } catch (error) {
    if (error instanceof RemoteImageImportError) throw error;
  }
}

function filenameFromUrl(url: URL, mime: string) {
  const base = url.pathname.split("/").filter(Boolean).at(-1) || "image";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  if (/\.(jpe?g|png|webp)$/i.test(cleaned)) return cleaned;
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `${cleaned || "image"}.${extension}`;
}

export async function importRemoteProductImageBytes(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
) {
  let current = assertSafeRemoteImageUrl(rawUrl);
  await assertPublicHostname(current.hostname);

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetchImpl(current, {
      headers: { Accept: "image/jpeg,image/png,image/webp,image/*;q=0.8" },
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) {
        throw new RemoteImageImportError("Image URL redirected too many times.");
      }
      current = assertSafeRemoteImageUrl(new URL(location, current).toString());
      await assertPublicHostname(current.hostname);
      continue;
    }

    if (!response.ok) {
      throw new RemoteImageImportError("Could not download the selected image.");
    }

    const declaredMime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (declaredMime && declaredMime.startsWith("image/") && !["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(declaredMime)) {
      throw new ProductImageValidationError("Unsupported image type. Use JPEG, PNG, or WEBP.");
    }

    const lengthHeader = Number(response.headers.get("content-length") ?? 0);
    if (lengthHeader > MAX_SOURCE_IMAGE_BYTES) {
      throw new ProductImageValidationError("Image is too large. Maximum size is 5 MB.");
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > MAX_SOURCE_IMAGE_BYTES) {
      throw new ProductImageValidationError("Image is too large. Maximum size is 5 MB.");
    }
    const detected = detectImageMimeFromMagicBytes(buffer);
    if (detected === "image/gif") {
      throw new ProductImageValidationError("GIF images are not supported. Use JPEG, PNG, or WEBP.");
    }
    const validated = validateProductImageBytes(buffer, {
      declaredMime: declaredMime === "image/jpg" ? "image/jpeg" : declaredMime,
      filename: filenameFromUrl(current, detected === "image/png" ? "image/png" : detected === "image/webp" ? "image/webp" : "image/jpeg"),
      kind: "source",
    });
    return {
      bytes: validated.bytes,
      filename: filenameFromUrl(current, validated.mime),
      mime: validated.mime,
      size: validated.size,
    };
  }

  throw new RemoteImageImportError("Could not download the selected image.");
}

export function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}
