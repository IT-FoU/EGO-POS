import { loadNotifications } from "@/features/notifications/load-notifications";
import { requireApiSession } from "@/lib/auth/session";

export async function GET() {
  const session = await requireApiSession();
  const companyId = session.user.activeCompanyId;
  if (!companyId) {
    return Response.json({ items: [] });
  }

  const items = await loadNotifications({
    branchId: session.user.activeBranchId,
    companyId,
    userId: session.user.id,
    warehouseId: session.user.activeWarehouseId,
  });
  return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
}
