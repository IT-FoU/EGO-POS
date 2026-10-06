"use client";

import { localizeSettingsError, tSettings } from "@/lib/i18n/settings-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import type { SupportedLocale } from "@/lib/constants";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { updateSettingsAction } from "@/features/settings/actions";
import type { LoyaltyCatalogItem } from "@/features/settings/components/loyalty-rules-panel";
import type { LoyaltyEarningRuleRecord } from "@/features/loyalty/earning-rules";
import { ACTIVE_COMPANY_NAME_CHANGE_EVENT } from "@/lib/auth/active-company-name";
import type { SettingsFormData } from "@/features/settings/types";
import type { BranchOption, QrPaymentAccountRecord, QrPaymentBankRecord } from "@/features/qr-payments/types";
import type { StaffAccessSnapshot } from "@/features/access-control/types";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import { validateCustomPaperDimensions } from "@/features/settings/receipt-layout";
import { readReceiptPrintModePreference, writeReceiptPrintModePreference } from "@/features/settings/receipt-print-mode";
import { SettingsSectionLoading } from "@/features/settings/components/settings-section-loading";
import type { SettingsFieldUpdate } from "@/features/settings/components/settings-section-types";

const CompanySettingsSection = dynamic(() => import("@/features/settings/components/company-settings-section").then((module) => module.CompanySettingsSection), { loading: () => <SettingsSectionLoading /> });
const LogoSettingsSection = dynamic(() => import("@/features/settings/components/logo-settings-section").then((module) => module.LogoSettingsSection), { loading: () => <SettingsSectionLoading /> });
const TaxSettingsSection = dynamic(() => import("@/features/settings/components/tax-settings-section").then((module) => module.TaxSettingsSection), { loading: () => <SettingsSectionLoading /> });
const CashShiftSettingsSection = dynamic(() => import("@/features/settings/components/cash-shift-settings-section").then((module) => module.CashShiftSettingsSection), { loading: () => <SettingsSectionLoading /> });
const ReceiptSettingsSection = dynamic(() => import("@/features/settings/components/receipt-settings-section").then((module) => module.ReceiptSettingsSection), { loading: () => <SettingsSectionLoading /> });
const LoyaltySettingsSection = dynamic(() => import("@/features/settings/components/loyalty-settings-section").then((module) => module.LoyaltySettingsSection), { loading: () => <SettingsSectionLoading /> });
const CustomerDisplaySettingsSection = dynamic(() => import("@/features/settings/components/customer-display-settings-section").then((module) => module.CustomerDisplaySettingsSection), { loading: () => <SettingsSectionLoading /> });
const QrPaymentBankManagementSection = dynamic(() => import("@/features/settings/components/qr-payment-bank-management-section").then((module) => module.QrPaymentBankManagementSection), { loading: () => <SettingsSectionLoading /> });
const StaffControlSection = dynamic(() => import("@/features/settings/components/staff-control-section").then((module) => module.StaffControlSection), { loading: () => <SettingsSectionLoading /> });
const DayOffSettingsPanel = dynamic(() => import("@/features/day-off/components/day-off-settings-panel").then((module) => module.DayOffSettingsPanel), { loading: () => <SettingsSectionLoading /> });
const OtSettingsPanel = dynamic(() => import("@/features/ot/components/ot-settings-panel").then((module) => module.OtSettingsPanel), { loading: () => <SettingsSectionLoading /> });
const BranchInformationPanel = dynamic(() => import("@/features/settings/components/branch-information-panel").then((module) => module.BranchInformationPanel), { loading: () => <SettingsSectionLoading /> });
const HelpSupportPanel = dynamic(() => import("@/features/settings/components/help-support-panel").then((module) => module.HelpSupportPanel), { loading: () => <SettingsSectionLoading /> });
const TerminalsPanel = dynamic(() => import("@/features/terminals/components/terminals-panel").then((module) => module.TerminalsPanel), { loading: () => <SettingsSectionLoading /> });

