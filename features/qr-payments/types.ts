import type { QrBank } from "@/features/pos/types";

export type QrPaymentBankRecord = {
  bankName: string;
  id: string;
  isActive: boolean;
  logoUrl?: string;
  shortCode: string;
  sortOrder: number;
};

export type QrPaymentAccountRecord = {
  accountName: string;
  accountNumber: string;
  bankId: string;
  branchId: string;
  displayLabel: string;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  printOnReceipt: boolean;
  qrImageUrl?: string;
  showOnCustomerDisplay: boolean;
};

export type BranchOption = {
  id: string;
  name: string;
};

export type QrPaymentSettingsSnapshot = {
  accounts: QrPaymentAccountRecord[];
  banks: QrPaymentBankRecord[];
  branches: BranchOption[];
};

export type SaveQrPaymentBankInput = {
  bankName: string;
  id?: string;
  isActive?: boolean;
  logoUrl?: string;
  shortCode?: string;
  sortOrder?: number;
};

export type SaveQrPaymentAccountInput = {
  accountName: string;
  accountNumber: string;
  bankId: string;
  branchId: string;
  displayLabel?: string;
  id?: string;
  isActive?: boolean;
  isDefault?: boolean;
  printOnReceipt?: boolean;
  qrImageUrl?: string;
  showOnCustomerDisplay?: boolean;
};

export function mapQrPaymentAccountToPosBank(
  account: QrPaymentAccountRecord & { bankName: string; logoUrl?: string },
): QrBank {
  return {
    accountName: account.accountName,
    accountNumber: account.accountNumber,
    bankName: account.bankName,
    displayLabel: account.displayLabel,
    id: account.id,
    showOnCustomerDisplay: account.showOnCustomerDisplay,
    ...(account.logoUrl ? { logoUrl: account.logoUrl } : {}),
    ...(account.qrImageUrl ? { qrImageUrl: account.qrImageUrl } : {}),
  };
}
