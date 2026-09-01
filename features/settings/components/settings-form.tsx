"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, ClipboardCheck, Edit3, Eye, Gift, ImagePlus, KeyRound, MonitorPlay, Percent, Plus, QrCode, ReceiptText, Save, ScrollText, ShieldCheck, Trash2, Users, WalletCards, X, type LucideIcon } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { updateSettingsAction } from "@/features/settings/actions";
import type { CurrencyCode, SettingsFormData } from "@/features/settings/types";
import {
  archiveQrPaymentBankAction,
  deleteQrPaymentAccountAction,
  deleteQrPaymentBankAction,
  saveQrPaymentAccountAction,
  saveQrPaymentBankAction,
  setDefaultQrPaymentAccountAction,
} from "@/features/qr-payments/actions";
import type { BranchOption, QrPaymentAccountRecord, QrPaymentBankRecord } from "@/features/qr-payments/types";
import { CUSTOMER_DISPLAY_TEMPLATES, DEFAULT_CUSTOMER_DISPLAY_SETTINGS, readCustomerDisplaySettingsFromStorage, writeCustomerDisplaySettingsToStorage, type CustomerDisplayMedia, type CustomerDisplaySettings, type CustomerDisplayTemplate, } from "@/features/pos/customer-display-settings";
import { CUSTOMER_DISPLAY_THEME_OPTIONS, type CustomerDisplayThemeId } from "@/features/pos/customer-display-theme";
import type { StaffAccessSnapshot } from "@/features/access-control/types";
import { StaffControlSection } from "@/features/settings/components/staff-control-section";
import { StoreActivityLogsClient } from "@/features/store-activity/components/store-activity-logs-client";
import {
  readReceiptPrintModePreference,
  writeReceiptPrintModePreference,
} from "@/features/settings/receipt-print-mode";
export function SettingsForm({ initialQrAccounts, initialQrBanks, initialSettings, initialStaffSnapshot, qrBranches, }: {
    initialQrAccounts: QrPaymentAccountRecord[];
    initialQrBanks: QrPaymentBankRecord[];
    initialSettings: SettingsFormData;
    initialStaffSnapshot: StaffAccessSnapshot;
    qrBranches: BranchOption[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [displaySettings, setDisplaySettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    const [promotionDraft, setPromotionDraft] = useState("");
    const [settings, setSettings] = useState(initialSettings);
    const [message, setMessage] = useState<{
        tone: "error" | "success";
        text: string;
    } | null>(null);
    useEffect(() => {
        setSettings((current) => ({
            ...current,
            receiptPrintMode: readReceiptPrintModePreference(current.receiptPrintMode),
        }));
        setDisplaySettings(readCustomerDisplaySettingsFromStorage());
    }, []);
    function update<K extends keyof SettingsFormData>(key: K, value: SettingsFormData[K]) {
        setSettings((current) => ({ ...current, [key]: value }));
    }
    function updateLogo(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !["image/png", t("ui.image.svg.xml"), "image/webp"].includes(file.type)) {
            setMessage({ text: t("ui.company.logo.must.be.png.svg.or.webp"), tone: "error" });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result !== "string") {
                return;
            }
            setLogoUrl(reader.result);
            setMessage({ text: "Company logo preview updated.", tone: "success" });
        };
        reader.readAsDataURL(file);
    }
    function persistCustomerDisplaySettings(nextSettings: CustomerDisplaySettings) {
        setDisplaySettings(nextSettings);
        writeCustomerDisplaySettingsToStorage(nextSettings);
    }
    function updateDisplayTemplate(template: CustomerDisplayTemplate) {
        persistCustomerDisplaySettings({ ...displaySettings, template });
        setMessage({ text: t("ui.customer.display.template.updated"), tone: "success" });
    }
    function updateDisplayTheme(theme: CustomerDisplayThemeId) {
        persistCustomerDisplaySettings({ ...displaySettings, theme });
        setMessage({ text: t("ui.customer.display.theme.updated"), tone: "success" });
    }
    function updateDisplayAutoReturn(seconds: number) {
        persistCustomerDisplaySettings({ ...displaySettings, autoReturnSeconds: Math.max(1, seconds) });
    }
    function addPromotionMessage() {
        const messageText = promotionDraft.trim();
        if (!messageText) {
            setMessage({ text: t("ui.promotion.message.is.required"), tone: "error" });
            return;
        }
        persistCustomerDisplaySettings({
            ...displaySettings,
            promotionMessages: [...displaySettings.promotionMessages, messageText].slice(-8),
        });
        setPromotionDraft("");
        setMessage({ text: t("ui.promotion.message.saved.for.customer.display"), tone: "success" });
    }
    function deletePromotionMessage(index: number) {
        persistCustomerDisplaySettings({
            ...displaySettings,
            promotionMessages: displaySettings.promotionMessages.filter((_, itemIndex) => itemIndex !== index),
        });
    }
    function updateDisplayMedia(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file || !["image/jpeg", "image/png", "image/webp", t("ui.video.mp4")].includes(file.type)) {
            setMessage({ text: t("ui.customer.display.media.must.be.jpg.png.webp."), tone: "error" });
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
                type: file.type === t("ui.video.mp4") ? "video" : "image",
                url: reader.result,
            };
            persistCustomerDisplaySettings({
                ...displaySettings,
                media: [media, ...displaySettings.media].slice(0, 12),
            });
            setMessage({ text: t("ui.customer.display.media.saved"), tone: "success" });
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
        if (!settings.companyName.trim())
            return t("ui.company.name.is.required");
        if (settings.vatRate < 0 || settings.vatRate > 100)
            return t("ui.vat.rate.must.be.between.0.and.100");
        if (settings.decimalPlaces < 0 || settings.decimalPlaces > 4)
            return t("ui.decimal.places.must.be.between.0.and.4");
        if (settings.loyaltySpendPerPointLak <= 0)
            return t("ui.loyalty.spend.per.point.must.be.greater.than");
        if (settings.loyaltyPointValueLak < 0)
            return t("ui.loyalty.point.value.cannot.be.negative");
        if (settings.loyaltyMinRedeemPoints < 1)
            return t("ui.minimum.redeem.points.must.be.at.least.1");
        return null;
    }
    function saveSettings() {
        const validationError = validate();
        if (validationError) {
            setMessage({ text: validationError, tone: "error" });
            return;
        }
        setMessage(null);
        startTransition(async () => {
            const result = await updateSettingsAction(settings);
            if (!result.ok || !result.data) {
                setMessage({ text: result.error ?? t("ui.settings.save.failed"), tone: "error" });
                return;
            }
            const printMode = settings.receiptPrintMode;
            writeReceiptPrintModePreference(printMode);
            setSettings({ ...(result.data as SettingsFormData), receiptPrintMode: printMode });
            setMessage({ text: t("ui.settings.saved.successfully"), tone: "success" });
            router.refresh();
        });
    }
    return (<div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Settings</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.company.profile.receipt.tax.currency.and.loy")}</p>
        </div>
        <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60" disabled={isPending} type="button" onClick={saveSettings}>
          <Save aria-hidden="true"/>
          {isPending ? t("ui.saving") : "Save settings"}
        </button>
      </div>

      {message ? (<div className={message.tone === "success"
                ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
                : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"}>
          {message.text}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Building2} title="Company Profile"/>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-center">
              <LogoContainer logoUrl={logoUrl} size={96}/>
              <label className="grid flex-1 gap-2 text-sm font-medium">
                Company Logo
                <input accept={t("ui.image.png.image.svg.xml.image.webp")} className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={updateLogo}/>
                <span className="text-xs leading-5 text-muted-foreground">{t("ui.supports.png.svg.and.webp.for.sidebar.receip")}</span>
              </label>
            </div>
          </div>
          <Field label="Company name">
            <input className="field-input" required value={settings.companyName} onChange={(event) => update("companyName", event.target.value)}/>
          </Field>
          <Field label="Tax number">
            <input className="field-input" value={settings.taxNumber ?? ""} onChange={(event) => update("taxNumber", event.target.value)}/>
          </Field>
          <Field label="Phone">
            <input className="field-input" value={settings.profilePhone ?? ""} onChange={(event) => update("profilePhone", event.target.value)}/>
          </Field>
          <Field label="Email">
            <input className="field-input" type="email" value={settings.profileEmail ?? ""} onChange={(event) => update("profileEmail", event.target.value)}/>
          </Field>
          <div className="md:col-span-2">
            <Field label="Address">
              <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={settings.profileAddress ?? ""} onChange={(event) => update("profileAddress", event.target.value)}/>
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={ReceiptText} title="Receipt Settings"/>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Receipt prefix">
            <input className="field-input font-mono" required value={settings.receiptPrefix} onChange={(event) => update("receiptPrefix", event.target.value)}/>
          </Field>
          <Field label="Receipt Print Mode">
            <select className="field-input" value={settings.receiptPrintMode} onChange={(event) => update("receiptPrintMode", event.target.value as SettingsFormData["receiptPrintMode"])}>
              <option value="ask_every_time">Ask Every Time</option>
              <option value="auto_print">Auto Print</option>
              <option value="no_auto_print">No Auto Print</option>
            </select>
          </Field>
          <Toggle label="Show logo on receipt" checked={settings.showLogoOnReceipt} onChange={(value) => update("showLogoOnReceipt", value)}/>
          <div className="md:col-span-2">
            <Field label="Receipt header">
              <input className="field-input" value={settings.receiptHeader ?? ""} onChange={(event) => update("receiptHeader", event.target.value)}/>
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Receipt footer">
              <input className="field-input" value={settings.receiptFooter ?? ""} onChange={(event) => update("receiptFooter", event.target.value)}/>
            </Field>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <QrPaymentBankManagementSection
          branches={qrBranches}
          initialAccounts={initialQrAccounts}
          initialBanks={initialQrBanks}
          onNotify={setMessage}
        />
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={MonitorPlay} title="Customer Display"/>
        <div className="mt-5 grid gap-5">
          <div>
            <div className="text-sm font-semibold">{t("ui.customer.display.theme")}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {CUSTOMER_DISPLAY_THEME_OPTIONS.map((option) => (<button className={displaySettings.theme === option.id
                ? "rounded-md border border-primary bg-primary/10 px-3 py-3 text-left text-sm font-semibold shadow-sm"
                : "rounded-md border border-border bg-background px-3 py-3 text-left text-sm font-semibold transition hover:border-primary"} key={option.id} type="button" onClick={() => updateDisplayTheme(option.id)}>
                  {t(option.labelKey)}
                </button>))}
            </div>
          </div>
          <div>
            <div className="text-sm font-semibold">Display Template</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {CUSTOMER_DISPLAY_TEMPLATES.map((template) => (<button className={displaySettings.template === template.id
                ? "rounded-md border border-primary bg-primary/10 p-3 text-left text-sm shadow-sm"
                : "rounded-md border border-border bg-background p-3 text-left text-sm transition hover:border-primary"} key={template.id} type="button" onClick={() => updateDisplayTemplate(template.id)}>
                  <div className="font-semibold">{template.name}</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{template.description}</div>
                  <div className="mt-3 text-xs font-semibold text-primary">
                    {displaySettings.template === template.id ? "Selected" : "Select"}
                  </div>
                </button>))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ImagePlus className="text-primary" aria-hidden="true"/>
                <h3 className="font-semibold">Advertisement Images and Videos</h3>
              </div>
              <label className="mt-3 block">
                <input accept={t("ui.image.jpeg.image.png.image.webp.video.mp4")} className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={updateDisplayMedia}/>
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {displaySettings.media.length === 0 ? (<div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{t("ui.no.advertisement.media.uploaded.yet.the.disp")}</div>) : (displaySettings.media.map((media) => (<div className="overflow-hidden rounded-md border border-border bg-card" key={media.id}>
                      {media.type === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video className="aspect-video w-full object-cover" src={media.url} muted/>) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="aspect-video w-full object-cover" src={media.url} alt={media.name}/>)}
                      <div className="flex items-center justify-between gap-2 p-2">
                        <span className="truncate text-xs font-semibold">{media.name}</span>
                        <button className="grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deleteDisplayMedia(media.id)} aria-label={`Delete ${media.name}`}>
                          <Trash2 className="size-4" aria-hidden="true"/>
                        </button>
                      </div>
                    </div>)))}
              </div>
            </div>

            <div className="grid gap-4 rounded-md border border-border bg-background p-4">
              <Field label="Auto return to advertising after thank-you screen">
                <input className="field-input" min="1" type="number" value={displaySettings.autoReturnSeconds} onChange={(event) => updateDisplayAutoReturn(Number(event.target.value))}/>
              </Field>
              <Field label="Promotion message">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input className="field-input" value={promotionDraft} onChange={(event) => setPromotionDraft(event.target.value)}/>
                  <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={addPromotionMessage}>
                    Add
                  </button>
                </div>
              </Field>
              <div className="grid gap-2">
                {displaySettings.promotionMessages.map((promotion, index) => (<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm" key={`${promotion}-${index}`}>
                    <span className="min-w-0 truncate">{promotion}</span>
                    <button className="grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deletePromotionMessage(index)} aria-label={`Delete promotion message ${promotion}`}>
                      <Trash2 className="size-4" aria-hidden="true"/>
                    </button>
                  </div>))}
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs leading-5 text-primary">{t("ui.auto.switch.is.enabled.advertising.mode.chan")}</div>
            </div>
          </div>
        </div>
      </section>

      <StaffControlSection
        currencySettings={<section className="rounded-lg border border-border bg-background p-4">
            <SectionTitle icon={WalletCards} title="Currency Settings"/>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Base currency">
                <select className="field-input" value={settings.baseCurrency} onChange={(event) => update("baseCurrency", event.target.value as CurrencyCode)}>
                  <option value="LAK">LAK</option>
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Currency display">
                <input className="field-input" value={settings.currencyDisplay} onChange={(event) => update("currencyDisplay", event.target.value)}/>
              </Field>
              <Field label="Decimal places">
                <input className="field-input" max="4" min="0" type="number" value={settings.decimalPlaces} onChange={(event) => update("decimalPlaces", Number(event.target.value))}/>
              </Field>
              <Field label="Rounding method">
                <select className="field-input" value={settings.roundingMethod} onChange={(event) => update("roundingMethod", event.target.value)}>
                  <option value="nearest">Nearest</option>
                  <option value="down">Down</option>
                  <option value="up">Up</option>
                </select>
              </Field>
            </div>
          </section>}
        initialSnapshot={initialStaffSnapshot}
        loyaltyRules={<section className="rounded-lg border border-border bg-background p-4">
            <SectionTitle icon={Gift} title="Loyalty Rules"/>
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Toggle label="Enable loyalty points" checked={settings.loyaltyEnabled} onChange={(value) => update("loyaltyEnabled", value)}/>
              <Field label="Spend LAK per point">
                <input className="field-input" min="1" type="number" value={settings.loyaltySpendPerPointLak} onChange={(event) => update("loyaltySpendPerPointLak", Number(event.target.value))}/>
              </Field>
              <Field label="Point value LAK">
                <input className="field-input" min="0" type="number" value={settings.loyaltyPointValueLak} onChange={(event) => update("loyaltyPointValueLak", Number(event.target.value))}/>
              </Field>
              <Field label="Minimum redeem points">
                <input className="field-input" min="1" type="number" value={settings.loyaltyMinRedeemPoints} onChange={(event) => update("loyaltyMinRedeemPoints", Number(event.target.value))}/>
              </Field>
            </div>
          </section>}
        onNotify={setMessage}
      />

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={Percent} title="Tax / VAT Settings"/>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Toggle label="Enable VAT" checked={settings.vatEnabled} onChange={(value) => update("vatEnabled", value)}/>
          <Toggle label="Tax inclusive pricing" checked={settings.taxInclusive} onChange={(value) => update("taxInclusive", value)}/>
          <Toggle label="Show tax on receipt" checked={settings.showTaxOnReceipt} onChange={(value) => update("showTaxOnReceipt", value)}/>
          <Field label={t("ui.vat.rate")}>
            <input className="field-input" max="100" min="0" step="0.01" type="number" value={settings.vatRate} onChange={(event) => update("vatRate", Number(event.target.value))}/>
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={ScrollText} title="Store Activity Logs"/>
        <div className="mt-5"><StoreActivityLogsClient /></div>
      </section>

    </div>);
}
type BankDraft = {
    bankName: string;
    id: string;
    isActive: boolean;
    logoUrl?: string;
    shortCode: string;
    sortOrder: number;
};
type AccountDraft = {
    accountName: string;
    accountNumber: string;
    bankId: string;
    branchId: string;
    displayLabel: string;
    id: string;
    isActive: boolean;
    isDefault: boolean;
    printOnReceipt: boolean;
    qrImageUrl?: string;
    showOnCustomerDisplay: boolean;
};
const emptyBankDraft: BankDraft = {
    bankName: "",
    id: "",
    isActive: true,
    shortCode: "",
    sortOrder: 1,
};
function buildEmptyAccountDraft(branches: BranchOption[]): AccountDraft {
    return {
        accountName: "",
        accountNumber: "",
        bankId: "",
        branchId: branches[0]?.id ?? "",
        displayLabel: "",
        id: "",
        isActive: false,
        isDefault: false,
        printOnReceipt: true,
        showOnCustomerDisplay: true,
    };
}
function QrPaymentBankManagementSection({ branches, initialAccounts, initialBanks, onNotify, }: {
    branches: BranchOption[];
    initialAccounts: QrPaymentAccountRecord[];
    initialBanks: QrPaymentBankRecord[];
    onNotify: (message: {
        tone: "error" | "success";
        text: string;
    } | null) => void;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [banks, setBanks] = useState<QrPaymentBankRecord[]>(initialBanks);
    const [qrAccounts, setQrAccounts] = useState<QrPaymentAccountRecord[]>(initialAccounts);
    const [bankDraft, setBankDraft] = useState<BankDraft>(emptyBankDraft);
    const [accountDraft, setAccountDraft] = useState<AccountDraft>(() => buildEmptyAccountDraft(branches));
    const [bankModalOpen, setBankModalOpen] = useState(false);
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    const [editingBankId, setEditingBankId] = useState<string | null>(null);
    const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
    const [bankToDelete, setBankToDelete] = useState<QrPaymentBankRecord | null>(null);
    const [accountToDelete, setAccountToDelete] = useState<QrPaymentAccountRecord | null>(null);
    const [previewAccount, setPreviewAccount] = useState<QrPaymentAccountRecord | null>(null);
    useEffect(() => {
        setBanks(initialBanks);
        setQrAccounts(initialAccounts);
    }, [initialAccounts, initialBanks]);
    const sortedBanks = [...banks].sort((first, second) => first.sortOrder - second.sortOrder || first.bankName.localeCompare(second.bankName));
    const activeBanks = sortedBanks.filter((bank) => bank.isActive);
    const branchName = (branchId: string) => branches.find((branch) => branch.id === branchId)?.name ?? "Unknown branch";
    const sortedAccounts = [...qrAccounts].sort((first, second) => branchName(first.branchId).localeCompare(branchName(second.branchId)) || Number(second.isDefault) - Number(first.isDefault));
    function runMutation(action: () => Promise<{ error?: string; ok: boolean }>, successMessage: string) {
        onNotify(null);
        startTransition(async () => {
            const result = await action();
            if (!result.ok) {
                onNotify({ text: result.error ?? t("ui.settings.save.failed"), tone: "error" });
                return;
            }
            onNotify({ text: successMessage, tone: "success" });
            router.refresh();
        });
    }
    function readImage(event: React.ChangeEvent<HTMLInputElement>, onLoaded: (url: string) => void) {
        const file = event.target.files?.[0];
        if (!file || !["image/png", "image/jpeg", "image/webp", t("ui.image.svg.xml")].includes(file.type)) {
            onNotify({ text: t("ui.image.must.be.jpg.png.svg.or.webp"), tone: "error" });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === "string") {
                onLoaded(reader.result);
            }
        };
        reader.readAsDataURL(file);
    }
    function openAddBank() {
        setEditingBankId(null);
        setBankDraft({ ...emptyBankDraft, sortOrder: banks.length + 1 });
        setBankModalOpen(true);
    }
    function openEditBank(bank: QrPaymentBankRecord) {
        setEditingBankId(bank.id);
        setBankDraft({
            bankName: bank.bankName,
            id: bank.id,
            isActive: bank.isActive,
            logoUrl: bank.logoUrl,
            shortCode: bank.shortCode,
            sortOrder: bank.sortOrder,
        });
        setBankModalOpen(true);
    }
    function saveBank() {
        const bankNameValue = bankDraft.bankName.trim();
        if (!bankNameValue) {
            onNotify({ text: t("ui.bank.name.is.required"), tone: "error" });
            return;
        }
        runMutation(() => saveQrPaymentBankAction({
            bankName: bankNameValue,
            id: editingBankId ?? undefined,
            isActive: bankDraft.isActive,
            logoUrl: bankDraft.logoUrl,
            shortCode: bankDraft.shortCode.trim() || bankNameValue.slice(0, 6).toUpperCase(),
            sortOrder: bankDraft.sortOrder,
        }), editingBankId ? `Bank ${bankNameValue} updated.` : `Bank ${bankNameValue} added.`);
        setBankModalOpen(false);
    }
    function confirmDeleteBank() {
        if (!bankToDelete) {
            return;
        }
        runMutation(() => deleteQrPaymentBankAction(bankToDelete.id), `Bank ${bankToDelete.bankName} deleted.`);
        setBankToDelete(null);
    }
    function disableBank(bank: QrPaymentBankRecord) {
        runMutation(() => archiveQrPaymentBankAction(bank.id), `Bank ${bank.bankName} archived.`);
        setBankToDelete(null);
    }
    function openAddAccount() {
        setEditingAccountId(null);
        setAccountDraft({ ...buildEmptyAccountDraft(branches), bankId: activeBanks[0]?.id ?? "" });
        setAccountModalOpen(true);
    }
    function openEditAccount(account: QrPaymentAccountRecord) {
        setEditingAccountId(account.id);
        setAccountDraft({
            accountName: account.accountName,
            accountNumber: account.accountNumber,
            bankId: account.bankId,
            branchId: account.branchId,
            displayLabel: account.displayLabel,
            id: account.id,
            isActive: account.isActive,
            isDefault: account.isDefault,
            printOnReceipt: account.printOnReceipt,
            qrImageUrl: account.qrImageUrl,
            showOnCustomerDisplay: account.showOnCustomerDisplay,
        });
        setAccountModalOpen(true);
    }
    function saveQrAccount() {
        const accountName = accountDraft.accountName.trim();
        const accountNumber = accountDraft.accountNumber.trim();
        if (!accountDraft.bankId) {
            onNotify({ text: t("ui.qr.account.must.select.a.bank"), tone: "error" });
            return;
        }
        if (!accountDraft.branchId) {
            onNotify({ text: "Branch is required.", tone: "error" });
            return;
        }
        if (!accountName) {
            onNotify({ text: t("ui.account.name.is.required"), tone: "error" });
            return;
        }
        if (!accountNumber) {
            onNotify({ text: t("ui.account.number.is.required"), tone: "error" });
            return;
        }
        if (accountDraft.isActive && !accountDraft.qrImageUrl) {
            onNotify({ text: t("ui.qr.image.is.required.before.activating.qr.ac"), tone: "error" });
            return;
        }
        runMutation(() => saveQrPaymentAccountAction({
            accountName,
            accountNumber,
            bankId: accountDraft.bankId,
            branchId: accountDraft.branchId,
            displayLabel: accountDraft.displayLabel.trim() || accountName,
            id: editingAccountId ?? undefined,
            isActive: accountDraft.isActive,
            isDefault: accountDraft.isDefault,
            printOnReceipt: accountDraft.printOnReceipt,
            qrImageUrl: accountDraft.qrImageUrl,
            showOnCustomerDisplay: accountDraft.showOnCustomerDisplay,
        }), editingAccountId ? `QR account ${accountDraft.displayLabel || accountName} updated.` : `QR account ${accountDraft.displayLabel || accountName} added.`);
        setAccountModalOpen(false);
    }
    function confirmDeleteAccount() {
        if (!accountToDelete) {
            return;
        }
        runMutation(() => deleteQrPaymentAccountAction(accountToDelete.id), `QR account ${accountToDelete.displayLabel} deleted.`);
        setAccountToDelete(null);
    }
    function setDefaultQrAccount(account: QrPaymentAccountRecord) {
        runMutation(() => setDefaultQrPaymentAccountAction(account.id), `Default QR account set for ${branchName(account.branchId)}.`);
    }
    function bankName(bankId: string) {
        return banks.find((bank) => bank.id === bankId)?.bankName ?? "Unknown bank";
    }
    return (<div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SectionTitle icon={QrCode} title="QR Payment Banks"/>
        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={openAddBank}>
            <Plus className="size-4" aria-hidden="true"/>
            Add Bank
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={openAddAccount}>
            <Plus className="size-4" aria-hidden="true"/>
            Add QR Account
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Bank Management</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("ui.banks.are.editable.examples.qr.accounts.are.")}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{banks.length} banks</span>
          </div>

          {banks.length === 0 ? (<div className="mt-4 grid min-h-32 place-items-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">{t("ui.no.qr.payment.banks.configured.yet.add.your.")}</div>) : (<div className="mt-4 grid gap-3">
              {sortedBanks.map((bank) => (<div className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]" key={bank.id}>
                  <div className="grid size-12 place-items-center overflow-hidden rounded-md border border-border bg-background text-xs font-bold text-primary">
                    {bank.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-contain" src={bank.logoUrl} alt={`${bank.bankName} logo`}/>) : (bank.shortCode || "BANK")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold">{bank.bankName}</h4>
                      <span className={bank.isActive ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"}>
                        {bank.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{t("ui.code")}{bank.shortCode || "-"}{t("ui.sort")}{bank.sortOrder}</div>
                    <div className="mt-1 text-xs text-muted-foreground">QR accounts: {qrAccounts.filter((account) => account.bankId === bank.id).length}</div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary" type="button" onClick={() => openEditBank(bank)} aria-label={`Edit ${bank.bankName}`}>
                      <Edit3 className="size-4" aria-hidden="true"/>
                    </button>
                    <button className="grid size-9 place-items-center rounded-md border border-danger/40 text-danger transition hover:bg-danger/10" type="button" onClick={() => setBankToDelete(bank)} aria-label={`Delete ${bank.bankName}`}>
                      <Trash2 className="size-4" aria-hidden="true"/>
                    </button>
                  </div>
                </div>))}
            </div>)}
        </section>

        <section className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">QR Account Management</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("ui.only.one.active.default.qr.account.is.allowe")}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{qrAccounts.length} accounts</span>
          </div>

          {qrAccounts.length === 0 ? (<div className="mt-4 grid min-h-32 place-items-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">{t("ui.no.qr.accounts.configured.yet.add.an.account")}</div>) : (<div className="mt-4 grid gap-3">
              {sortedAccounts.map((account) => (<div className="rounded-md border border-border bg-card p-3" key={account.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate font-semibold">{account.displayLabel}</h4>
                        {account.isDefault ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Default</span> : null}
                        <span className={account.isActive ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"}>
                          {account.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>{t("ui.bank")}{bankName(account.bankId)}</span>
                        <span>{t("ui.branch")}{branchName(account.branchId)}</span>
                        <span>{t("ui.account")}{account.accountName}</span>
                        <span>No: {account.accountNumber}</span>
                        <span>Receipt QR: {account.printOnReceipt ? "Yes" : "No"}</span>
                        <span>Customer Display: {account.showOnCustomerDisplay ? "Yes" : "No"}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setPreviewAccount(account)}>Test QR / Preview QR</button>
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setDefaultQrAccount(account)}>Set Default</button>
                      <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary" type="button" onClick={() => openEditAccount(account)} aria-label={`Edit ${account.displayLabel}`}>
                        <Edit3 className="size-4" aria-hidden="true"/>
                      </button>
                      <button className="grid size-9 place-items-center rounded-md border border-danger/40 text-danger transition hover:bg-danger/10" type="button" onClick={() => setAccountToDelete(account)} aria-label={`Delete ${account.displayLabel}`}>
                        <Trash2 className="size-4" aria-hidden="true"/>
                      </button>
                    </div>
                  </div>
                </div>))}
            </div>)}
        </section>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {[
            ["POS payment screen", t("ui.transfer.qr.can.load.the.branch.default.acco")],
            ["Receipts", t("ui.print.qr.on.receipt.uses.each.account.toggle")],
            ["Customer Display", t("ui.show.qr.on.customer.display.uses.each.accoun")],
        ].map(([title, detail]) => (<div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm" key={title}>
            <div className="font-semibold text-primary">{title}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
          </div>))}
      </div>

      {bankModalOpen ? (<SettingsDialog title={editingBankId ? "Edit Bank" : "Add Bank"} onClose={() => setBankModalOpen(false)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Bank name">
              <input className="field-input" value={bankDraft.bankName} onChange={(event) => setBankDraft((current) => ({ ...current, bankName: event.target.value }))}/>
            </Field>
            <Field label="Short code">
              <input className="field-input" value={bankDraft.shortCode} onChange={(event) => setBankDraft((current) => ({ ...current, shortCode: event.target.value.toUpperCase() }))}/>
            </Field>
            <Field label="Sort order">
              <input className="field-input" min="1" type="number" value={bankDraft.sortOrder} onChange={(event) => setBankDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))}/>
            </Field>
            <Toggle label="Active" checked={bankDraft.isActive} onChange={(value) => setBankDraft((current) => ({ ...current, isActive: value }))}/>
            <div className="md:col-span-2">
              <Field label="Bank logo">
                <input accept={t("ui.image.png.image.jpeg.image.webp.image.svg.xm")} className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={(event) => readImage(event, (url) => setBankDraft((current) => ({ ...current, logoUrl: url })))}/>
              </Field>
            </div>
          </div>
          <DialogActions onCancel={() => setBankModalOpen(false)} onSave={saveBank} saveLabel="Save Bank"/>
        </SettingsDialog>) : null}

      {accountModalOpen ? (<SettingsDialog title={editingAccountId ? "Edit QR Account" : "Add QR Account"} onClose={() => setAccountModalOpen(false)}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Bank">
              <select className="field-input" value={accountDraft.bankId} onChange={(event) => setAccountDraft((current) => ({ ...current, bankId: event.target.value }))}>
                <option value="">Select bank</option>
                {activeBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bankName}</option>)}
              </select>
            </Field>
            <Field label="Display label">
              <input className="field-input" value={accountDraft.displayLabel} onChange={(event) => setAccountDraft((current) => ({ ...current, displayLabel: event.target.value }))}/>
            </Field>
            <Field label="Account name">
              <input className="field-input" value={accountDraft.accountName} onChange={(event) => setAccountDraft((current) => ({ ...current, accountName: event.target.value }))}/>
            </Field>
            <Field label="Account number">
              <input className="field-input" value={accountDraft.accountNumber} onChange={(event) => setAccountDraft((current) => ({ ...current, accountNumber: event.target.value }))}/>
            </Field>
            <Field label="Branch">
              <select className="field-input" value={accountDraft.branchId} onChange={(event) => setAccountDraft((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">Select branch</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </Field>
            <Toggle label="Set as default account" checked={accountDraft.isDefault} onChange={(value) => setAccountDraft((current) => ({ ...current, isDefault: value }))}/>
            <Toggle label="Print QR on receipt" checked={accountDraft.printOnReceipt} onChange={(value) => setAccountDraft((current) => ({ ...current, printOnReceipt: value }))}/>
            <Toggle label="Show QR on customer display" checked={accountDraft.showOnCustomerDisplay} onChange={(value) => setAccountDraft((current) => ({ ...current, showOnCustomerDisplay: value }))}/>
            <Toggle label="Active" checked={accountDraft.isActive} onChange={(value) => setAccountDraft((current) => ({ ...current, isActive: value }))}/>
            <div className="md:col-span-2">
              <Field label="QR image">
                <input accept={t("ui.image.png.image.jpeg.image.webp.image.svg.xm")} className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={(event) => readImage(event, (url) => setAccountDraft((current) => ({ ...current, qrImageUrl: url })))}/>
              </Field>
            </div>
          </div>
          <DialogActions onCancel={() => setAccountModalOpen(false)} onSave={saveQrAccount} saveLabel="Save QR Account"/>
        </SettingsDialog>) : null}

      {bankToDelete ? (<SettingsDialog title={t("ui.delete.bank")} onClose={() => setBankToDelete(null)}>
          <p className="text-sm text-muted-foreground">{t("ui.are.you.sure.you.want.to.delete.this.bank")}</p>
          {qrAccounts.some((account) => account.bankId === bankToDelete.id) ? (<div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{t("ui.this.bank.is.used.by.qr.payment.accounts.dis")}</div>) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setBankToDelete(null)}>Cancel</button>
            <button className="h-10 rounded-md border border-warning/50 px-4 text-sm font-semibold text-warning" type="button" onClick={() => disableBank(bankToDelete)}>Archive instead</button>
            <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={confirmDeleteBank}>Delete</button>
          </div>
        </SettingsDialog>) : null}

      {accountToDelete ? (<SettingsDialog title={t("ui.delete.qr.account")} onClose={() => setAccountToDelete(null)}>
          <p className="text-sm text-muted-foreground">{t("ui.this.removes.the.qr.account.from.demo.settin")}</p>
          <div className="mt-5 flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setAccountToDelete(null)}>Cancel</button>
            <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={confirmDeleteAccount}>Delete</button>
          </div>
        </SettingsDialog>) : null}

      {previewAccount ? (<SettingsDialog title="QR Preview" onClose={() => setPreviewAccount(null)}>
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-background">
              {previewAccount.qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="size-full object-contain" src={previewAccount.qrImageUrl} alt={`${previewAccount.displayLabel} QR`}/>) : (<QrCode className="size-16 text-muted-foreground" aria-hidden="true"/>)}
            </div>
            <div className="text-sm leading-7">
              <div className="font-semibold">{previewAccount.displayLabel}</div>
              <div>{t("ui.bank")}{bankName(previewAccount.bankId)}</div>
              <div>{t("ui.account")}{previewAccount.accountName}</div>
              <div>{t("ui.number")}{previewAccount.accountNumber}</div>
              <div>{t("ui.branch")}{branchName(previewAccount.branchId)}</div>
              <div>{t("ui.status")}{previewAccount.isActive ? "Active" : "Inactive"}</div>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setPreviewAccount(null)}>Done</button>
          </div>
        </SettingsDialog>) : null}
    </div>);
}
function SettingsDialog({ children, onClose, title }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground" type="button" onClick={onClose} aria-label="Close modal">
            <X className="size-4" aria-hidden="true"/>
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>);
}
function DialogActions({ onCancel, onSave, saveLabel }: {
    onCancel: () => void;
    onSave: () => void;
    saveLabel: string;
}) {
    return (<div className="mt-5 flex justify-end gap-2">
      <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onCancel}>Cancel</button>
      <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onSave}>
        <CheckCircle2 className="size-4" aria-hidden="true"/>
        {saveLabel}
      </button>
    </div>);
}
function SectionTitle({ icon: Icon, title }: {
    icon: LucideIcon;
    title: string;
}) {
    return (<div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon aria-hidden="true"/>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>);
}
function Field({ children, label }: {
    children: React.ReactNode;
    label: string;
}) {
    return (<label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>);
}
function Toggle({ checked, label, onChange }: {
    checked: boolean;
    label: string;
    onChange: (value: boolean) => void;
}) {
    return (<label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-sm font-medium">
      <span>{label}</span>
      <input checked={checked} className="size-4 accent-primary" type="checkbox" onChange={(event) => onChange(event.target.checked)}/>
    </label>);
}
