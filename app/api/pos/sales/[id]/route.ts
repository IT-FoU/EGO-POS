import { getPrismaSaleById } from "@/features/pos/post-sale-repository";
import { assertPosActionAllowed, buildPosPolicyForTenant } from "@/features/pos/pos-permission-guard";
import { runRead } from "@/lib/api/write-response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return runRead(async (tenant) => {
    const policy = await buildPosPolicyForTenant(tenant);
    assertPosActionAllowed(policy, "view_recent_sales");
    const sale = await getPrismaSaleById(tenant, id);
    if (!sale) {
      throw new Error("Sale was not found.");
    }
    return sale;
  });
}
