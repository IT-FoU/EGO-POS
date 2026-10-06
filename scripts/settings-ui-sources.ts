import { readFileSync } from "node:fs";
import { join } from "node:path";

export const SETTINGS_UI_FILES = [
  "features/settings/components/settings-form.tsx",
  "features/settings/components/company-settings-section.tsx",
  "features/settings/components/logo-settings-section.tsx",
  "features/settings/components/tax-settings-section.tsx",
  "features/settings/components/cash-shift-settings-section.tsx",
  "features/settings/components/receipt-settings-section.tsx",
  "features/settings/components/loyalty-settings-section.tsx",
  "features/settings/components/customer-display-settings-section.tsx",
] as const;

export function readSettingsUi(root = process.cwd()) {
  return SETTINGS_UI_FILES.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
}
