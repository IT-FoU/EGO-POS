/** Receipt logo comes from the company asset and the existing toggle. No platform mark. */
export function receiptBusinessLogoSrc(showLogoOnReceipt: boolean, logoUrl?: string | null) {
  if (!showLogoOnReceipt) return null;
  const src = String(logoUrl ?? "").trim();
  return src || null;
}
