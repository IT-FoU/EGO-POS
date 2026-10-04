"use client";

import { localizeCustomerDisplayTemplateDescription, localizeSettingsError, receiptPrintModeLabel, tSettings } from "@/lib/i18n/settings-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Building2, Banknote, Gift, ImagePlus, MonitorPlay, Percent, ReceiptText, Save, Trash2 } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { removeCompanyLogoAction, saveCompanyLogoAction, updateSettingsAction } from "@/features/settings/actions";
import { LoyaltyRulesPanel, type LoyaltyCatalogItem } from "@/features/settings/components/loyalty-rules-panel";
import type { LoyaltyEarningRuleRecord } from "@/features/loyalty/earning-rules";
import { ACTIVE_COMPANY_NAME_CHANGE_EVENT } from "@/lib/auth/active-company-name";
import type { SettingsFormData } from "@/features/settings/types";
import type { BranchOption, QrPaymentAccountRecord, QrPaymentBankRecord } from "@/features/qr-payments/types";
import { DEFAULT_CUSTOMER_DISPLAY_SETTINGS, readCustomerDisplaySettingsFromStorage, resetAllCustomerDisplaySettings, resetCustomerDisplayAppearanceSettings, writeCustomerDisplaySettingsToStorage, type CustomerDisplayMedia, type CustomerDisplaySettings, type CustomerDisplayTemplate, } from "@/features/pos/customer-display-settings";
import { CUSTOMER_DISPLAY_TEMPLATE_OPTIONS } from "@/features/pos/customer-display-templates";
import { CUSTOMER_DISPLAY_QR_STYLE_OPTIONS, type CustomerDisplayQrStyle } from "@/features/pos/customer-display-qr-style";
import {
  cancelStagedImage,
  confirmStagedImage,
  emptyStagedImage,
  isStagedImageDirty,
  previewStagedImage,
  readImageFileAsDataUrl,
  removeStagedImage,
  selectStagedImage,
  type StagedImageState,
} from "@/features/brand/staged-image";
import type { StaffAccessSnapshot } from "@/features/access-control/types";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import { Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";
import { ReceiptSettingsPreview } from "@/features/settings/components/receipt-settings-preview";
import {
  RECEIPT_PAPER_SIZE_OPTIONS,
  asPaperSize,
  validateCustomPaperDimensions,
  type ReceiptPaperSize,
} from "@/features/settings/receipt-layout";
import {
  readReceiptPrintModePreference,
  writeReceiptPrintModePreference,
} from "@/features/settings/receipt-print-mode";
import { MAX_SOURCE_IMAGE_BYTES } from "@/lib/storage/image-validate";

const QrPaymentBankManagementSection = dynamic(() => import("@/features/settings/components/qr-payment-bank-management-section").then((module) => module.QrPaymentBankManagementSection));
const StaffControlSection = dynamic(() => import("@/features/settings/components/staff-control-section").then((module) => module.StaffControlSection));
const DayOffSettingsPanel = dynamic(() => import("@/features/day-off/components/day-off-settings-panel").then((module) => module.DayOffSettingsPanel));
const OtSettingsPanel = dynamic(() => import("@/features/ot/components/ot-settings-panel").then((module) => module.OtSettingsPanel));
const BranchInformationPanel = dynamic(() => import("@/features/settings/components/branch-information-panel").then((module) => module.BranchInformationPanel));
const HelpSupportPanel = dynamic(() => import("@/features/settings/components/help-support-panel").then((module) => module.HelpSupportPanel));
const TerminalsPanel = dynamic(() => import("@/features/terminals/components/terminals-panel").then((module) => module.TerminalsPanel));

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
    const [logoStage, setLogoStage] = useState<StagedImageState>(emptyStagedImage());
    const [settingsConfirm, setSettingsConfirm] = useState<"removeLogo" | "resetThisPage" | "resetAll" | "taxChange" | "cashShiftOff" | "loyaltyChange" | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const logoFileRef = useRef<File | null>(null);
    const [displaySettings, setDisplaySettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    const [promotionDraft, setPromotionDraft] = useState("");
    const [settings, setSettings] = useState(initialSettings);
    const [baseline, setBaseline] = useState(initialSettings);
    const [taxConfirmLines, setTaxConfirmLines] = useState<string[]>([]);
    const [loyaltyConfirmLines, setLoyaltyConfirmLines] = useState<string[]>([]);
    const [message, setMessage] = useState<{
        tone: "error" | "success";
        text: string;
    } | null>(null);
    useEffect(() => {
        const next = {
            ...initialSettings,
            receiptPrintMode: readReceiptPrintModePreference(initialSettings.receiptPrintMode),
            requireCashShiftBeforeSale: initialSettings.requireCashShiftBeforeSale !== false,
        };
        setSettings(next);
        setBaseline(next);
        setDisplaySettings(readCustomerDisplaySettingsFromStorage());
        setLogoStage(emptyStagedImage(initialBusinessLogoUrl));
    }, [initialBusinessLogoUrl, initialSettings]);
    function update<K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) {
        setSettings((current) => ({ ...current, [key]: value }));
    }
    async function chooseLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        try {
            if (file.size > MAX_SOURCE_IMAGE_BYTES) {
                setMessage({ text: tSettings("logoTooLarge", locale), tone: "error" });
                return;
            }
            logoFileRef.current = file;
            const dataUrl = await readImageFileAsDataUrl(file);
            setLogoStage((current) => selectStagedImage(current, dataUrl));
            setMessage({ text: tSettings("logoPreviewReady", locale), tone: "success" });
        } catch {
            setMessage({ text: tSettings("logoTypeError", locale), tone: "error" });
        }
    }
    function confirmLogo() {
        const file = logoFileRef.current;
        const next = confirmStagedImage(logoStage);
        if (!file || !next.saved) {
            return;
        }
        const formData = new FormData();
        formData.set("file", file);
        startTransition(async () => {
            const result = await saveCompanyLogoAction(formData);
            if (!result.ok || !result.data) {
                setMessage({ text: localizeSettingsError(result.error, locale), tone: "error" });
                return;
            }
            logoFileRef.current = null;
            const savedUrl = result.data.businessLogoUrl || next.saved;
            setLogoStage(emptyStagedImage(savedUrl));
            setMessage({ text: tSettings("saved", locale), tone: "success" });
        });
    }
    function cancelLogoDraft() {
        logoFileRef.current = null;
        setLogoStage((current) => cancelStagedImage(current));
    }
    function removeLogo() {
        setSettingsConfirm("removeLogo");
    }
    function applyRemoveLogo() {
        startTransition(async () => {
            const result = await removeCompanyLogoAction();
            if (!result.ok) {
                setMessage({ text: localizeSettingsError(result.error, locale), tone: "error" });
                setSettingsConfirm(null);
                return;
            }
            logoFileRef.current = null;
            setLogoStage(removeStagedImage());
            setMessage({ text: tSettings("remove", locale), tone: "success" });
            setSettingsConfirm(null);
        });
    }
    function persistCustomerDisplaySettings(nextSettings: CustomerDisplaySettings, notify = true) {
        setDisplaySettings(nextSettings);
        writeCustomerDisplaySettingsToStorage(nextSettings);
        if (notify) setMessage({ text: tSettings("savedOnThisDevice", locale), tone: "success" });
    }
    function updateDisplayTemplate(template: CustomerDisplayTemplate) {
        persistCustomerDisplaySettings({ ...displaySettings, template });
    }
    function updateDisplayQrStyle(qrDisplayStyle: CustomerDisplayQrStyle) {
        persistCustomerDisplaySettings({ ...displaySettings, qrDisplayStyle });
    }
    function resetAppearancePage() {
        setSettingsConfirm("resetThisPage");
    }
    function applyResetAppearancePage() {
        persistCustomerDisplaySettings(resetCustomerDisplayAppearanceSettings(displaySettings), false);
        setMessage({ text: tSettings("resetThisPageSuccess", locale), tone: "success" });
        setSettingsConfirm(null);
    }
    function resetAllDisplaySettings() {
        setSettingsConfirm("resetAll");
    }
    function applyResetAllDisplaySettings() {
        persistCustomerDisplaySettings(resetAllCustomerDisplaySettings(), false);
        setMessage({ text: tSettings("resetAllCustomerDisplaySuccess", locale), tone: "success" });
        setSettingsConfirm(null);
    }
    function updateDisplayAutoReturn(seconds: number) {
        persistCustomerDisplaySettings({ ...displaySettings, autoReturnSeconds: Math.max(1, seconds) });
    }
    function addPromotionMessage() {
        const messageText = promotionDraft.trim();
        if (!messageText) {
            setMessage({ text: tSettings("promotionMessageRequired", locale), tone: "error" });
            return;
        }
        persistCustomerDisplaySettings({
            ...displaySettings,
            promotionMessages: [...displaySettings.promotionMessages, messageText].slice(-8),
        });
        setPromotionDraft("");
    }
    function deletePromotionMessage(index: number) {
        persistCustomerDisplaySettings({
            ...displaySettings,
            promotionMessages: displaySettings.promotionMessages.filter((_, itemIndex) => itemIndex !== index),
        });
    }
    function updateDisplayMedia(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(file.type)) {
            setMessage({ text: tSettings("mediaTypeError", locale), tone: "error" });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                return;
            }
            const media: CustomerDisplayMedia = {
                id: `display-media-${Date.now()}`,
                name: file.name,
                type: file.type === "video/mp4" ? "video" : "image",
                url: reader.result,
            };
            persistCustomerDisplaySettings({
                ...displaySettings,
                media: [media, ...displaySettings.media].slice(0, 12),
            });
        };
        reader.readAsDataURL(file);
    }
    function deleteDisplayMedia(id: string) {
        persistCustomerDisplaySettings({
            ...displaySettings,
            media: displaySettings.media.filter((media) => media.id !== id),
        });
    }
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
                window.dispatchEvent(
                    new CustomEvent(ACTIVE_COMPANY_NAME_CHANGE_EVENT, {
                        detail: { name: saved.companyName },
                    }),
                );
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
            return (
                settings.companyName !== baseline.companyName ||
                (settings.profileAddress ?? "") !== (baseline.profileAddress ?? "") ||
                (settings.profileEmail ?? "") !== (baseline.profileEmail ?? "") ||
                (settings.profilePhone ?? "") !== (baseline.profilePhone ?? "") ||
                (settings.taxNumber ?? "") !== (baseline.taxNumber ?? "")
            );
        }
        if (section === "tax") {
            return (
                settings.vatEnabled !== baseline.vatEnabled ||
                settings.taxInclusive !== baseline.taxInclusive ||
                settings.showTaxOnReceipt !== baseline.showTaxOnReceipt ||
                Number(settings.vatRate) !== Number(baseline.vatRate)
            );
        }
        if (section === "cash-shift") {
            return (settings.requireCashShiftBeforeSale !== false) !== (baseline.requireCashShiftBeforeSale !== false);
        }
        if (section === "receipt") {
            return (
                settings.receiptPrefix !== baseline.receiptPrefix ||
                (settings.receiptHeader ?? "") !== (baseline.receiptHeader ?? "") ||
                (settings.receiptFooter ?? "") !== (baseline.receiptFooter ?? "") ||
                settings.showLogoOnReceipt !== baseline.showLogoOnReceipt ||
                settings.receiptPaperSize !== baseline.receiptPaperSize ||
                Number(settings.receiptCustomWidthMm) !== Number(baseline.receiptCustomWidthMm) ||
                Number(settings.receiptCustomHeightMm) !== Number(baseline.receiptCustomHeightMm) ||
                settings.receiptShowAddress !== baseline.receiptShowAddress ||
                settings.receiptShowBranchName !== baseline.receiptShowBranchName ||
                settings.receiptShowCashier !== baseline.receiptShowCashier ||
                settings.receiptShowCompanyName !== baseline.receiptShowCompanyName ||
                settings.receiptShowDateTime !== baseline.receiptShowDateTime ||
                settings.receiptShowEmail !== baseline.receiptShowEmail ||
                settings.receiptShowFooter !== baseline.receiptShowFooter ||
                settings.receiptShowHeader !== baseline.receiptShowHeader ||
                settings.receiptShowPhone !== baseline.receiptShowPhone ||
                settings.receiptShowQr !== baseline.receiptShowQr ||
                settings.receiptShowReceiptNumber !== baseline.receiptShowReceiptNumber ||
                settings.receiptShowTaxNumber !== baseline.receiptShowTaxNumber
            );
        }
        if (section === "loyalty") {
            return (
                settings.loyaltyEnabled !== baseline.loyaltyEnabled ||
                settings.loyaltyAllowPartial !== baseline.loyaltyAllowPartial ||
                settings.loyaltyAllowRedeemWithDiscount !== baseline.loyaltyAllowRedeemWithDiscount ||
                settings.loyaltyExpiryEnabled !== baseline.loyaltyExpiryEnabled ||
                settings.loyaltyExpiryUnit !== baseline.loyaltyExpiryUnit ||
                settings.loyaltyExpiryDays !== baseline.loyaltyExpiryDays ||
                settings.loyaltyMaxRedeemPoints !== baseline.loyaltyMaxRedeemPoints ||
                settings.loyaltyMinRedeemPoints !== baseline.loyaltyMinRedeemPoints ||
                settings.loyaltyPointValueLak !== baseline.loyaltyPointValueLak
            );
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
        : section === "help"
          ? tSettings("scopeCompany", locale)
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

      {message ? (<div className={message.tone === "success"
                ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
                : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"}>
          {message.text}
        </div>) : null}

      {section === "company-profile" || section === "business-logo" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Building2} title={section === "business-logo" ? tSettings("companyLogo", locale) : tSettings("companyProfile", locale)}/>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {section === "business-logo" ? (
          <div className="md:col-span-2">
            <div className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-start">
              <LogoContainer fallbackName={settings.companyName} logoUrl={previewStagedImage(logoStage)} size={96} variant="settings"/>
              <div className="grid min-w-0 flex-1 gap-2 text-sm font-medium">
                {tSettings("companyLogo", locale)}
                <input accept="image/png,image/jpeg,image/webp" className="hidden" ref={logoInputRef} type="file" onChange={(event) => void chooseLogoFile(event)}/>
                <span className="text-xs leading-5 text-muted-foreground">{tSettings("businessLogoUsageHelp", locale)}</span>
                <span className="text-xs leading-5 text-muted-foreground">{tSettings("logoSizeHelp", locale)}</span>
                <div className="flex flex-wrap gap-2">
                  {/* Source markers: ui.confirm.logo ui.remove.logo */}
                  {isStagedImageDirty(logoStage) ? (<>
                    <button className="settings-motion-save h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending} type="button" onClick={confirmLogo}>{isPending ? tSettings("uploadingLogo", locale) : tSettings("confirm", locale)}</button>
                    <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={() => logoInputRef.current?.click()}>{tSettings("change", locale)}</button>
                    <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={cancelLogoDraft}>{tSettings("cancel", locale)}</button>
                  </>) : (<>
                    <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={() => logoInputRef.current?.click()}>{logoStage.saved ? tSettings("change", locale) : tSettings("chooseLogo", locale)}</button>
                    {logoStage.saved ? <button className="h-10 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger disabled:opacity-60" disabled={isPending} type="button" onClick={removeLogo}>{tSettings("remove", locale)}</button> : null}
                  </>)}
                </div>
              </div>
            </div>
          </div>
          ) : null}
          {section === "company-profile" ? (<>
          <Field label={tSettings("companyName", locale)}>
            <input className="field-input" required value={settings.companyName} onChange={(event) => update("companyName", event.target.value)}/>
          </Field>
          <Field label={tSettings("taxNumber", locale)}>
            <input className="field-input" value={settings.taxNumber ?? ""} onChange={(event) => update("taxNumber", event.target.value)}/>
          </Field>
          <Field label={tSettings("phone", locale)}>
            <input className="field-input" value={settings.profilePhone ?? ""} onChange={(event) => update("profilePhone", event.target.value)}/>
          </Field>
          <Field label={tSettings("email", locale)}>
            <input className="field-input" type="email" value={settings.profileEmail ?? ""} onChange={(event) => update("profileEmail", event.target.value)}/>
          </Field>
          <div className="md:col-span-2">
            <Field label={tSettings("address", locale)}>
              <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={settings.profileAddress ?? ""} onChange={(event) => update("profileAddress", event.target.value)}/>
            </Field>
          </div>
          </>) : null}
        </div>
      </section>
      ) : null}

      {section === "receipt" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={ReceiptText} title={tSettings("receiptSettings", locale)}/>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{tSettings("scopeCompany", locale)}</span>
            <span className="text-sm text-muted-foreground">{tSettings("receiptContentShared", locale)}</span>
          </div>

          <fieldset className="md:col-span-2 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-semibold">{tSettings("receiptPaperSize", locale)}</legend>
            <p className="mb-3 text-xs text-muted-foreground">{tSettings("receiptPaperSizeHelp", locale)}</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tSettings("receiptPaperSize", locale)}>
              {RECEIPT_PAPER_SIZE_OPTIONS.map((size) => {
                const selected = asPaperSize(settings.receiptPaperSize) === size;
                const label =
                  size === "58mm" ? tSettings("receiptPaperSize58", locale)
                  : size === "80mm" ? tSettings("receiptPaperSize80", locale)
                  : size === "a5" ? tSettings("receiptPaperSizeA5", locale)
                  : size === "a4" ? tSettings("receiptPaperSizeA4", locale)
                  : tSettings("receiptPaperSizeCustom", locale);
                return (
                  <button
                    aria-checked={selected}
                    aria-pressed={selected}
                    className={selected
                      ? "settings-motion-tab h-11 min-w-[88px] rounded-md border border-primary bg-primary/10 px-3 text-sm font-semibold text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      : "settings-motion-tab h-11 min-w-[88px] rounded-md border border-border bg-background px-3 text-sm font-semibold hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"}
                    key={size}
                    role="radio"
                    type="button"
                    onClick={() => update("receiptPaperSize", size as ReceiptPaperSize)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {asPaperSize(settings.receiptPaperSize) === "custom" ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={`${tSettings("receiptCustomWidth", locale)} (${tSettings("receiptUnitMm", locale)})`}>
                  <input
                    aria-required="true"
                    className="field-input"
                    inputMode="decimal"
                    min={40}
                    step="0.1"
                    type="number"
                    value={settings.receiptCustomWidthMm}
                    onChange={(event) => update("receiptCustomWidthMm", Number(event.target.value))}
                  />
                </Field>
                <Field label={`${tSettings("receiptCustomHeight", locale)} (${tSettings("receiptUnitMm", locale)})`}>
                  <input
                    aria-required="true"
                    className="field-input"
                    inputMode="decimal"
                    min={60}
                    step="0.1"
                    type="number"
                    value={settings.receiptCustomHeightMm}
                    onChange={(event) => update("receiptCustomHeightMm", Number(event.target.value))}
                  />
                </Field>
                <p className="sm:col-span-2 text-xs text-muted-foreground">{tSettings("receiptCustomSizeHelp", locale)}</p>
              </div>
            ) : null}
          </fieldset>

          <Field label={tSettings("receiptPrefix", locale)}>
            <input className="field-input font-mono" required value={settings.receiptPrefix} onChange={(event) => update("receiptPrefix", event.target.value)}/>
          </Field>

          <div className="md:col-span-2">
            <div className="mb-2 text-sm font-semibold">{tSettings("receiptVisibility", locale)}</div>
            <p className="mb-3 text-xs text-muted-foreground">{tSettings("receiptVisibilityHelp", locale)}</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Toggle label={tSettings("showLogoOnReceipt", locale)} checked={settings.showLogoOnReceipt} onChange={(value) => update("showLogoOnReceipt", value)}/>
              <Toggle label={tSettings("showStoreNameOnReceipt", locale)} checked={settings.receiptShowCompanyName} onChange={(value) => update("receiptShowCompanyName", value)}/>
              <Toggle label={tSettings("showBranchNameOnReceipt", locale)} checked={settings.receiptShowBranchName} onChange={(value) => update("receiptShowBranchName", value)}/>
              <Toggle label={tSettings("showAddressOnReceipt", locale)} checked={settings.receiptShowAddress} onChange={(value) => update("receiptShowAddress", value)}/>
              <Toggle label={tSettings("showPhoneOnReceipt", locale)} checked={settings.receiptShowPhone} onChange={(value) => update("receiptShowPhone", value)}/>
              <Toggle label={tSettings("showEmailOnReceipt", locale)} checked={settings.receiptShowEmail} onChange={(value) => update("receiptShowEmail", value)}/>
              <Toggle label={tSettings("showTaxNumberOnReceipt", locale)} checked={settings.receiptShowTaxNumber} onChange={(value) => update("receiptShowTaxNumber", value)}/>
              <Toggle label={tSettings("showCashierOnReceipt", locale)} checked={settings.receiptShowCashier} onChange={(value) => update("receiptShowCashier", value)}/>
              <Toggle label={tSettings("showReceiptNumberOnReceipt", locale)} checked={settings.receiptShowReceiptNumber} onChange={(value) => update("receiptShowReceiptNumber", value)}/>
              <Toggle label={tSettings("showDateTimeOnReceipt", locale)} checked={settings.receiptShowDateTime} onChange={(value) => update("receiptShowDateTime", value)}/>
              <Toggle label={tSettings("showHeaderOnReceipt", locale)} checked={settings.receiptShowHeader} onChange={(value) => update("receiptShowHeader", value)}/>
              <Toggle label={tSettings("showFooterOnReceipt", locale)} checked={settings.receiptShowFooter} onChange={(value) => update("receiptShowFooter", value)}/>
              <Toggle describedBy="receipt-show-qr-help" label={tSettings("showQrOnReceipt", locale)} checked={settings.receiptShowQr} onChange={(value) => update("receiptShowQr", value)}/>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground" id="receipt-show-qr-help">{tSettings("showQrOnReceiptHelp", locale)}</p>
            {settings.receiptShowQr && !initialReceiptPreviewQrUrl ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">
                {tSettings("receiptQrNoneEligible", locale)}{" "}
                <Link className="font-semibold text-primary underline" href="/settings/qr-payments">{tSettings("goToQrPayments", locale)}</Link>
              </p>
            ) : null}
          </div>

          <div className="md:col-span-2">
            <Field label={tSettings("receiptHeader", locale)}>
              <input className="field-input" value={settings.receiptHeader ?? ""} onChange={(event) => update("receiptHeader", event.target.value)}/>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label={tSettings("receiptFooter", locale)}>
              <input className="field-input" value={settings.receiptFooter ?? ""} onChange={(event) => update("receiptFooter", event.target.value)}/>
            </Field>
          </div>
          <div className="md:col-span-2 mt-2 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{tSettings("scopeThisDevice", locale)}</span>
              <span className="text-sm text-muted-foreground">{tSettings("printBehaviorThisBrowser", locale)}</span>
            </div>
            <Field label={tSettings("receiptPrintMode", locale)}>
              <select className="field-input" value={settings.receiptPrintMode} onChange={(event) => updatePrintMode(event.target.value as SettingsFormData["receiptPrintMode"])}>
                <option value="ask_every_time">{receiptPrintModeLabel("ask_every_time", locale)}</option>
                <option value="auto_print">{receiptPrintModeLabel("auto_print", locale)}</option>
                <option value="no_auto_print">{receiptPrintModeLabel("no_auto_print", locale)}</option>
              </select>
            </Field>
          </div>
          <div className="md:col-span-2">
            <ReceiptSettingsPreview
              branchName={initialActiveBranch?.name ?? null}
              businessLogoUrl={previewStagedImage(logoStage) || initialBusinessLogoUrl}
              locale={locale}
              previewQrImageUrl={initialReceiptPreviewQrUrl}
              settings={settings}
            />
          </div>
        </div>
      </section>
      ) : null}

      {section === "qr-payments" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <QrPaymentBankManagementSection
          branches={qrBranches}
          initialAccounts={initialQrAccounts}
          initialBanks={initialQrBanks}
          locale={locale}
          onNotify={setMessage}
        />
      </section>
      ) : null}

      {section === "customer-display" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={MonitorPlay} title={tSettings("customerDisplay", locale)}/>
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{tSettings("scopeThisDevice", locale)}</span>
          <span className="text-sm text-muted-foreground">{tSettings("customerDisplayThisBrowser", locale)}</span>
        </div>
        <div className="mt-5 grid gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold">{tSettings("customerDisplay", locale)}</div>
            <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={resetAppearancePage}>
              {tSettings("resetThisPage", locale)}
            </button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">{tSettings("adsInsideCustomerDisplayHelp", locale)}</p>
          <div>
            <div className="text-sm font-semibold">{tSettings("displayTemplate", locale)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {CUSTOMER_DISPLAY_TEMPLATE_OPTIONS.map((template) => (<button aria-pressed={displaySettings.template === template.id} className={displaySettings.template === template.id
                ? "settings-motion-tab rounded-md border border-primary bg-primary/10 p-3 text-left text-sm shadow-sm"
                : "settings-motion-tab rounded-md border border-border bg-background p-3 text-left text-sm"} key={template.id} type="button" onClick={() => updateDisplayTemplate(template.id)}>
                  <div className="font-semibold">{template.name}</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{localizeCustomerDisplayTemplateDescription(template.id, template.description, locale)}</div>
                  <div className="mt-3 text-xs font-semibold text-primary">
                    {displaySettings.template === template.id ? tSettings("selected", locale) : tSettings("select", locale)}
                  </div>
                </button>))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">{tSettings("qr", locale)}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CUSTOMER_DISPLAY_QR_STYLE_OPTIONS.map((option) => (<button aria-pressed={displaySettings.qrDisplayStyle === option.id} className={displaySettings.qrDisplayStyle === option.id
                ? "settings-motion-tab rounded-md border border-primary bg-primary/10 px-3 py-3 text-left text-sm font-semibold shadow-sm"
                : "settings-motion-tab rounded-md border border-border bg-background px-3 py-3 text-left text-sm font-semibold"} key={option.id} type="button" onClick={() => updateDisplayQrStyle(option.id)}>
                  {option.name}
                </button>))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ImagePlus className="text-primary" aria-hidden="true"/>
                <h3 className="font-semibold">{tSettings("advertisementMedia", locale)}</h3>
              </div>
              <label className="mt-3 block">
                <input accept="image/jpeg,image/png,image/webp,video/mp4" className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={updateDisplayMedia}/>
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {displaySettings.media.length === 0 ? (<div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{tSettings("noAdvertisementMedia", locale)}</div>) : (displaySettings.media.map((media) => (<div className="overflow-hidden rounded-md border border-border bg-card" key={media.id}>
                      {media.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="aspect-video w-full object-cover" src={media.url} muted/>) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="aspect-video w-full object-cover" src={media.url} alt={media.name}/>)}
                      <div className="flex items-center justify-between gap-2 p-2">
                        <span className="truncate text-xs font-semibold">{media.name}</span>
                        <button className="settings-motion-icon grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deleteDisplayMedia(media.id)} aria-label={tSettings("delete", locale)}>
                          <Trash2 className="size-4" aria-hidden="true"/>
                        </button>
                      </div>
                    </div>)))}
              </div>
            </div>

            <div className="grid gap-4 rounded-md border border-border bg-background p-4">
              <Field label={tSettings("autoReturnAds", locale)}>
                <input className="field-input" min="1" type="number" value={displaySettings.autoReturnSeconds} onChange={(event) => updateDisplayAutoReturn(Number(event.target.value))}/>
              </Field>
              <Field label={tSettings("promotionMessage", locale)}>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input className="field-input" value={promotionDraft} onChange={(event) => setPromotionDraft(event.target.value)}/>
                  <button className="settings-motion-save h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={addPromotionMessage}>
                    {tSettings("add", locale)}
                  </button>
                </div>
              </Field>
              <div className="grid gap-2">
                {displaySettings.promotionMessages.map((promotion, index) => (<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm" key={`${promotion}-${index}`}>
                    <span className="min-w-0 truncate">{promotion}</span>
                    <button className="settings-motion-icon grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deletePromotionMessage(index)} aria-label={tSettings("delete", locale)}>
                      <Trash2 className="size-4" aria-hidden="true"/>
                    </button>
                  </div>))}
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs leading-5 text-primary">{tSettings("autoSwitchEnabled", locale)}</div>
            </div>
          </div>
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
            <div className="text-sm font-semibold">{tSettings("resetAllCustomerDisplay", locale)}</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{tSettings("resetAllCustomerDisplayHelp", locale)}</p>
            <button className="mt-3 h-10 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger" type="button" onClick={resetAllDisplaySettings}>
              {tSettings("resetAllCustomerDisplay", locale)}
            </button>
          </div>
        </div>
      </section>
      ) : null}

      {initialStaffSnapshot && ["staff", "roles", "approval-rules"].includes(section) ? (
      <StaffControlSection
        actorIsOwner={actorIsOwner}
        actorUserId={actorUserId}
        initialSnapshot={initialStaffSnapshot}
        locale={locale}
        section={section as "staff" | "roles" | "approval-rules"}
        onNotify={setMessage}
      />
      ) : null}

      {section === "day-off" ? (
        <DayOffSettingsPanel
          employees={(initialStaffSnapshot?.staff ?? []).map((member) => ({
            branchName: member.branchName,
            fullName: member.fullName,
            status: member.status,
            userId: member.userId,
            username: member.username,
          }))}
          locale={locale}
        />
      ) : null}

      {section === "ot" ? (
        <OtSettingsPanel
          employees={(initialStaffSnapshot?.staff ?? []).map((member) => ({
            branchName: member.branchName,
            fullName: member.fullName,
            status: member.status,
            userId: member.userId,
            username: member.username,
          }))}
          locale={locale}
        />
      ) : null}

      {section === "loyalty" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Gift} title={tSettings("loyaltyRules", locale)}/>
        <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm" data-loyalty-summary>
          {settings.loyaltyEnabled ? tSettings("loyaltyStatusOn", locale) : tSettings("loyaltyStatusOff", locale)}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{tSettings("loyaltyHelp", locale)}</p>
        <div className="mt-5">
          <Toggle label={tSettings("enableLoyalty", locale)} checked={settings.loyaltyEnabled} onChange={(value) => update("loyaltyEnabled", value)}/>
        </div>
        <LoyaltyRulesPanel categories={initialLoyaltyCatalog.categories} initialRules={initialLoyaltyRules} locale={locale} products={initialLoyaltyCatalog.products} />
        <div className="mt-6 rounded-lg border border-border bg-background p-4" data-loyalty-policy>
          <h3 className="text-sm font-semibold">{tSettings("redemptionRules", locale)}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label={tSettings("pointValueLak", locale)}>
              <input className="field-input" min="0" type="number" value={settings.loyaltyPointValueLak} onChange={(event) => update("loyaltyPointValueLak", Number(event.target.value))}/>
            </Field>
            <Field label={tSettings("minRedeemPoints", locale)}>
              <input className="field-input" min="1" type="number" value={settings.loyaltyMinRedeemPoints} onChange={(event) => update("loyaltyMinRedeemPoints", Number(event.target.value))}/>
            </Field>
            <Field label={tSettings("maximumRedeemPoints", locale)}>
              <input className="field-input" min="0" type="number" value={settings.loyaltyMaxRedeemPoints} onChange={(event) => update("loyaltyMaxRedeemPoints", Number(event.target.value))}/>
            </Field>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{tSettings("maximumRedeemHelp", locale)}</p>
          <div className="mt-4 grid gap-3">
            <Toggle label={tSettings("allowPartialRedemption", locale)} checked={settings.loyaltyAllowPartial} onChange={(value) => update("loyaltyAllowPartial", value)}/>
            <Toggle label={tSettings("allowRedeemWithDiscount", locale)} checked={settings.loyaltyAllowRedeemWithDiscount} onChange={(value) => update("loyaltyAllowRedeemWithDiscount", value)}/>
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold">{tSettings("pointPolicy", locale)}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-[auto_160px_160px] md:items-end">
            <Toggle label={tSettings("pointsExpire", locale)} checked={settings.loyaltyExpiryEnabled} onChange={(value) => update("loyaltyExpiryEnabled", value)}/>
            <Field label={tSettings("expiryAmount", locale)}>
              <input className="field-input" disabled={!settings.loyaltyExpiryEnabled} min="1" type="number" value={settings.loyaltyExpiryDays} onChange={(event) => update("loyaltyExpiryDays", Number(event.target.value))}/>
            </Field>
            <Field label={tSettings("expiryUnit", locale)}>
              <select className="field-input" disabled={!settings.loyaltyExpiryEnabled} value={settings.loyaltyExpiryUnit} onChange={(event) => update("loyaltyExpiryUnit", event.target.value === "months" ? "months" : "days")}>
                <option value="days">{tSettings("expiryDays", locale)}</option>
                <option value="months">{tSettings("expiryMonths", locale)}</option>
              </select>
            </Field>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{tSettings("loyaltyCalcHelp", locale)}</p>
        </div>
      </section>
      ) : null}

      {section === "branch-information" && initialActiveBranch ? (
        <BranchInformationPanel initialBranch={initialActiveBranch} locale={locale} />
      ) : null}


      {section === "tax" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Percent} title={tSettings("taxVatSettings", locale)}/>
        <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm" data-tax-summary>
          {settings.vatEnabled
            ? (locale === "lo"
              ? `ເປີດ • ${settings.vatRate}% • ${settings.taxInclusive ? "ລວມພາສີ" : "ແຍກພາສີ"}`
              : `On • ${settings.vatRate}% • ${settings.taxInclusive ? "Inclusive" : "Exclusive"}`)
            : (locale === "lo" ? "ປິດ" : "Off")}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Toggle label={tSettings("enableVat", locale)} checked={settings.vatEnabled} onChange={(value) => update("vatEnabled", value)}/>
          <Toggle label={tSettings("taxInclusive", locale)} checked={settings.taxInclusive} onChange={(value) => update("taxInclusive", value)}/>
          <Toggle label={tSettings("showTaxOnReceipt", locale)} checked={settings.showTaxOnReceipt} onChange={(value) => update("showTaxOnReceipt", value)}/>
          <Field label={tSettings("vatRate", locale)}>
            <input className="field-input" max="100" min="0" step="0.01" type="number" value={settings.vatRate} onChange={(event) => update("vatRate", Number(event.target.value))}/>
          </Field>
        </div>
        <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
          <p>{tSettings("taxHelpInclusive", locale)}</p>
          <p>{tSettings("taxHelpExclusive", locale)}</p>
        </div>
      </section>
      ) : null}

      {section === "cash-shift" ? (
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Banknote} title={tSettings("requireCashShiftBeforeSale", locale)}/>
        <div className="mt-4 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium" data-cash-shift-summary>
          {settings.requireCashShiftBeforeSale !== false
            ? (locale === "lo" ? "ບັງຄັບ" : "Required")
            : (locale === "lo" ? "ບໍ່ບັງຄັບ" : "Not required")}
        </div>
        <div className="mt-5 grid gap-4">
          <Toggle
            label={tSettings("requireCashShiftBeforeSale", locale)}
            checked={settings.requireCashShiftBeforeSale !== false}
            onChange={(value) => update("requireCashShiftBeforeSale", value)}
          />
          <p className="text-sm text-muted-foreground">{tSettings("cashShiftOnHelp", locale)}</p>
          <p className="text-sm text-muted-foreground">{tSettings("cashShiftOffHelp", locale)}</p>
          <p className="text-sm text-muted-foreground">{tSettings("requireCashShiftBeforeSaleHelp", locale)}</p>
        </div>
      </section>
      ) : null}

      {settingsConfirm ? (<AppSmallModal closeAriaLabel={tSettings("closeModal", locale)} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSettingsConfirm(null)}>{tSettings("cancel", locale)}</button>
            {settingsConfirm === "removeLogo" ? (<button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={applyRemoveLogo}>{tSettings("remove", locale)}</button>) : null}
            {settingsConfirm === "resetThisPage" ? (<button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={applyResetAppearancePage}>{tSettings("resetThisPage", locale)}</button>) : null}
            {settingsConfirm === "resetAll" ? (<button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={applyResetAllDisplaySettings}>{tSettings("resetAllCustomerDisplay", locale)}</button>) : null}
            {settingsConfirm === "taxChange" || settingsConfirm === "cashShiftOff" || settingsConfirm === "loyaltyChange" ? (<button className="settings-motion-save h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={commitSettingsSave}>{tSettings("applyChanges", locale)}</button>) : null}
          </div>} onClose={() => setSettingsConfirm(null)} size="sm" title={settingsConfirm === "removeLogo" ? tSettings("remove", locale) : settingsConfirm === "resetThisPage" ? tSettings("resetThisPage", locale) : settingsConfirm === "resetAll" ? tSettings("resetAllCustomerDisplay", locale) : settingsConfirm === "taxChange" ? tSettings("taxChangeConfirmTitle", locale) : settingsConfirm === "loyaltyChange" ? tSettings("loyaltyChangeConfirmTitle", locale) : tSettings("cashShiftDisableConfirmTitle", locale)}>
          {settingsConfirm === "taxChange" ? (
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {taxConfirmLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : settingsConfirm === "loyaltyChange" ? (
            <ul className="grid gap-2 text-sm text-muted-foreground">
              {loyaltyConfirmLines.map((line) => <li key={line}>{line}</li>)}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{settingsConfirm === "removeLogo" ? tSettings("removeLogoConfirm", locale) : settingsConfirm === "resetThisPage" ? tSettings("resetThisPageConfirm", locale) : settingsConfirm === "resetAll" ? tSettings("resetAllCustomerDisplayConfirm", locale) : tSettings("cashShiftDisableConfirmBody", locale)}</p>
          )}
          {settingsConfirm === "resetAll" ? (<p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{tSettings("resetAllCustomerDisplayHelp", locale)}</p>) : null}
        </AppSmallModal>) : null}
      {section === "pos-terminals" ? <TerminalsPanel canEdit={canEdit} initialTerminals={initialTerminals} locale={locale} /> : null}
      </fieldset>
      {section === "help" && initialHelpContext ? (
        <HelpSupportPanel canSubmit={canSubmitSupport} context={initialHelpContext} locale={locale} tickets={initialSupportTickets} />
      ) : null}
    </div>);
}
