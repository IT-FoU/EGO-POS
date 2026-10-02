import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getCompanyBusinessLogoUrl, getPrismaSettings } from "@/features/settings/prisma-repository";
import { SettingsLanding } from "@/features/settings/components/settings-landing";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { APPROVAL_RULE_KEYS } from "@/features/access-control/permission-catalog";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { canManageStoreSettings } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";

export default async function SettingsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (!canManageStoreSettings(session.user.roles)) {
    return (
      <StoreAccessDenied
        description={tSettings("accessDeniedBody", locale)}
        title={tSettings("accessDeniedTitle", locale)}
      />
    );
  }
  const tenant = tenantFromSession(session);
  const [settings, businessLogoUrl, qrSnapshot, staffSnapshot] = await Promise.all([
    getPrismaSettings(tenant),
    getCompanyBusinessLogoUrl(tenant.companyId),
    getQrPaymentSettingsSnapshot(tenant),
    getStaffAccessSnapshot(tenant),
  ]);

  return (
    <SettingsLanding
      facts={{
        activeQrAccounts: qrSnapshot.accounts.filter((account) => account.isActive).length,
        activeQrBanks: qrSnapshot.banks.filter((bank) => bank.isActive).length,
        activeStaff: staffSnapshot.staff.filter((staff) => staff.status === "active").length,
        approvalRulesEnabled: APPROVAL_RULE_KEYS.filter((ruleKey) => staffSnapshot.approvalRules.find((rule) => rule.ruleKey === ruleKey)?.isEnabled ?? true).length,
        hasLogo: Boolean(businessLogoUrl),
        settings,
      }}
      locale={locale}
    />
  );
}
