"use server";

import { revalidatePath } from "next/cache";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { updateActiveCompanySession } from "@/lib/auth/update-active-company-session";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { updatePrismaSettings } from "@/features/settings/prisma-repository";
import type { SettingsFormData } from "@/features/settings/types";

export async function updateSettingsAction(input: Partial<SettingsFormData>) {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    const settings = await updatePrismaSettings(input, tenant);
    const session = await getCurrentSession();
    if (session?.user?.id) {
      const refreshed = await updateActiveCompanySession(session.user.id, tenant.companyId, session);
      if (!refreshed) {
        throw new Error("Active company session could not be refreshed.");
      }
    }
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/pos");
    return writeSuccess(settings);
  } catch (error) {
    return writeFailure(error);
  }
}
