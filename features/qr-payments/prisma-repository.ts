import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { assertBranchInScope } from "@/lib/db/tenant-scope";
import {
  mapQrPaymentAccountToPosBank,
  type QrPaymentAccountRecord,
  type QrPaymentBankRecord,
  type QrPaymentSettingsSnapshot,
  type SaveQrPaymentAccountInput,
  type SaveQrPaymentBankInput,
} from "@/features/qr-payments/types";
import type { QrBank } from "@/features/pos/types";

const db = prisma as any;

function mapBank(row: Record<string, unknown>): QrPaymentBankRecord {
  return {
    bankName: String(row.bankName ?? ""),
    id: String(row.id),
    isActive: Boolean(row.isActive ?? true),
    logoUrl: row.logoUrl ? String(row.logoUrl) : undefined,
    shortCode: String(row.shortCode ?? ""),
    sortOrder: Number(row.sortOrder ?? 0),
  };
}

function mapAccount(row: Record<string, unknown>): QrPaymentAccountRecord {
  return {
    accountName: String(row.accountName ?? ""),
    accountNumber: String(row.accountNumber ?? ""),
    bankId: String(row.bankId),
    branchId: String(row.branchId),
    displayLabel: String(row.displayLabel ?? row.accountName ?? ""),
    id: String(row.id),
    isActive: Boolean(row.isActive ?? true),
    isDefault: Boolean(row.isDefault ?? false),
    printOnReceipt: Boolean(row.printOnReceipt ?? true),
    qrImageUrl: row.qrImageUrl ? String(row.qrImageUrl) : undefined,
    showOnCustomerDisplay: Boolean(row.showOnCustomerDisplay ?? true),
  };
}

export async function getQrPaymentSettingsSnapshot(tenant: TenantContext): Promise<QrPaymentSettingsSnapshot> {
  const [banks, accounts, branches] = await Promise.all([
    db.qrPaymentBank.findMany({
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      where: { companyId: tenant.companyId },
    }),
    db.qrPaymentAccount.findMany({
      orderBy: [{ branchId: "asc" }, { isDefault: "desc" }, { accountName: "asc" }],
      where: { companyId: tenant.companyId },
    }),
    db.branch.findMany({
      orderBy: [{ isMainBranch: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
      where: { companyId: tenant.companyId },
    }),
  ]);

  return {
    accounts: accounts.map(mapAccount),
    banks: banks.map(mapBank),
    branches,
  };
}

export async function getPrismaPosQrBanks(tenant: TenantContext, branchId: string): Promise<QrBank[]> {
  const accounts = await db.qrPaymentAccount.findMany({
    include: { bank: true },
    orderBy: [{ bank: { sortOrder: "asc" } }, { isDefault: "desc" }, { accountName: "asc" }],
    where: {
      branchId,
      companyId: tenant.companyId,
      isActive: true,
      bank: { isActive: true },
    },
  });

  return accounts.map((account: Record<string, unknown>) =>
    mapQrPaymentAccountToPosBank({
      ...mapAccount(account),
      bankName: String((account.bank as Record<string, unknown>)?.bankName ?? ""),
    }),
  );
}

export async function saveQrPaymentBank(input: SaveQrPaymentBankInput, tenant: TenantContext) {
  const bankName = stringValue(input.bankName).trim();
  if (!bankName) {
    throw new Error("Bank name is required.");
  }

  const shortCode = stringValue(input.shortCode, bankName.slice(0, 6)).trim().toUpperCase();
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;

  return withTenantTransaction({
    action: input.id ? "update" : "create",
    module: "settings",
    newData: input,
    tenant,
    write: async (tx) => {
      if (input.id) {
        const existing = await tx.qrPaymentBank.findFirst({
          where: { companyId: tenant.companyId, id: input.id },
        });
        if (!existing) {
          throw new Error("QR payment bank was not found.");
        }

        const duplicate = await tx.qrPaymentBank.findFirst({
          where: {
            bankName,
            companyId: tenant.companyId,
            id: { not: input.id },
          },
        });
        if (duplicate) {
          throw new Error("Bank name already exists.");
        }

        return mapBank(await tx.qrPaymentBank.update({
          data: {
            bankName,
            isActive: input.isActive ?? existing.isActive,
            logoUrl: input.logoUrl ?? null,
            shortCode,
            sortOrder,
          },
          where: { id: input.id },
        }));
      }

      const duplicate = await tx.qrPaymentBank.findFirst({
        where: { bankName, companyId: tenant.companyId },
      });
      if (duplicate) {
        throw new Error("Bank name already exists.");
      }

      return mapBank(await tx.qrPaymentBank.create({
        data: {
          bankName,
          companyId: tenant.companyId,
          isActive: input.isActive ?? true,
          logoUrl: input.logoUrl ?? null,
          shortCode,
          sortOrder,
        },
      }));
    },
  });
}

export async function archiveQrPaymentBank(bankId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "archive",
    module: "settings",
    newData: { bankId },
    tenant,
    write: async (tx) => {
      const bank = await tx.qrPaymentBank.findFirst({
        where: { companyId: tenant.companyId, id: bankId },
      });
      if (!bank) {
        throw new Error("QR payment bank was not found.");
      }

      await tx.qrPaymentBank.update({
        data: { isActive: false },
        where: { id: bankId },
      });

      await tx.qrPaymentAccount.updateMany({
        data: { isActive: false },
        where: { bankId, companyId: tenant.companyId },
      });

      return mapBank({ ...bank, isActive: false });
    },
  });
}

