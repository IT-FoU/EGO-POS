import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, writeStringToStorage } from "@/lib/demo/storage";

export const COMPANY_LOGO_CHANGE_EVENT = "ego-pos:company-logo";

const supportedLogoPattern = /\.(png|svg|webp|jpe?g)(\?.*)?$/i;
const supportedDataLogoPattern = /^data:image\/(png|svg\+xml|webp|jpe?g);/i;

export function isSupportedCompanyLogoUrl(value: string | null | undefined) {
  return Boolean(value && (supportedLogoPattern.test(value) || supportedDataLogoPattern.test(value)));
}

export function readCompanyLogoUrl() {
  return readStringFromStorage(DemoStorageKeys.companyLogoUrl, "").trim();
}

export function writeCompanyLogoUrl(value: string) {
  writeStringToStorage(DemoStorageKeys.companyLogoUrl, value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(COMPANY_LOGO_CHANGE_EVENT, { detail: value }));
  }
}

export function clearCompanyLogoUrl() {
  writeCompanyLogoUrl("");
}

export function storeInitials(name: string | null | undefined) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "EG";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}
