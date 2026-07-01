import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";

export default async function SuppliersLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "suppliers")) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

