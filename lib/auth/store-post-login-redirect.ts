import type { BusinessTemplateType } from "@/features/platform/platform-data";
import { businessTemplates } from "@/features/platform/platform-data";

export const DEFAULT_BUSINESS_TEMPLATE_KEY = "mini_mart";

const TEMPLATE_KEY_ALIASES: Record<string, string> = {
  clothes_shop: "clothing",
  wholesale: "wholesale_store",
};

const TEMPLATE_SHELL_TYPES = new Set<string>(businessTemplates.map((template) => template.type));

export function normalizeBusinessTemplateKey(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_BUSINESS_TEMPLATE_KEY;
  }

  return TEMPLATE_KEY_ALIASES[trimmed] ?? trimmed;
}

export function isKnownBusinessTemplateKey(value: string) {
  return TEMPLATE_SHELL_TYPES.has(value) || value === "rental";
}

export type TemplateAwareRedirectInput = {
  allowBackOfficeAccess: boolean;
  allowPOSAccess: boolean;
  businessTemplateKey: string;
  roles: string[];
};

function isCashierWorkspaceRole(roles: string[]) {
  const normalized = roles.map((role) => role.toLowerCase());
  const isCashier = normalized.includes("cashier");
  const isOwnerOrManager = normalized.includes("owner") || normalized.includes("manager");
  return isCashier && !isOwnerOrManager;
}

export function getTemplateAwareEntryPath(input: TemplateAwareRedirectInput) {
  const templateKey = normalizeBusinessTemplateKey(input.businessTemplateKey);
  const cashierWorkspace =
    isCashierWorkspaceRole(input.roles) || (input.allowPOSAccess && !input.allowBackOfficeAccess);

  if (cashierWorkspace) {
    if (templateKey === DEFAULT_BUSINESS_TEMPLATE_KEY) {
      return "/pos";
    }

    return `/dashboard?template=${encodeURIComponent(templateKey)}`;
  }

  if (templateKey === DEFAULT_BUSINESS_TEMPLATE_KEY) {
    return "/dashboard";
  }

  if (TEMPLATE_SHELL_TYPES.has(templateKey)) {
    return `/template-shell/${templateKey as BusinessTemplateType}`;
  }

  return `/dashboard?template=${encodeURIComponent(templateKey)}`;
}

export const STORE_POST_LOGIN_REASON = {
  multiCompany: "multi_company",
  noCompany: "no_company",
  singleCompany: "single_company",
} as const;

export type StorePostLoginReason = (typeof STORE_POST_LOGIN_REASON)[keyof typeof STORE_POST_LOGIN_REASON];

export type StorePostLoginRedirect = {
  businessTemplateKey: string;
  companyId?: string;
  companyName?: string;
  reason: StorePostLoginReason;
  redirectTo: string;
};
