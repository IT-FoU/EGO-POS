import { DemoStorageKeys, LegacyStorageKeys } from "@/lib/demo/storage-keys";

type MigrationState = {
  hasRun: boolean;
};

const migrationState: MigrationState = { hasRun: false };

export function canUseBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readJsonFromStorage<T>(key: string, fallback: T): T {
  if (!canUseBrowserStorage()) {
    return fallback;
  }

  const raw = window.localStorage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonToStorage<T>(key: string, value: T) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readListFromStorage<T>(key: string): T[] {
  const value = readJsonFromStorage<unknown>(key, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function writeListToStorage<T>(key: string, value: T[]) {
  writeJsonToStorage(key, value);
}

export function readStringFromStorage(key: string, fallback = "") {
  if (!canUseBrowserStorage()) {
    return fallback;
  }

  return window.localStorage.getItem(key) ?? fallback;
}

export function writeStringToStorage(key: string, value: string) {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.setItem(key, value);
}

function migrateScalarKey(legacyKeys: readonly string[], stableKey: string) {
  if (!canUseBrowserStorage() || window.localStorage.getItem(stableKey) !== null) {
    return;
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = window.localStorage.getItem(legacyKey);
    if (legacyValue !== null) {
      window.localStorage.setItem(stableKey, legacyValue);
      return;
    }
  }
}

function migrateListKey(legacyKeys: readonly string[], stableKey: string) {
  if (!canUseBrowserStorage()) {
    return;
  }

  const stableList = readListFromStorage<unknown>(stableKey);
  if (stableList.length > 0) {
    return;
  }

  for (const legacyKey of legacyKeys) {
    const legacyList = readListFromStorage<unknown>(legacyKey);
    if (legacyList.length > 0) {
      writeListToStorage(stableKey, legacyList);
      return;
    }
  }
}

export function runDemoStorageMigrations() {
  if (!canUseBrowserStorage() || migrationState.hasRun) {
    return;
  }

  migrateScalarKey(LegacyStorageKeys.theme, DemoStorageKeys.theme);
  migrateScalarKey(LegacyStorageKeys.locale, DemoStorageKeys.locale);
  migrateScalarKey(LegacyStorageKeys.companyLogoUrl, DemoStorageKeys.companyLogoUrl);
  migrateScalarKey(LegacyStorageKeys.customerDisplayState, DemoStorageKeys.customerDisplayState);
  migrateScalarKey(LegacyStorageKeys.customerDisplaySettings, DemoStorageKeys.customerDisplaySettings);
  migrateScalarKey(LegacyStorageKeys.onboardingBusiness, DemoStorageKeys.onboardingBusiness);
  migrateScalarKey(LegacyStorageKeys.onboardingComplete, DemoStorageKeys.onboardingComplete);
  migrateScalarKey(LegacyStorageKeys.onboardingDraft, DemoStorageKeys.onboardingDraft);
  migrateScalarKey(LegacyStorageKeys.onboardingTemplate, DemoStorageKeys.onboardingTemplate);
  migrateListKey(LegacyStorageKeys.qrBanks, DemoStorageKeys.qrBanks);
  migrateListKey(LegacyStorageKeys.qrAccounts, DemoStorageKeys.qrAccounts);

  migrationState.hasRun = true;
}

export function createDemoId(prefix: string, existingIds: Iterable<string> = []) {
  const existing = new Set(existingIds);
  let nextId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  while (existing.has(nextId)) {
    nextId = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return nextId;
}
