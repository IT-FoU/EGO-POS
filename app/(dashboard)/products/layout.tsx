import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";

export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "products")) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

