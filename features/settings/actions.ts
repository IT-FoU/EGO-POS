"use server";

import { revalidatePath } from "next/cache";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { updateActiveCompanySession } from "@/lib/auth/update-active-company-session";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { updateActiveBranchInformation } from "@/features/settings/branch-information";
import { getCompanyBusinessLogoUrl, removeCompanyBusinessLogo, replaceCompanyBusinessLogo, updatePrismaSettings } from "@/features/settings/prisma-repository";
import type { SettingsFormData } from "@/features/settings/types";

export async function updateSettingsAction(input: Partial<SettingsFormData>) {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    const settings = await updatePrismaSettings(input, tenant);
    const session = await getCurrentSession();
    if (session?.user?.id) {
      try {
        await updateActiveCompanySession(session.user.id, tenant.companyId, session, settings.companyName);
      } catch {
        // The database value is authoritative; the client publishes it after this action succeeds.
      }
    }
    revalidatePath("/settings", "layout");
    revalidatePath("/dashboard");
    revalidatePath("/pos");
    return writeSuccess(settings);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveCompanyLogoAction(formData: FormData) {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new Error("Image upload is empty.");
    }
    const businessLogoUrl = await replaceCompanyBusinessLogo(new Uint8Array(await file.arrayBuffer()), file.type, tenant);
    revalidatePath("/settings", "layout");
    revalidatePath("/pos");
    revalidatePath("/dashboard");
    return writeSuccess({ businessLogoUrl });
  } catch (error) {
    return writeFailure(error);
  }
}

export async function removeCompanyLogoAction() {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    await removeCompanyBusinessLogo(tenant);
    revalidatePath("/settings", "layout");
    revalidatePath("/pos");
    revalidatePath("/dashboard");
    return writeSuccess({ businessLogoUrl: null });
  } catch (error) {
    return writeFailure(error);
  }
}

export async function readCompanyBusinessLogoAction() {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    return writeSuccess({ businessLogoUrl: await getCompanyBusinessLogoUrl(tenant.companyId) });
  } catch (error) {
    return writeFailure(error);
  }
}

/**
 * Updates only the session's active branch.
 * Never accepts a client-supplied branchId.
 */
export async function updateActiveBranchInformationAction(input: {
  address?: string | null;
  name: string;
  phone?: string | null;
}) {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.settingsManage);
    const branch = await updateActiveBranchInformation(
      {
        address: input.address,
        name: input.name,
        phone: input.phone,
      },
      tenant,
    );
    revalidatePath("/settings", "layout");
    revalidatePath("/settings/branch-information");
    revalidatePath("/dashboard");
    revalidatePath("/pos");
    return writeSuccess(branch);
  } catch (error) {
    return writeFailure(error);
  }
}
