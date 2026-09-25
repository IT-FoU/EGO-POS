import type { APIResponse, Page } from "@playwright/test";

type ApiEnvelope<T> = { data?: T; error?: string; message?: string; ok?: boolean };

async function body<T>(response: APIResponse): Promise<ApiEnvelope<T>> {
  return response.json().catch(() => ({} as ApiEnvelope<T>));
}

export async function qaApiRaw<T>(page: Page, path: string, method = "GET", data?: unknown) {
  const response = await page.request.fetch(path, { data, method });
  const payload = await body<T>(response);
  return { payload, response };
}

export async function qaApi<T>(page: Page, path: string, method = "GET", data?: unknown): Promise<T> {
  const { payload, response } = await qaApiRaw<T>(page, path, method, data);
  if (!response.ok() || payload.ok === false) {
    throw new Error(`QA API ${method} ${path} failed (${response.status()}): ${payload.message ?? payload.error ?? response.statusText()}`);
  }
  return payload.data as T;
}

export function uniqueQaSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
}

export function regexEscape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
