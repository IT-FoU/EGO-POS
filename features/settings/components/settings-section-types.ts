import type { SettingsFormData } from "@/features/settings/types";

export type SettingsFieldUpdate = <K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) => void;
