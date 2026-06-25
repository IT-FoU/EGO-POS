import type { SupportedLocale } from "@/lib/constants";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, writeStringToStorage } from "@/lib/demo/storage";

export const LOCALE_COOKIE_NAME = "ego-pos-locale";
export const LOCALE_CHANGE_EVENT = "ego-pos:locale-change";

export function normalizeLocale(value?: string | null): SupportedLocale {
  return value === "lo" ? "lo" : "en";
}

export function getServerLocale(...candidates: Array<string | undefined | null>): SupportedLocale {
  for (const candidate of candidates) {
    if (candidate === "lo" || candidate === "en") {
      return candidate;
    }
  }
  return DEFAULT_LOCALE;
}

export function readClientLocale(fallback?: string | null): SupportedLocale {
  if (typeof window === "undefined") {
    return getServerLocale(fallback);
  }

  const stored = readStringFromStorage(DemoStorageKeys.locale);
  if (stored === "lo" || stored === "en") {
    return stored;
  }

  const datasetLocale = document.documentElement.dataset.locale;
  if (datasetLocale === "lo" || datasetLocale === "en") {
    return datasetLocale;
  }

  return getServerLocale(fallback);
}

export function persistClientLocale(locale: SupportedLocale) {
  writeStringToStorage(DemoStorageKeys.locale, locale);
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale};path=/;max-age=31536000;SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale } }));
}

export function applyDocumentLocale(locale: SupportedLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dataset.locale = locale;
}
