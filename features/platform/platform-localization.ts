import type { AdminLocale } from "@/lib/i18n/admin-locale";
import {
  businessTemplates,
  type BusinessTemplate,
  type BusinessTemplateType,
} from "@/features/platform/platform-data";
import { platformEn } from "@/locales/en/platform";
import { platformTh } from "@/locales/th/platform";

const platformLocales = {
  en: platformEn,
  th: platformTh,
};

export type LocalizedBusinessTemplate = BusinessTemplate & {
  description: string;
  enabledModules: string[];
  name: string;
};

export function getPlatformMessages(locale: AdminLocale | string | undefined) {
  return locale === "th" ? platformLocales.th : platformLocales.en;
}

export function getLocalizedBusinessTemplates(
  locale: AdminLocale | string | undefined,
): LocalizedBusinessTemplate[] {
  const messages = getPlatformMessages(locale);

  return businessTemplates.map((template) => ({
    ...template,
    description: messages.templates[template.type].description,
    enabledModules: template.enabledModuleKeys.map((moduleKey) => {
      const key = moduleKey as keyof typeof messages.templateModules;
      return messages.templateModules[key] ?? moduleKey;
    }),
    name: messages.templates[template.type].name,
  }));
}

export function getLocalizedBusinessTemplate(
  type: BusinessTemplateType | string | undefined,
  locale: AdminLocale | string | undefined,
) {
  return (
    getLocalizedBusinessTemplates(locale).find((template) => template.type === type) ??
    getLocalizedBusinessTemplates(locale)[0]
  );
}

export function formatPlatformMessage(
  message: string,
  values: Record<string, string>,
) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    message,
  );
}
