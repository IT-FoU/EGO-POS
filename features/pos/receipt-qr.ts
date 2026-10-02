export const QR_ACCOUNT_REFERENCE_PREFIX = "qr-account:";

export type ReceiptQrAccount = {
  id: string;
  printOnReceipt?: boolean | null;
  qrImageUrl?: string | null;
};

export function qrAccountReference(accountId: string) {
  return `${QR_ACCOUNT_REFERENCE_PREFIX}${accountId}`;
}

export function parseQrAccountReference(referenceNo: string | null | undefined) {
  if (!referenceNo || !referenceNo.startsWith(QR_ACCOUNT_REFERENCE_PREFIX)) return null;
  const accountId = referenceNo.slice(QR_ACCOUNT_REFERENCE_PREFIX.length).trim();
  return accountId || null;
}

/**
 * Print the QR image only when this sale's payment names that exact account
 * and the account flag is on. Never substitute a default or unrelated account.
 */
export function resolveReceiptQrImage(input: {
  account: ReceiptQrAccount | null | undefined;
  referencedAccountId: string | null | undefined;
}) {
  const referencedAccountId = input.referencedAccountId?.trim();
  if (!referencedAccountId || !input.account) return null;
  if (input.account.id !== referencedAccountId) return null;
  if (input.account.printOnReceipt !== true) return null;
  const imageUrl = String(input.account.qrImageUrl ?? "").trim();
  return imageUrl || null;
}

export function receiptQrImageFromPayments(
  payments: Array<{ paymentMethod?: string | null; referenceNo?: string | null }> | null | undefined,
  accounts: ReceiptQrAccount[],
) {
  const qrPayment = (payments ?? []).find((payment) => payment.paymentMethod === "qr" && payment.referenceNo);
  const referencedAccountId = parseQrAccountReference(qrPayment?.referenceNo);
  if (!referencedAccountId) return null;
  const account = accounts.find((item) => item.id === referencedAccountId) ?? null;
  return resolveReceiptQrImage({ account, referencedAccountId });
}