export type SettingsDetailSection =
  | "company-profile" | "business-logo" | "branch-information" | "tax" | "cash-shift" | "receipt"
  | "qr-payments" | "customer-display" | "staff" | "roles" | "approval-rules"
  | "day-off" | "ot" | "loyalty" | "help" | "pos-terminals";

export function SettingsForm({ actorIsOwner = false, actorUserId, canEdit = true, canSubmitSupport = false, initialActiveBranch = null, initialBusinessLogoUrl = null, initialHelpContext = null, initialLoyaltyCatalog = { categories: [], products: [] }, initialLoyaltyRules = [], initialQrAccounts = [], initialQrBanks = [], initialReceiptPreviewQrUrl = null, initialSettings, initialStaffSnapshot, initialSupportTickets = [], initialTerminals = [], locale: localeProp, qrBranches = [], section, }: {
    actorIsOwner?: boolean;
    canEdit?: boolean;
    canSubmitSupport?: boolean;
    initialSupportTickets?: import("@/features/support/support-types").SupportTicketSummary[];
    initialTerminals?: import("@/features/terminals/terminal-types").TerminalCard[];
    initialLoyaltyCatalog?: { categories: LoyaltyCatalogItem[]; products: LoyaltyCatalogItem[] };
    initialLoyaltyRules?: LoyaltyEarningRuleRecord[];
    actorUserId?: string;
    initialActiveBranch?: import("@/features/settings/branch-information").ActiveBranchInformation | null;
    initialBusinessLogoUrl?: string | null;
    initialHelpContext?: import("@/features/settings/components/help-support-panel").HelpSystemContext | null;
    initialQrAccounts?: QrPaymentAccountRecord[];
    initialQrBanks?: QrPaymentBankRecord[];
    initialReceiptPreviewQrUrl?: string | null;
    initialSettings: SettingsFormData;
    initialStaffSnapshot?: StaffAccessSnapshot;
    locale: SupportedLocale;
    qrBranches?: BranchOption[];
    section: SettingsDetailSection;
}) {
    const locale = useAppLocale(localeProp);
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [settingsConfirm, setSettingsConfirm] = useState<"taxChange" | "cashShiftOff" | "loyaltyChange" | null>(null);
    const [settings, setSettings] = useState(initialSettings);
    const [baseline, setBaseline] = useState(initialSettings);
    const [taxConfirmLines, setTaxConfirmLines] = useState<string[]>([]);
    const [loyaltyConfirmLines, setLoyaltyConfirmLines] = useState<string[]>([]);
    const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
    useEffect(() => {
        const next = {
            ...initialSettings,
            receiptPrintMode: readReceiptPrintModePreference(initialSettings.receiptPrintMode),
            requireCashShiftBeforeSale: initialSettings.requireCashShiftBeforeSale !== false,
        };
        setSettings(next);
        setBaseline(next);
    }, [initialSettings]);
    const update: SettingsFieldUpdate = (key, value) => {
        setSettings((current) => ({ ...current, [key]: value }));
    };
    function validate() {
        if (section === "company-profile" && !settings.companyName.trim())
            return tSettings("companyNameRequired", locale);
        if (section === "tax" && (settings.vatRate < 0 || settings.vatRate > 100))
            return tSettings("vatRateRange", locale);
        if (section === "loyalty" && settings.loyaltyPointValueLak < 0)
            return tSettings("loyaltyPointValueNegative", locale);
        if (section === "loyalty" && settings.loyaltyMinRedeemPoints < 1)
            return tSettings("minRedeemPointsMin", locale);
        if (section === "loyalty" && settings.loyaltyMaxRedeemPoints < 0)
            return tSettings("maxRedeemPointsNegative", locale);
        if (section === "loyalty" && settings.loyaltyMaxRedeemPoints > 0 && settings.loyaltyMaxRedeemPoints < settings.loyaltyMinRedeemPoints)
            return tSettings("maxRedeemBelowMin", locale);
        if (section === "loyalty" && settings.loyaltyExpiryEnabled && settings.loyaltyExpiryDays < 1)
            return tSettings("expiryDaysMin", locale);
        if (section === "receipt" && settings.receiptPaperSize === "custom") {
            const custom = validateCustomPaperDimensions(settings.receiptCustomWidthMm, settings.receiptCustomHeightMm);
            if (!custom.ok) return tSettings(custom.errorKey, locale);
        }
        return null;
    }
    function buildTaxConfirmLines() {
        const lines: string[] = [];
        if (settings.vatEnabled !== baseline.vatEnabled) {
            lines.push(settings.vatEnabled ? tSettings("taxEnableConfirm", locale) : tSettings("taxDisableConfirm", locale));
        }
        if (settings.taxInclusive !== baseline.taxInclusive) {
            lines.push(settings.taxInclusive ? tSettings("taxInclusiveConfirm", locale) : tSettings("taxExclusiveConfirm", locale));
        }
        if (Number(settings.vatRate) !== Number(baseline.vatRate)) {
            lines.push(tSettings("taxRateChangeConfirm", locale));
        }
        return lines;
    }
    function buildLoyaltyConfirmLines() {
        const lines: string[] = [];
        if (settings.loyaltyEnabled !== baseline.loyaltyEnabled) {
            lines.push(settings.loyaltyEnabled ? tSettings("loyaltyEnableConfirm", locale) : tSettings("loyaltyDisableConfirm", locale));
        }
        if (
            Number(settings.loyaltyPointValueLak) !== Number(baseline.loyaltyPointValueLak) ||
            Number(settings.loyaltyMinRedeemPoints) !== Number(baseline.loyaltyMinRedeemPoints) ||
            Number(settings.loyaltyMaxRedeemPoints) !== Number(baseline.loyaltyMaxRedeemPoints) ||
            settings.loyaltyAllowPartial !== baseline.loyaltyAllowPartial ||
            settings.loyaltyAllowRedeemWithDiscount !== baseline.loyaltyAllowRedeemWithDiscount ||
            settings.loyaltyExpiryEnabled !== baseline.loyaltyExpiryEnabled ||
            Number(settings.loyaltyExpiryDays) !== Number(baseline.loyaltyExpiryDays) ||
            settings.loyaltyExpiryUnit !== baseline.loyaltyExpiryUnit
        ) {
            lines.push(tSettings("loyaltyRateChangeConfirm", locale));
        }
        return lines;
    }
    function commitSettingsSave() {
        setMessage(null);
        setSettingsConfirm(null);
        startTransition(async () => {
            const printMode = settings.receiptPrintMode;
            let payload: Partial<SettingsFormData>;
            if (section === "company-profile") {
                payload = {
                    companyName: settings.companyName,
                    profileAddress: settings.profileAddress,
                    profileEmail: settings.profileEmail,
                    profilePhone: settings.profilePhone,
                    taxNumber: settings.taxNumber,
                };
            } else if (section === "tax") {
                payload = {
                    showTaxOnReceipt: settings.showTaxOnReceipt,
                    taxInclusive: settings.taxInclusive,
                    vatEnabled: settings.vatEnabled,
                    vatRate: settings.vatRate,
                };
            } else if (section === "cash-shift") {
                payload = {
                    requireCashShiftBeforeSale: (settings.requireCashShiftBeforeSale === false ? 0 : 1) as unknown as boolean,
                };
            } else if (section === "receipt") {
                writeReceiptPrintModePreference(printMode);
                payload = {
                    receiptFooter: settings.receiptFooter,
                    receiptHeader: settings.receiptHeader,
                    receiptPaperSize: settings.receiptPaperSize,
                    receiptCustomWidthMm: settings.receiptCustomWidthMm,
                    receiptCustomHeightMm: settings.receiptCustomHeightMm,
                    receiptPrefix: settings.receiptPrefix,
                    receiptShowAddress: settings.receiptShowAddress,
                    receiptShowBranchName: settings.receiptShowBranchName,
                    receiptShowCashier: settings.receiptShowCashier,
                    receiptShowCompanyName: settings.receiptShowCompanyName,
                    receiptShowDateTime: settings.receiptShowDateTime,
                    receiptShowEmail: settings.receiptShowEmail,
                    receiptShowFooter: settings.receiptShowFooter,
                    receiptShowHeader: settings.receiptShowHeader,
                    receiptShowPhone: settings.receiptShowPhone,
                    receiptShowQr: settings.receiptShowQr,
                    receiptShowReceiptNumber: settings.receiptShowReceiptNumber,
                    receiptShowTaxNumber: settings.receiptShowTaxNumber,
                    showLogoOnReceipt: settings.showLogoOnReceipt,
                };
            } else {
                payload = {
                    loyaltyAllowPartial: settings.loyaltyAllowPartial,
                    loyaltyAllowRedeemWithDiscount: settings.loyaltyAllowRedeemWithDiscount,
                    loyaltyEnabled: settings.loyaltyEnabled,
                    loyaltyExpiryDays: settings.loyaltyExpiryDays,
                    loyaltyExpiryEnabled: settings.loyaltyExpiryEnabled,
                    loyaltyExpiryUnit: settings.loyaltyExpiryUnit,
                    loyaltyMaxRedeemPoints: settings.loyaltyMaxRedeemPoints,
                    loyaltyMinRedeemPoints: settings.loyaltyMinRedeemPoints,
                    loyaltyPointValueLak: settings.loyaltyPointValueLak,
                };
            }
            const result = await updateSettingsAction(payload);
            if (!result.ok || !result.data) {
                setMessage({ text: localizeSettingsError(result.error, locale), tone: "error" });
                return;
            }
            const saved = result.data as SettingsFormData;
            const next = {
                ...saved,
                receiptPrintMode: printMode,
                requireCashShiftBeforeSale: saved.requireCashShiftBeforeSale !== false,
            };
            setSettings(next);
            setBaseline(next);
            if (section === "company-profile") {
                window.dispatchEvent(new CustomEvent(ACTIVE_COMPANY_NAME_CHANGE_EVENT, { detail: { name: saved.companyName } }));
            }
            setMessage({ text: tSettings("saved", locale), tone: "success" });
            router.refresh();
        });
    }
    function saveSettings() {
        if (!canEdit) return;
        const validationError = validate();
        if (validationError) {
            setMessage({ text: validationError, tone: "error" });
            return;
        }
        if (section === "tax") {
            const lines = buildTaxConfirmLines();
            if (lines.length) {
                setTaxConfirmLines(lines);
                setSettingsConfirm("taxChange");
                return;
            }
        }
        if (section === "cash-shift") {
            const wasRequired = baseline.requireCashShiftBeforeSale !== false;
            const nowRequired = settings.requireCashShiftBeforeSale !== false;
            if (wasRequired && !nowRequired) {
                setSettingsConfirm("cashShiftOff");
                return;
            }
        }
        if (section === "loyalty") {
            const lines = buildLoyaltyConfirmLines();
            if (lines.length) {
                setLoyaltyConfirmLines(lines);
                setSettingsConfirm("loyaltyChange");
                return;
            }
        }
        commitSettingsSave();
    }
    function isSectionDirty() {
        if (section === "company-profile") {
            return settings.companyName !== baseline.companyName || (settings.profileAddress ?? "") !== (baseline.profileAddress ?? "") || (settings.profileEmail ?? "") !== (baseline.profileEmail ?? "") || (settings.profilePhone ?? "") !== (baseline.profilePhone ?? "") || (settings.taxNumber ?? "") !== (baseline.taxNumber ?? "");
        }
        if (section === "tax") {
            return settings.vatEnabled !== baseline.vatEnabled || settings.taxInclusive !== baseline.taxInclusive || settings.showTaxOnReceipt !== baseline.showTaxOnReceipt || Number(settings.vatRate) !== Number(baseline.vatRate);
        }
        if (section === "cash-shift") {
            return (settings.requireCashShiftBeforeSale !== false) !== (baseline.requireCashShiftBeforeSale !== false);
        }
        if (section === "receipt") {
            return settings.receiptPrefix !== baseline.receiptPrefix || (settings.receiptHeader ?? "") !== (baseline.receiptHeader ?? "") || (settings.receiptFooter ?? "") !== (baseline.receiptFooter ?? "") || settings.showLogoOnReceipt !== baseline.showLogoOnReceipt || settings.receiptPaperSize !== baseline.receiptPaperSize || Number(settings.receiptCustomWidthMm) !== Number(baseline.receiptCustomWidthMm) || Number(settings.receiptCustomHeightMm) !== Number(baseline.receiptCustomHeightMm) || settings.receiptShowAddress !== baseline.receiptShowAddress || settings.receiptShowBranchName !== baseline.receiptShowBranchName || settings.receiptShowCashier !== baseline.receiptShowCashier || settings.receiptShowCompanyName !== baseline.receiptShowCompanyName || settings.receiptShowDateTime !== baseline.receiptShowDateTime || settings.receiptShowEmail !== baseline.receiptShowEmail || settings.receiptShowFooter !== baseline.receiptShowFooter || settings.receiptShowHeader !== baseline.receiptShowHeader || settings.receiptShowPhone !== baseline.receiptShowPhone || settings.receiptShowQr !== baseline.receiptShowQr || settings.receiptShowReceiptNumber !== baseline.receiptShowReceiptNumber || settings.receiptShowTaxNumber !== baseline.receiptShowTaxNumber;
        }
        if (section === "loyalty") {
            return settings.loyaltyEnabled !== baseline.loyaltyEnabled || settings.loyaltyAllowPartial !== baseline.loyaltyAllowPartial || settings.loyaltyAllowRedeemWithDiscount !== baseline.loyaltyAllowRedeemWithDiscount || settings.loyaltyExpiryEnabled !== baseline.loyaltyExpiryEnabled || settings.loyaltyExpiryUnit !== baseline.loyaltyExpiryUnit || settings.loyaltyExpiryDays !== baseline.loyaltyExpiryDays || settings.loyaltyMaxRedeemPoints !== baseline.loyaltyMaxRedeemPoints || settings.loyaltyMinRedeemPoints !== baseline.loyaltyMinRedeemPoints || settings.loyaltyPointValueLak !== baseline.loyaltyPointValueLak;
        }
        return false;
    }
    function updatePrintMode(value: SettingsFormData["receiptPrintMode"]) {
        update("receiptPrintMode", value);
        writeReceiptPrintModePreference(value);
        setMessage({ text: tSettings("savedOnThisDevice", locale), tone: "success" });
    }
    const canSaveCompanySettings = canEdit && ["company-profile", "tax", "cash-shift", "receipt", "loyalty"].includes(section);
    const detailTitle: Record<SettingsDetailSection, string> = {
      "company-profile": tSettings("companyProfile", locale),
      "business-logo": tSettings("businessLogo", locale),
      "branch-information": tSettings("branchInformation", locale),
      "tax": tSettings("taxVatSettings", locale),
      "cash-shift": tSettings("requireCashShiftBeforeSale", locale),
      "receipt": tSettings("receiptAndPrinting", locale),
      "qr-payments": tSettings("qrPayments", locale),
      "customer-display": tSettings("customerDisplay", locale),
      "staff": tSettings("staff", locale),
      "roles": tSettings("rolesAndPermissions", locale),
      "approval-rules": tSettings("approvalRulesTitle", locale),
      "day-off": tSettings("dayOff", locale),
      "ot": tSettings("otSettingsTitle", locale),
      "loyalty": tSettings("loyaltyRules", locale),
      "help": tSettings("helpAndSupport", locale),
      "pos-terminals": tSettings("posTerminals", locale),
    };
    const detailDescription: Record<SettingsDetailSection, { en: string; lo: string }> = {
      "company-profile": { en: "Store name and contact details.", lo: "ຊື່ຮ້ານ ແລະ ຂໍ້ມູນຕິດຕໍ່." },
      "business-logo": { en: "Image used on receipts and the customer display.", lo: "ຮູບພາບທີ່ໃຊ້ໃນໃບບິນ ແລະ ຈໍລູກຄ້າ." },
      "branch-information": { en: "Name and contact details for the current branch only.", lo: "ຊື່ ແລະ ຂໍ້ມູນຕິດຕໍ່ຂອງສາຂາປັດຈຸບັນເທົ່ານັ້ນ." },
      "tax": { en: "Choose how VAT is calculated and shown.", lo: "ເລືອກວິທີຄິດ ແລະ ສະແດງ VAT." },
      "cash-shift": { en: "Control whether Pay requires an open shift.", lo: "ກຳນົດວ່າຕ້ອງເປີດກະກ່ອນຊຳລະຫຼືບໍ່." },
      "receipt": { en: "Manage company receipt content and this device's print behavior.", lo: "ຈັດການເນື້ອຫາໃບບິນ ແລະ ການພິມຂອງອຸປະກອນນີ້." },
      "qr-payments": { en: "Manage banks and branch QR accounts together.", lo: "ຈັດການທະນາຄານ ແລະ ບັນຊີ QR ປະຈຳສາຂາ." },
      "customer-display": { en: "Manage this device's screen layout and media.", lo: "ຈັດການຮູບແບບຈໍ ແລະ ສື່ຂອງອຸປະກອນນີ້." },
      "staff": { en: "Manage people who can sign in.", lo: "ຈັດການຜູ້ທີ່ສາມາດເຂົ້າລະບົບ." },
      "roles": { en: "Manage what each role can do. Owner access is protected.", lo: "ຈັດການສິດຂອງແຕ່ລະບົດບາດ; ສິດເຈົ້າຂອງຖືກປົກປ້ອງ." },
      "approval-rules": { en: "Set when manager or owner approval is required.", lo: "ກຳນົດເມື່ອໃດຕ້ອງຂໍອະນຸມັດ." },
      "day-off": { en: "Manage weekly day off and leave quota.", lo: "ຈັດການວັນພັກປະຈຳອາທິດ ແລະ ໂຄຕາ." },
      "ot": { en: "Manage overtime time windows.", lo: "ຈັດການຊ່ວງເວລາເຮັດວຽກລ່ວງເວລາ." },
      "loyalty": { en: "Manage how points are earned and redeemed.", lo: "ຈັດການວິທີໄດ້ ແລະ ແລກຄະແນນ." },
      "help": { en: "Help topics and safe system information for this store.", lo: "ຫົວຂໍ້ຊ່ວຍເຫຼືອ ແລະ ຂໍ້ມູນລະບົບທີ່ປອດໄພສຳລັບຮ້ານນີ້." },
      "pos-terminals": { en: "Registers for this store. Stock and customers stay shared.", lo: "ເຄື່ອງຂາຍຂອງຮ້ານນີ້. ສະຕັອກ ແລະ ລູກຄ້າຍັງໃຊ້ຮ່ວມກັນ." },
    };
    const detailScope = section === "customer-display"
      ? tSettings("scopeThisDevice", locale)
      : section === "branch-information"
        ? tSettings("scopeBranch", locale)
        : tSettings("scopeCompany", locale);
    return (<div className="flex flex-col gap-6">
      <Link className="settings-motion-back inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary" href="/settings" prefetch={true} scroll={false}>
        <ArrowLeft className="size-4" aria-hidden="true" />
        {tSettings("backToSettings", locale)}
      </Link>
      <fieldset className="contents" disabled={!canEdit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">{detailTitle[section]}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{detailDescription[section][locale]}</p>
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">{detailScope}</span>
          </div>
        </div>
        {canSaveCompanySettings ? (
        <button className="settings-motion-save inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending || !isSectionDirty()} type="button" onClick={saveSettings}>
          <Save aria-hidden="true"/>
          {isPending ? tSettings("saving", locale) : tSettings("saveSettings", locale)}
        </button>
        ) : null}
      </div>
      {message ? (<div className={message.tone === "success" ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success" : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"}>{message.text}</div>) : null}
      {section === "company-profile" ? <CompanySettingsSection locale={locale} settings={settings} update={update} /> : null}
      {section === "business-logo" ? <LogoSettingsSection companyName={settings.companyName} initialBusinessLogoUrl={initialBusinessLogoUrl} locale={locale} onNotify={setMessage} /> : null}
      {section === "receipt" ? <ReceiptSettingsSection branchName={initialActiveBranch?.name ?? null} businessLogoUrl={initialBusinessLogoUrl} initialReceiptPreviewQrUrl={initialReceiptPreviewQrUrl} locale={locale} settings={settings} update={update} updatePrintMode={updatePrintMode} /> : null}
      {section === "qr-payments" ? (
        <section className="rounded-lg border border-border bg-card p-5">
          <QrPaymentBankManagementSection branches={qrBranches} initialAccounts={initialQrAccounts} initialBanks={initialQrBanks} locale={locale} onNotify={setMessage} />
        </section>
      ) : null}
      {section === "customer-display" ? <CustomerDisplaySettingsSection locale={locale} onNotify={setMessage} /> : null}
      {initialStaffSnapshot && ["staff", "roles", "approval-rules"].includes(section) ? (
        <StaffControlSection actorIsOwner={actorIsOwner} actorUserId={actorUserId} initialSnapshot={initialStaffSnapshot} locale={locale} section={section as "staff" | "roles" | "approval-rules"} onNotify={setMessage} />
      ) : null}
      {section === "day-off" ? (
        <DayOffSettingsPanel employees={(initialStaffSnapshot?.staff ?? []).map((member) => ({ branchName: member.branchName, fullName: member.fullName, status: member.status, userId: member.userId, username: member.username }))} locale={locale} />
      ) : null}
      {section === "ot" ? (
        <OtSettingsPanel employees={(initialStaffSnapshot?.staff ?? []).map((member) => ({ branchName: member.branchName, fullName: member.fullName, status: member.status, userId: member.userId, username: member.username }))} locale={locale} />
      ) : null}
      {section === "loyalty" ? <LoyaltySettingsSection categories={initialLoyaltyCatalog.categories} locale={locale} products={initialLoyaltyCatalog.products} rules={initialLoyaltyRules} settings={settings} update={update} /> : null}
      {section === "branch-information" && initialActiveBranch ? <BranchInformationPanel initialBranch={initialActiveBranch} locale={locale} /> : null}
      {section === "tax" ? <TaxSettingsSection locale={locale} settings={settings} update={update} /> : null}
      {section === "cash-shift" ? <CashShiftSettingsSection locale={locale} settings={settings} update={update} /> : null}
      {settingsConfirm ? (<AppSmallModal closeAriaLabel={tSettings("closeModal", locale)} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSettingsConfirm(null)}>{tSettings("cancel", locale)}</button>
            {settingsConfirm === "taxChange" || settingsConfirm === "cashShiftOff" || settingsConfirm === "loyaltyChange" ? (<button className="settings-motion-save h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={commitSettingsSave}>{tSettings("applyChanges", locale)}</button>) : null}
          </div>} onClose={() => setSettingsConfirm(null)} size="sm" title={settingsConfirm === "taxChange" ? tSettings("taxChangeConfirmTitle", locale) : settingsConfirm === "loyaltyChange" ? tSettings("loyaltyChangeConfirmTitle", locale) : tSettings("cashShiftDisableConfirmTitle", locale)}>
          {settingsConfirm === "taxChange" ? (
            <ul className="grid gap-2 text-sm text-muted-foreground">{taxConfirmLines.map((line) => <li key={line}>{line}</li>)}</ul>
          ) : settingsConfirm === "loyaltyChange" ? (
            <ul className="grid gap-2 text-sm text-muted-foreground">{loyaltyConfirmLines.map((line) => <li key={line}>{line}</li>)}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">{tSettings("cashShiftDisableConfirmBody", locale)}</p>
          )}
        </AppSmallModal>) : null}
      {section === "pos-terminals" ? <TerminalsPanel canEdit={canEdit} initialTerminals={initialTerminals} locale={locale} /> : null}
      </fieldset>
      {section === "help" && initialHelpContext ? <HelpSupportPanel canSubmit={canSubmitSupport} context={initialHelpContext} locale={locale} tickets={initialSupportTickets} /> : null}
    </div>);
}
