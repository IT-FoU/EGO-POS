import type { SupportedLocale } from "@/lib/constants";
import { readClientLocale } from "@/lib/i18n/locale";

type NamedProduct = {
  nameEn?: string | null;
  nameLo?: string | null;
};

export function localizedProductName(product: NamedProduct, locale?: SupportedLocale) {
  const resolved = locale ?? (typeof window === "undefined" ? "en" : readClientLocale());
  const nameEn = product.nameEn?.trim() ?? "";
  const nameLo = product.nameLo?.trim() ?? "";
  if (resolved === "th") {
    return nameLo || nameEn;
  }
  return nameEn || nameLo;
}
