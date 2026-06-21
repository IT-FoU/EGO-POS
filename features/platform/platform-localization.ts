import type { SupportedLocale } from "@/lib/constants";
import {
  businessTemplates,
  type BusinessTemplate,
  type BusinessTemplateType,
} from "@/features/platform/platform-data";
import { platformEn } from "@/locales/en/platform";
import { platformLo } from "@/locales/lo/platform";

const platformLocales = {
  en: platformEn,
  lo: platformLo,
};

export type LocalizedBusinessTemplate = BusinessTemplate & {
  description: string;
  enabledModules: string[];
  name: string;
};

export function getPlatformMessages(locale: SupportedLocale | string | undefined) {
  return locale === "en" ? platformLocales.en : platformLocales.lo;
}

export function getLocalizedBusinessTemplates(
  locale: SupportedLocale | string | undefined,
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
  locale: SupportedLocale | string | undefined,
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
