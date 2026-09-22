import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { STORE_ROLES, normalizeStoreRole } from "@/features/permissions/store-permissions";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { DayOffApprovalsClient } from "@/features/day-off/components/day-off-approvals-client";

export default async function DayOffApprovalsPage() {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (normalizeStoreRole(role) === STORE_ROLES.CASHIER) {
    return <StoreAccessDenied />;
  }
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Day Off Approvals</h1>
        <p className="text-sm text-muted-foreground">Owner / Manager operational review</p>
      </div>
      <DayOffApprovalsClient />
    </div>
  );
}
