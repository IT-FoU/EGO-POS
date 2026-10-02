import { SettingsIndexScrollGuard } from "@/features/settings/components/settings-index-scroll-guard";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { requireSettingsDestination } from "@/lib/auth/module-access";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  try {
    await requireSettingsDestination(tenantFromSession(session), "index");
  } catch (error) {
    if (error instanceof AccountAccessDeniedError || error instanceof PermissionDeniedError) return <StoreAccessDenied />;
    throw error;
  }

  return (
    <>
      <SettingsIndexScrollGuard />
      {children}
    </>
  );
}
