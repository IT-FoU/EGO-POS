import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getPrismaSettings } from "@/features/settings/prisma-repository";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { canManageStoreSettings } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!canManageStoreSettings(session.user.roles)) {
    return <StoreAccessDenied />;
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const tenant = tenantFromSession(session);
  const [settings, qrSnapshot, staffSnapshot] = await Promise.all([
    getPrismaSettings(tenant),
    getQrPaymentSettingsSnapshot(tenant),
    getStaffAccessSnapshot(tenant),
  ]);

  return (
    <SettingsForm
      initialQrAccounts={qrSnapshot.accounts}
      initialQrBanks={qrSnapshot.banks}
      initialSettings={settings}
      initialStaffSnapshot={staffSnapshot}
      locale={locale}
      qrBranches={qrSnapshot.branches}
    />
  );
}
