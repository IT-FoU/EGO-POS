"use server";

import { revalidatePath } from "next/cache";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { updatePrismaSettings } from "@/features/settings/prisma-repository";
import type { SettingsFormData } from "@/features/settings/types";

export async function updateSettingsAction(input: Partial<SettingsFormData>) {
  try {
    const settings = await updatePrismaSettings(input, await requireWritePermission(WRITE_PERMISSIONS.settingsManage));
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    revalidatePath("/pos");
    return writeSuccess(settings);
  } catch (error) {
    return writeFailure(error);
  }
}
