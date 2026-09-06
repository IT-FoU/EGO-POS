export const APP_NAME = "EGO POS";
export const COMPANY_NAME = "IGO Technology";
export const PRIMARY_STORE = "EGO Mini Mart";
export const SLOGAN = "Simple. Smart. Fast. For Every Business.";
export const BASE_CURRENCY = "LAK";
export const DEFAULT_LOCALE = "en" as const;
export const SUPPORTED_LOCALES = ["en", "lo"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
