import type { BusinessTemplateType } from "@/features/platform/platform-data";
import { isDemoOnboardingEnabled } from "@/lib/demo/onboarding-access";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage, readStringFromStorage, runDemoStorageMigrations, writeJsonToStorage, writeStringToStorage } from "@/lib/demo/storage";

export type OnboardingBusinessContext = {
  activeBusinessId: string;
  activeTenantId: string;
  currency: string;
  defaultModules: string[];
  email: string;
  language: string;
  logoFileName?: string;
  logoUrl?: string;
  ownerName: string;
  phoneNumber: string;
  setupCompletedAt: string;
  setupStatus: "complete";
  storeAddress?: string;
  storeName: string;
  templateId: BusinessTemplateType;
  template: BusinessTemplateType;
  businessTemplateId: BusinessTemplateType;
  businessType: BusinessTemplateType;
  templateName: string;
};

export type OnboardingSetupDraft = {
  businessTemplateId: BusinessTemplateType;
  businessType: BusinessTemplateType;
  defaultModules: string[];
  locale: string;
  selectedAt: string;
  setupStatus: "draft";
  templateName: string;
};

const BUSINESS_KEY = DemoStorageKeys.onboardingBusiness;
const COMPLETE_KEY = DemoStorageKeys.onboardingComplete;
const DRAFT_KEY = DemoStorageKeys.onboardingDraft;
const TEMPLATE_KEY = DemoStorageKeys.onboardingTemplate;

export function getTemplateEntryPath(template: BusinessTemplateType) {
  return template === "mini_mart" ? "/dashboard" : `/template-shell/${template}`;
}

export function getStoredBusinessContext() {
  if (typeof window === "undefined" || !isDemoOnboardingEnabled()) {
    return null;
  }

  runDemoStorageMigrations();
  const isComplete = readStringFromStorage(COMPLETE_KEY) === "true";
  const business = readJsonFromStorage<OnboardingBusinessContext | null>(BUSINESS_KEY, null);

  if (!isComplete || !business) {
    return null;
  }

  return business;
}

export function getStoredEntryPath() {
  if (!isDemoOnboardingEnabled()) {
    return "/businesses";
  }

  const business = getStoredBusinessContext();
  return business ? getTemplateEntryPath(business.template) : "/businesses";
}

export function getStoredSetupDraft() {
  if (typeof window === "undefined" || !isDemoOnboardingEnabled()) {
    return null;
  }

  runDemoStorageMigrations();
  return readJsonFromStorage<OnboardingSetupDraft | null>(DRAFT_KEY, null);
}

export function saveSelectedTemplateDraft(draft: OnboardingSetupDraft) {
  if (!isDemoOnboardingEnabled()) {
    return;
  }

  writeStringToStorage(TEMPLATE_KEY, draft.businessTemplateId);
  writeJsonToStorage(DRAFT_KEY, draft);
}

export function completeOnboarding(business: OnboardingBusinessContext) {
  if (!isDemoOnboardingEnabled()) {
    return;
  }

  writeJsonToStorage(BUSINESS_KEY, business);
  writeStringToStorage(COMPLETE_KEY, "true");
}

export function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}`;
}
