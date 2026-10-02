import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getCompanyBusinessLogoUrl, getPrismaSettings } from "@/features/settings/prisma-repository";
import { SettingsLanding } from "@/features/settings/components/settings-landing";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { APPROVAL_RULE_KEYS } from "@/features/access-control/permission-catalog";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { isCanonicalModuleEnabled, settingsLandingHrefs } from "@/features/access-control/module-access";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { readNavigationAccess } from "@/lib/auth/module-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";

export default async function SettingsPage() {
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const tenant = tenantFromSession(session);
  let navigation;
  try {
    navigation = await readNavigationAccess(tenant);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return <StoreAccessDenied description={tSettings("accessDeniedBody", locale)} title={tSettings("accessDeniedTitle", locale)} />;
    }
    throw error;
  }
  const settingsOn = navigation.keys.includes("*") || isCanonicalModuleEnabled("settings", navigation.keys);
  const staffOn = navigation.keys.includes("*") || isCanonicalModuleEnabled("staff", navigation.keys);
  const [settings, businessLogoUrl, qrSnapshot, staffSnapshot] = await Promise.all([
    settingsOn ? getPrismaSettings(tenant) : Promise.resolve(null),
    settingsOn ? getCompanyBusinessLogoUrl(tenant.companyId) : Promise.resolve(null),
    settingsOn ? getQrPaymentSettingsSnapshot(tenant) : Promise.resolve(null),
    staffOn ? getStaffAccessSnapshot(tenant) : Promise.resolve(null),
  ]);
  const allowedHrefs = settingsLandingHrefs({
    allowBackOfficeAccess: navigation.allowBackOfficeAccess,
    isOwner: navigation.keys.includes("*"),
    keys: navigation.keys,
  });

  return (
    <SettingsLanding
      allowedHrefs={allowedHrefs}
      facts={{
        activeQrAccounts: qrSnapshot?.accounts.filter((account) => account.isActive).length ?? 0,
        activeQrBanks: qrSnapshot?.banks.filter((bank) => bank.isActive).length ?? 0,
        activeStaff: staffSnapshot?.staff.filter((staff) => staff.status === "active").length ?? 0,
        approvalRulesEnabled: staffSnapshot ? APPROVAL_RULE_KEYS.filter((ruleKey) => staffSnapshot.approvalRules.find((rule) => rule.ruleKey === ruleKey)?.isEnabled ?? true).length : 0,
        hasLogo: Boolean(businessLogoUrl),
        settings,
      }}
      locale={locale}
    />
  );
}
