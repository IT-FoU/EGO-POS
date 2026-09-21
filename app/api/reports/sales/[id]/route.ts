import { getPrismaSaleById } from "@/features/pos/post-sale-shared";
import { READ_PERMISSIONS } from "@/lib/auth/permissions";
import { runRead } from "@/lib/api/write-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return runRead(async (tenant) => {
    const sale = await getPrismaSaleById(tenant, id);
    if (!sale) {
      throw new Error("Sale was not found.");
    }
    return sale;
  }, READ_PERMISSIONS.reportsView);
}
