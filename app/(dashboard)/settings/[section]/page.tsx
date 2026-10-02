import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { canManageStoreSettings } from "@/features/permissions/store-ui-permissions";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { getActiveBranchInformation } from "@/features/settings/branch-information";
import { SettingsForm, type SettingsDetailSection } from "@/features/settings/components/settings-form";
import { getCompanyBusinessLogoUrl, getPrismaSettings } from "@/features/settings/prisma-repository";
import { getReceiptPreviewQrImageUrl } from "@/features/settings/receipt-preview-qr";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";

const sections = new Set<SettingsDetailSection>([
  "company-profile", "business-logo", "branch-information", "tax", "cash-shift", "receipt",
  "qr-payments", "customer-display", "staff", "roles", "approval-rules",
  "day-off", "ot", "loyalty", "help",
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
  const needsStaff = section === "staff" || section === "roles" || section === "approval-rules" || section === "day-off" || section === "ot";
  const needsLogo = section === "business-logo" || section === "receipt";
  const needsBranch = section === "branch-information" || section === "help" || section === "receipt";
  const [settings, businessLogoUrl, qrSnapshot, staffSnapshot, activeBranch] = await Promise.all([
    getPrismaSettings(tenant),
    needsLogo ? getCompanyBusinessLogoUrl(tenant.companyId) : Promise.resolve(null),
    needsQr ? getQrPaymentSettingsSnapshot(tenant) : Promise.resolve(null),
    needsStaff ? getStaffAccessSnapshot(tenant) : Promise.resolve(undefined),
    needsBranch ? getActiveBranchInformation(tenant) : Promise.resolve(null),
  ]);

  const receiptPreviewQrUrl =
    section === "receipt"
      ? await getReceiptPreviewQrImageUrl(tenant, activeBranch?.id ?? tenant.branchId)
      : null;

  if (section === "branch-information" && !activeBranch) {
    return (
      <StoreAccessDenied
        description={tSettings("activeBranchMissingBody", locale)}
        title={tSettings("activeBranchMissingTitle", locale)}
      />
    );
  }

  return (
    <SettingsForm
      initialActiveBranch={activeBranch}
      initialBusinessLogoUrl={businessLogoUrl}
      initialHelpContext={
        section === "help"
          ? {
              branchName: activeBranch?.name ?? "",
              companyName: settings.companyName || session.user.activeCompanyName || "",
              locale,
              pagePath: "/settings/help",
              userDisplayName: session.user.name || "",
              username: session.user.username || "",
            }
          : null
      }
      initialQrAccounts={qrSnapshot?.accounts}
      initialQrBanks={qrSnapshot?.banks}
      initialReceiptPreviewQrUrl={receiptPreviewQrUrl}
      initialSettings={settings}
      initialStaffSnapshot={staffSnapshot}
      locale={locale}
      qrBranches={qrSnapshot?.branches}
      section={section}
    />
  );
}
