import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";
import {
  customerDisplayTemplateTokens,
  parseCustomerDisplayTemplate,
  type CustomerDisplayThemeTokens,
} from "@/features/pos/customer-display-templates";

export type PosAppearance = "dark" | "light";

export function parsePosAppearance(value: unknown): PosAppearance {
  return value === "light" ? "light" : "dark";
}

export function readResolvedPosAppearance(): PosAppearance {
  return parsePosAppearance(readStringFromStorage(DemoStorageKeys.theme));
}

export function customerDisplayThemeTokens(templateOrLegacy: string): CustomerDisplayThemeTokens {
  return customerDisplayTemplateTokens(parseCustomerDisplayTemplate(templateOrLegacy));
}
