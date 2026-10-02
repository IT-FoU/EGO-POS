import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { AccountAccessDeniedError, requireBackOfficeAccess } from "@/lib/auth/account-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  try {
    await requireBackOfficeAccess(tenantFromSession(session));
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) return <StoreAccessDenied />;
    throw error;
  }
  if (!canViewStoreNavigationItem(session.user.roles, "purchasing")) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

