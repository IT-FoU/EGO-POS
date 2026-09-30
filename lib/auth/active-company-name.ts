const FALLBACK_ACTIVE_COMPANY_NAME = "Business";
export const ACTIVE_COMPANY_NAME_CHANGE_EVENT = "ego-pos:active-company-name-change";

export function resolveActiveCompanyName(activeCompanyName?: string | null) {
  return activeCompanyName || FALLBACK_ACTIVE_COMPANY_NAME;
}
