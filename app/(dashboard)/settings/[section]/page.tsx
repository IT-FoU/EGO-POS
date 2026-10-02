import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { getStaffAccessSnapshot } from "@/features/access-control/prisma-repository";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { requireSettingsDestination } from "@/lib/auth/module-access";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { getQrPaymentSettingsSnapshot } from "@/features/qr-payments/prisma-repository";
import { getActiveBranchInformation } from "@/features/settings/branch-information";
import { SettingsForm, type SettingsDetailSection } from "@/features/settings/components/settings-form";
import { getCompanyBusinessLogoUrl, getPrismaSettings } from "@/features/settings/prisma-repository";
import { getReceiptPreviewQrImageUrl } from "@/features/settings/receipt-preview-qr";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";
import { tSettings } from "@/lib/i18n/settings-copy";
import type { SettingsFormData } from "@/features/settings/types";

const blankSettings: SettingsFormData = {
  baseCurrency: "LAK",
  companyName: "",
  currencyDisplay: "LAK",
  decimalPlaces: 0,
  loyaltyEnabled: false,
  loyaltyMinRedeemPoints: 0,
  loyaltyPointValueLak: 0,
  loyaltySpendPerPointLak: 0,
  receiptPaperSize: "80mm",
  receiptCustomWidthMm: 80,
  receiptCustomHeightMm: 200,
  receiptPrintMode: "ask_every_time",
  receiptPrefix: "",
  receiptShowAddress: false,
  receiptShowBranchName: false,
  receiptShowCashier: false,
  receiptShowCompanyName: false,
  receiptShowDateTime: false,
  receiptShowEmail: false,
  receiptShowFooter: false,
  receiptShowHeader: false,
  receiptShowPhone: false,
  receiptShowQr: false,
  receiptShowReceiptNumber: false,
  receiptShowTaxNumber: false,
  requireCashShiftBeforeSale: true,
  roundingMethod: "none",
  showLogoOnReceipt: false,
  showTaxOnReceipt: false,
  taxInclusive: false,
  vatEnabled: false,
  vatRate: 0,
};

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
  const tenant = tenantFromSession(session);
  try {
    await requireSettingsDestination(tenant, section);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError || error instanceof PermissionDeniedError) {
      return <StoreAccessDenied description={tSettings("accessDeniedBody", locale)} title={tSettings("accessDeniedTitle", locale)} />;
    }
    throw error;
  }
  const needsQr = section === "qr-payments";
  const needsStaff = section === "staff" || section === "roles" || section === "approval-rules" || section === "day-off" || section === "ot";
  const needsLogo = section === "business-logo" || section === "receipt";
  const needsBranch = section === "branch-information" || section === "help" || section === "receipt";
  const [settings, businessLogoUrl, qrSnapshot, staffSnapshot, activeBranch] = await Promise.all([
    needsStaff ? Promise.resolve(blankSettings) : getPrismaSettings(tenant),
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
      actorIsOwner={session.user.roles?.includes("Owner") ?? false}
      actorUserId={session.user.id}
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
