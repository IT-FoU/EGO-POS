import type { QrBank } from "@/features/pos/types";

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseQrPaymentBanks(value: unknown): QrBank[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): QrBank | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const bank = entry as Record<string, unknown>;
      const id = optionalString(bank.id);
      const bankName = optionalString(bank.bankName);
      const accountName = optionalString(bank.accountName);
      const accountNumber = optionalString(bank.accountNumber);

      if (!id || !bankName || !accountName || !accountNumber) {
        return null;
      }

      const qrImageUrl = optionalString(bank.qrImageUrl);

      return {
        accountName,
        accountNumber,
        bankName,
        id,
        ...(qrImageUrl ? { qrImageUrl } : {}),
      };
    })
    .filter((bank): bank is QrBank => bank !== null);
}
