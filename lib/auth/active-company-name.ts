const FALLBACK_ACTIVE_COMPANY_NAME = "Business";

export function resolveActiveCompanyName(activeCompanyName?: string | null) {
  return activeCompanyName || FALLBACK_ACTIVE_COMPANY_NAME;
}
