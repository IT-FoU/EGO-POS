import { PosPageClient } from "@/features/pos/components/pos-page-client";
import { getPosSnapshot } from "@/features/pos/pos-service";
import { createPosPermissionPolicyFromDatabase } from "@/features/access-control/pos-policy-loader";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { isDemoMode } from "@/lib/demo-mode";

export default async function PosPage() {
  const session = await requireSession();
  if (session.user.allowPOSAccess === false) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-6 text-danger">
        You do not have permission to perform this action.
      </div>
    );
  }
  const snapshot = await getPosSnapshot();
  const tenant = tenantFromSession(session);
  const posPermissionPolicy = await createPosPermissionPolicyFromDatabase({
    assignedTerminal: session.user.assignedTerminal,
    branchName: snapshot.branchName,
    displayName: session.user.name,
    roles: session.user.roles,
    tenant,
    userId: session.user.id,
    username: session.user.username,
  });

  return (
      <PosPageClient
      branchId={snapshot.branchId}
      branchName={snapshot.branchName}
      cashierName={snapshot.cashierName}
      cashSession={snapshot.cashSession}
      customers={snapshot.customers}
      loyaltySettings={snapshot.loyaltySettings}
      nextSaleNo={snapshot.nextSaleNo}
      products={snapshot.products}
      promotionBanners={snapshot.promotionBanners}
      qrBanks={snapshot.qrBanks}
      receiptSettings={snapshot.receiptSettings}
      taxInclusive={snapshot.taxInclusive}
      taxRatePercent={snapshot.taxRatePercent}
      warehouseId={snapshot.warehouseId}
      posPermissionPolicy={posPermissionPolicy}
      demoMode={isDemoMode()}
      devDebug={process.env.NEXT_PUBLIC_DEV_DEBUG === "true"}
    />
  );
}
