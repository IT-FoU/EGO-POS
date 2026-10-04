import { getPrismaSettings, updatePrismaSettings } from "@/features/settings/prisma-repository";
import { redactSettingsRead, settingsSectionsInPayload, unknownSettingsWriteFields } from "@/features/access-control/phase3-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { runRead, runWrite } from "@/lib/api/write-response";
import { requireSettingsSectionEdit } from "@/lib/auth/module-access";
import { PermissionDeniedError, READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import type { SettingsFormData } from "@/features/settings/types";

export async function GET() {
  return runRead(async (tenant) => {
    const settings = await getPrismaSettings(tenant);
    return redactSettingsRead(settings, await getUserPermissionKeys(tenant));
  }, READ_PERMISSIONS.settingsView);
}

export async function PATCH(request: Request) {
  return runWrite(async (tenant, body) => {
    const payload = (body ?? {}) as Record<string, unknown>;
    const sections = settingsSectionsInPayload(payload);
    if (unknownSettingsWriteFields(payload).length > 0 || sections.length === 0) {
      throw new PermissionDeniedError(WRITE_PERMISSIONS.settingsManage);
    }
    for (const section of sections) {
      await requireSettingsSectionEdit(tenant, section);
    }
    const settings = await updatePrismaSettings(payload as Partial<SettingsFormData>, tenant);
    return redactSettingsRead(settings, await getUserPermissionKeys(tenant));
  }, request, WRITE_PERMISSIONS.settingsManage);
}