export async function deleteQrPaymentBank(bankId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "delete",
    module: "settings",
    newData: { bankId },
    tenant,
    write: async (tx) => {
      const accountCount = await tx.qrPaymentAccount.count({
        where: { bankId, companyId: tenant.companyId },
      });
      if (accountCount > 0) {
        throw new Error("Cannot delete a bank that still has QR accounts. Archive it instead.");
      }

      const bank = await tx.qrPaymentBank.findFirst({
        where: { companyId: tenant.companyId, id: bankId },
      });
      if (!bank) {
        throw new Error("QR payment bank was not found.");
      }

      await tx.qrPaymentBank.delete({ where: { id: bankId } });
      return mapBank(bank);
    },
  });
}

export async function saveQrPaymentAccount(input: SaveQrPaymentAccountInput, tenant: TenantContext) {
  const accountName = stringValue(input.accountName).trim();
  const accountNumber = stringValue(input.accountNumber).trim();
  const branchId = stringValue(input.branchId);
  const bankId = stringValue(input.bankId);

  if (!bankId) {
    throw new Error("A bank must be selected.");
  }
  if (!branchId) {
    throw new Error("A branch must be selected.");
  }
  if (!accountName) {
    throw new Error("Account name is required.");
  }
  if (!accountNumber) {
    throw new Error("Account number is required.");
  }

  const isActive = input.isActive ?? false;
  if (isActive && !input.qrImageUrl) {
    throw new Error("QR image is required before activating an account.");
  }

  return withTenantTransaction({
    action: input.id ? "update" : "create",
    module: "settings",
    newData: input,
    tenant,
    write: async (tx) => {
      await assertBranchInScope(tx, tenant, branchId);
      const bank = await tx.qrPaymentBank.findFirst({
        where: { companyId: tenant.companyId, id: bankId, isActive: true },
      });
      if (!bank) {
        throw new Error("Active QR payment bank was not found.");
      }

      const branch = await tx.branch.findFirst({
        where: { companyId: tenant.companyId, id: branchId },
      });
      if (!branch) {
        throw new Error("Branch was not found for this company.");
      }

      const duplicate = await tx.qrPaymentAccount.findFirst({
        where: {
          accountNumber,
          bankId,
          branchId,
          companyId: tenant.companyId,
          ...(input.id ? { id: { not: input.id } } : {}),
        },
      });
      if (duplicate) {
        throw new Error("An account with this number already exists for the selected bank and branch.");
      }

      const payload = {
        accountName,
        accountNumber,
        bankId,
        branchId,
        companyId: tenant.companyId,
        displayLabel: stringValue(input.displayLabel, accountName),
        isActive,
        isDefault: Boolean(input.isDefault),
        printOnReceipt: input.printOnReceipt ?? true,
        qrImageUrl: input.qrImageUrl ?? null,
        showOnCustomerDisplay: input.showOnCustomerDisplay ?? true,
      };

      let account;
      if (input.id) {
        const existing = await tx.qrPaymentAccount.findFirst({
          where: { companyId: tenant.companyId, id: input.id },
        });
        if (!existing) {
          throw new Error("QR payment account was not found.");
        }

        account = await tx.qrPaymentAccount.update({
          data: payload,
          where: { id: input.id },
        });
      } else {
        account = await tx.qrPaymentAccount.create({ data: payload });
      }

      if (payload.isDefault) {
        await tx.qrPaymentAccount.updateMany({
          data: { isDefault: false },
          where: {
            branchId,
            companyId: tenant.companyId,
            id: { not: account.id },
          },
        });
        account = await tx.qrPaymentAccount.update({
          data: { isDefault: true },
          where: { id: account.id },
        });
      }

      return mapAccount(account);
    },
  });
}

export async function archiveQrPaymentAccount(accountId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "archive",
    module: "settings",
    newData: { accountId },
    tenant,
    write: async (tx) => {
      const account = await tx.qrPaymentAccount.findFirst({
        where: { companyId: tenant.companyId, id: accountId },
      });
      if (!account) {
        throw new Error("QR payment account was not found.");
      }

      return mapAccount(await tx.qrPaymentAccount.update({
        data: { isActive: false, isDefault: false },
        where: { id: accountId },
      }));
    },
  });
}

export async function deleteQrPaymentAccount(accountId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "delete",
    module: "settings",
    newData: { accountId },
    tenant,
    write: async (tx) => {
      const account = await tx.qrPaymentAccount.findFirst({
        where: { companyId: tenant.companyId, id: accountId },
      });
      if (!account) {
        throw new Error("QR payment account was not found.");
      }

      await tx.qrPaymentAccount.delete({ where: { id: accountId } });
      return mapAccount(account);
    },
  });
}

export async function setDefaultQrPaymentAccount(accountId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "update",
    module: "settings",
    newData: { accountId },
    tenant,
    write: async (tx) => {
      const account = await tx.qrPaymentAccount.findFirst({
        where: { companyId: tenant.companyId, id: accountId, isActive: true },
      });
      if (!account) {
        throw new Error("Active QR payment account was not found.");
      }

      await tx.qrPaymentAccount.updateMany({
        data: { isDefault: false },
        where: { branchId: account.branchId, companyId: tenant.companyId },
      });

      return mapAccount(await tx.qrPaymentAccount.update({
        data: { isDefault: true },
        where: { id: accountId },
      }));
    },
  });
}
