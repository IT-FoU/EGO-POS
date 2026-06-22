import { getPrismaSaleReceipt } from "@/features/pos/post-sale-repository";
import { getPrismaPosSnapshot } from "@/features/pos/prisma-repository";
import { runRead } from "@/lib/api/write-response";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return runRead(async (tenant) => {
    const snapshot = await getPrismaPosSnapshot(tenant);
    return getPrismaSaleReceipt(tenant, id, {
      branchName: snapshot.branchName,
      cashierName: snapshot.cashierName,
      showTaxOnReceipt: snapshot.receiptSettings.showTaxOnReceipt,
    });
  });
}
