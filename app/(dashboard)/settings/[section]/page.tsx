import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { canManageStoreSettings } from "@/features/permissions/store-ui-permissions";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { SettingsForm, type SettingsDetailSection } from "@/features/settings/components/settings-form";
import { getCompanyBusinessLogoUrl, getPrismaSettings } from "@/features/settings/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";

const sections = new Set<SettingsDetailSection>([
  "company-profile", "business-logo", "tax", "cash-shift", "receipt",
  "qr-payments", "customer-display", "staff", "roles", "approval-rules",
  "day-off", "ot", "loyalty",
]);

export default async function SettingsDetailPage({ params }: { params: Promise<{ section: string }> }) {
  const { section: rawSection } = await params;
  if (!sections.has(rawSection as SettingsDetailSection)) notFound();
  const section = rawSection as SettingsDetailSection;
  const session = await requireSession();
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  if (!canManageStoreSettings(session.user.roles)) {
    return <StoreAccessDenied description={tSettings("accessDeniedBody", locale)} title={tSettings("accessDeniedTitle", locale)} />;
  }

  const tenant = tenantFromSession(session);
  const needsQr = section === "qr-payments";
  const needsStaff = section === "staff" || section === "roles" || section === "approval-rules";
  const [settings, businessLogoUrl, qrSnapshot, staffSnapshot] = await Promise.all([
    getPrismaSettings(tenant),
    section === "business-logo" ? getCompanyBusinessLogoUrl(tenant.companyId) : Promise.resolve(null),
    needsQr ? getQrPaymentSettingsSnapshot(tenant) : Promise.resolve(null),
    needsStaff ? getStaffAccessSnapshot(tenant) : Promise.resolve(undefined),
  ]);

  return (
    <SettingsForm
      initialBusinessLogoUrl={businessLogoUrl}
      initialQrAccounts={qrSnapshot?.accounts}
      initialQrBanks={qrSnapshot?.banks}
      initialSettings={settings}
      initialStaffSnapshot={staffSnapshot}
      locale={locale}
      qrBranches={qrSnapshot?.branches}
      section={section}
    />
  );
}
