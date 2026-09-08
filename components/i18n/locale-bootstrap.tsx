"use client";

import { useEffect } from "react";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, runDemoStorageMigrations, writeStringToStorage } from "@/lib/demo/storage";
import {
  applyDocumentLocale,
  isClientLocaleSynced,
  LOCALE_CHANGE_EVENT,
  LOCALE_COOKIE_NAME,
  readClientLocale,
} from "@/lib/i18n/locale";

export function LocaleBootstrap({ initialLocale }: { initialLocale?: string }) {
  useEffect(() => {
    runDemoStorageMigrations();
    const locale = readClientLocale(initialLocale);
    applyDocumentLocale(locale);

    if (isClientLocaleSynced(locale)) {
      return;
    }

    const stored = readStringFromStorage(DemoStorageKeys.locale);
    if (stored !== locale) {
      writeStringToStorage(DemoStorageKeys.locale, locale);
    }

    document.cookie = `${LOCALE_COOKIE_NAME}=${locale};path=/;max-age=31536000;SameSite=Lax`;
    window.dispatchEvent(new CustomEvent(LOCALE_CHANGE_EVENT, { detail: { locale } }));
  }, [initialLocale]);

  return null;
}
