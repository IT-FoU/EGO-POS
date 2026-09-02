import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readJsonFromStorage, writeJsonToStorage } from "@/lib/demo/storage";
import type { QrBank } from "@/features/pos/types";
import { mapQrPaymentAccountToPosBank, type QrPaymentAccountRecord, type QrPaymentBankRecord } from "@/features/qr-payments/types";

export const CUSTOMER_DISPLAY_QR_EVENT = "ego-pos:customer-display-qr";
export const CUSTOMER_DISPLAY_QR_CATALOG_EVENT = "ego-pos:customer-display-qr-catalog";

export type CustomerDisplayQrIntent = {
  bankId: string;
  visible: boolean;
};

export const DEFAULT_CUSTOMER_DISPLAY_QR_INTENT: CustomerDisplayQrIntent = {
  bankId: "",
  visible: false,
};

export function customerDisplayQrBanks(banks: QrBank[]) {
  return banks.filter((bank) => bank.showOnCustomerDisplay !== false && Boolean(bank.qrImageUrl));
}

export function readCustomerDisplayQrIntent(): CustomerDisplayQrIntent {
  const parsed = readJsonFromStorage<Partial<CustomerDisplayQrIntent>>(DemoStorageKeys.customerDisplayQr, {});
  return {
    bankId: typeof parsed.bankId === "string" ? parsed.bankId : "",
    visible: parsed.visible === true,
  };
}

export function writeCustomerDisplayQrIntent(intent: CustomerDisplayQrIntent) {
  writeJsonToStorage(DemoStorageKeys.customerDisplayQr, intent);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOMER_DISPLAY_QR_EVENT, { detail: intent }));
  }
}

export function hideCustomerDisplayQr(bankId = "") {
  writeCustomerDisplayQrIntent({ bankId, visible: false });
}

export function readCustomerDisplayQrCatalog(): QrBank[] {
  const parsed = readJsonFromStorage<QrBank[]>(DemoStorageKeys.customerDisplayQrCatalog, []);
  return Array.isArray(parsed) ? customerDisplayQrBanks(parsed) : [];
}

export function writeCustomerDisplayQrCatalog(banks: QrBank[]) {
  writeJsonToStorage(DemoStorageKeys.customerDisplayQrCatalog, customerDisplayQrBanks(banks));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOMER_DISPLAY_QR_CATALOG_EVENT));
  }
  syncCustomerDisplayQrAfterCatalogChange();
}

export function buildCustomerDisplayQrCatalog(
  accounts: QrPaymentAccountRecord[],
  banks: QrPaymentBankRecord[],
) {
  return customerDisplayQrBanks(
    accounts
      .filter((account) => account.isActive)
      .map((account) =>
        mapQrPaymentAccountToPosBank({
          ...account,
          bankName: banks.find((bank) => bank.id === account.bankId)?.bankName ?? "",
        }),
      ),
  );
}

export function publishCustomerDisplayQrCatalog(
  accounts: QrPaymentAccountRecord[],
  banks: QrPaymentBankRecord[],
) {
  writeCustomerDisplayQrCatalog(buildCustomerDisplayQrCatalog(accounts, banks));
}

export function syncCustomerDisplayQrAfterCatalogChange() {
  const catalog = readCustomerDisplayQrCatalog();
  const intent = readCustomerDisplayQrIntent();
  if (intent.visible && intent.bankId && !catalog.some((bank) => bank.id === intent.bankId)) {
    hideCustomerDisplayQr(intent.bankId);
  }
}

export function maskAccountReference(value: string | null | undefined) {
  const raw = (value ?? "").replace(/\s+/g, "");
  if (raw.length <= 4) {
    return raw;
  }
  return `${"•".repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
}
