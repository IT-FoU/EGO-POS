import { loadNotifications } from "@/features/notifications/load-notifications";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { readNavigationAccess } from "@/lib/auth/module-access";
import { requireApiSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function GET() {
  const session = await requireApiSession();
  const companyId = session.user.activeCompanyId;
  if (!companyId) {
    return Response.json({ items: [] });
  }

  try {
    const tenant = tenantFromSession(session);
    const navigation = await readNavigationAccess(tenant);
    if (!navigation.allowBackOfficeAccess && !navigation.allowPosAccess) {
      return Response.json({ items: [] }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const items = await loadNotifications(tenant, new Date(), {
      inventory: navigation.visibleNavKeys.includes("inventory"),
      membership: navigation.visibleNavKeys.includes("membership"),
      promotions: navigation.visibleNavKeys.includes("promotions"),
    });
    return Response.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return Response.json({ error: "Forbidden", items: [], ok: false }, { status: 403 });
    }
    throw error;
  }
}
