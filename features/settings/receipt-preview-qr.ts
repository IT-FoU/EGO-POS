import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

/**
 * First active branch QR account with Print on Receipt enabled and a usable image.
 * Used only for Settings receipt preview — never invents QR images.
 */
export async function getReceiptPreviewQrImageUrl(
  tenant: TenantContext,
  branchId: string | null | undefined,
): Promise<string | null> {
  const resolvedBranchId = String(branchId ?? "").trim();
  if (!resolvedBranchId) return null;

  const account = await db.qrPaymentAccount.findFirst({
    orderBy: [{ isDefault: "desc" }, { accountName: "asc" }],
    select: { qrImageUrl: true },
    where: {
      branchId: resolvedBranchId,
      companyId: tenant.companyId,
      isActive: true,
      printOnReceipt: true,
      qrImageUrl: { not: null },
      bank: { isActive: true },
    },
  });

  const url = String(account?.qrImageUrl ?? "").trim();
  return url || null;
}
