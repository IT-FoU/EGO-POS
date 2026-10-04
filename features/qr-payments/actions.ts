"use server";

import { revalidatePath } from "next/cache";
import { requireSettingsSectionEdit } from "@/lib/auth/module-access";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess } from "@/lib/db/write-context";
import { buildCustomerDisplayQrCatalog } from "@/features/pos/customer-display-qr";
import {
  archiveQrPaymentAccount,
  archiveQrPaymentBank,
  deleteQrPaymentAccount,
  deleteQrPaymentBank,
  getQrPaymentSettingsSnapshot,
  saveQrPaymentAccount,
  saveQrPaymentBank,
  setDefaultQrPaymentAccount,
} from "@/features/qr-payments/prisma-repository";
import type { SaveQrPaymentAccountInput, SaveQrPaymentBankInput } from "@/features/qr-payments/types";

function revalidateQrPaths() {
  revalidatePath("/settings");
  revalidatePath("/pos");
}

export async function saveQrPaymentBankAction(input: SaveQrPaymentBankInput) {
  try {
    const data = await saveQrPaymentBank(input, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function archiveQrPaymentBankAction(bankId: string) {
  try {
    const data = await archiveQrPaymentBank(bankId, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteQrPaymentBankAction(bankId: string) {
  try {
    const data = await deleteQrPaymentBank(bankId, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveQrPaymentAccountAction(input: SaveQrPaymentAccountInput) {
  try {
    const data = await saveQrPaymentAccount(input, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function archiveQrPaymentAccountAction(accountId: string) {
  try {
    const data = await archiveQrPaymentAccount(accountId, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteQrPaymentAccountAction(accountId: string) {
  try {
    const data = await deleteQrPaymentAccount(accountId, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function getCustomerDisplayQrCatalogAction() {
  try {
    const session = await requireSession();
    const snapshot = await getQrPaymentSettingsSnapshot(tenantFromSession(session));
    return writeSuccess(buildCustomerDisplayQrCatalog(snapshot.accounts, snapshot.banks));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function setDefaultQrPaymentAccountAction(accountId: string) {
  try {
    const data = await setDefaultQrPaymentAccount(accountId, await requireSettingsSectionEdit(await requireWritePermission(WRITE_PERMISSIONS.settingsManage), "qr-payments"));
    revalidateQrPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}
