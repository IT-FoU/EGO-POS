import type { SupportedLocale } from "@/lib/constants";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/lib/constants";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, writeStringToStorage } from "@/lib/demo/storage";

export const LOCALE_COOKIE_NAME = "ego-pos-locale";
export const LOCALE_CHANGE_EVENT = "ego-pos:locale-change";

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function normalizeLocale(value?: string | null): SupportedLocale {
  if (value === "lo") {
    return "lo";
  }
  return DEFAULT_LOCALE;
}

export function getServerLocale(...candidates: Array<string | undefined | null>): SupportedLocale {
  for (const candidate of candidates) {
    if (isSupportedLocale(candidate)) {
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
  if (isSupportedLocale(stored)) {
    return stored;
  }

  const cookieLocale = readCookieLocale();
  if (cookieLocale) {
    return cookieLocale;
  }

  const datasetLocale = document.documentElement.dataset.locale;
  if (isSupportedLocale(datasetLocale)) {
    return datasetLocale;
  }

  return getServerLocale(fallback);
}

export function readCookieLocale(): SupportedLocale | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE_NAME}=([^;]*)`));
  const value = match?.[1];
  return isSupportedLocale(value) ? value : null;
}

export function isClientLocaleSynced(locale: SupportedLocale) {
  if (typeof window === "undefined") {
    return true;
  }

  const stored = readStringFromStorage(DemoStorageKeys.locale);
  const cookieLocale = readCookieLocale();
  const datasetLocale = document.documentElement.dataset.locale;

  return (
    stored === locale &&
    cookieLocale === locale &&
    document.documentElement.lang === locale &&
    datasetLocale === locale
  );
}

export function persistClientLocale(locale: SupportedLocale) {
  const nextLocale = normalizeLocale(locale);

  if (typeof window !== "undefined" && isClientLocaleSynced(nextLocale)) {
    return;
  }

  writeStringToStorage(DemoStorageKeys.locale, nextLocale);
  document.documentElement.lang = nextLocale;
  document.documentElement.dataset.locale = nextLocale;
  document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale};path=/;max-age=31536000;SameSite=Lax`;
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale: nextLocale } }));
}

export function applyDocumentLocale(locale: SupportedLocale) {
  const nextLocale = normalizeLocale(locale);
  document.documentElement.lang = nextLocale;
  document.documentElement.dataset.locale = nextLocale;
}
