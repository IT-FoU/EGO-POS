import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getPrismaSettings, getSettingsLandingSummary } from "@/features/settings/prisma-repository";
import { SettingsLanding } from "@/features/settings/components/settings-landing";
import { isCanonicalModuleEnabled, settingsLandingHrefs } from "@/features/access-control/module-access";
import { redactSettingsRead } from "@/features/access-control/phase3-permissions";
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
  const [settings, summary] = await Promise.all([
    settingsOn ? getPrismaSettings(tenant) : Promise.resolve(null),
    getSettingsLandingSummary(tenant, { settingsOn, staffOn }),
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
        activeQrAccounts: summary.activeQrAccounts,
        activeQrBanks: summary.activeQrBanks,
        activeStaff: summary.activeStaff,
        approvalRulesEnabled: summary.approvalRulesEnabled,
        hasLogo: summary.hasLogo,
        settings: settings ? redactSettingsRead(settings, navigation.keys) : null,
      }}
      locale={locale}
    />
  );
}
