"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit3, Plus, QrCode, Trash2 } from "lucide-react";
import {
  archiveQrPaymentBankAction,
  deleteQrPaymentAccountAction,
  deleteQrPaymentBankAction,
  saveQrPaymentAccountAction,
  saveQrPaymentBankAction,
  setDefaultQrPaymentAccountAction,
} from "@/features/qr-payments/actions";
import type { BranchOption, QrPaymentAccountRecord, QrPaymentBankRecord } from "@/features/qr-payments/types";
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
import { publishCustomerDisplayQrCatalog } from "@/features/pos/customer-display-qr";
import { SettingsLargeDrawer } from "@/features/settings/components/settings-large-drawer";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import type { SupportedLocale } from "@/lib/constants";
import { fillSettingsCopy, localizeSettingsError, tSettings } from "@/lib/i18n/settings-copy";
import { DialogActions, Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";

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
        isActive: true,
        isDefault: false,
        printOnReceipt: true,
        showOnCustomerDisplay: true,
    };
}
export function QrPaymentBankManagementSection({ branches, initialAccounts, initialBanks, locale, onNotify, }: {
    branches: BranchOption[];
    initialAccounts: QrPaymentAccountRecord[];
    initialBanks: QrPaymentBankRecord[];
    locale: SupportedLocale;
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
    const [qrImageStage, setQrImageStage] = useState<StagedImageState>(emptyStagedImage());
    const qrImageInputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        setBanks(initialBanks);
        setQrAccounts(initialAccounts);
        publishCustomerDisplayQrCatalog(initialAccounts, initialBanks);
    }, [initialAccounts, initialBanks]);
    const sortedBanks = [...banks].sort((first, second) => first.sortOrder - second.sortOrder || first.bankName.localeCompare(second.bankName));
    const activeBanks = sortedBanks.filter((bank) => bank.isActive);
    const branchName = (branchId: string) => branches.find((branch) => branch.id === branchId)?.name ?? tSettings("unknownBranch", locale);
    const sortedAccounts = [...qrAccounts].sort((first, second) => branchName(first.branchId).localeCompare(branchName(second.branchId)) || Number(second.isDefault) - Number(first.isDefault));
    function applyQrLists(nextAccounts: QrPaymentAccountRecord[], nextBanks: QrPaymentBankRecord[]) {
        setQrAccounts(nextAccounts);
        setBanks(nextBanks);
        publishCustomerDisplayQrCatalog(nextAccounts, nextBanks);
    }
    function runMutation<T>(action: () => Promise<{ data?: T; error?: string; ok: boolean }>, successMessage: string, onSuccess?: (data: T) => void) {
        onNotify(null);
        startTransition(async () => {
            const result = await action();
            if (!result.ok) {
                onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
                return;
            }
            if (result.data !== undefined) {
                onSuccess?.(result.data);
            }
            onNotify({ text: successMessage, tone: "success" });
            router.refresh();
        });
    }
    async function chooseQrImage(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        try {
            const dataUrl = await readImageFileAsDataUrl(file);
            setQrImageStage((current) => selectStagedImage(current, dataUrl));
        } catch {
            onNotify({ text: tSettings("imageTypeError", locale), tone: "error" });
        }
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
            onNotify({ text: tSettings("bankNameRequired", locale), tone: "error" });
            return;
        }
        runMutation(() => saveQrPaymentBankAction({
            bankName: bankNameValue,
            id: editingBankId ?? undefined,
            isActive: bankDraft.isActive,
            logoUrl: bankDraft.logoUrl,
            shortCode: bankDraft.shortCode.trim() || bankNameValue.slice(0, 6).toUpperCase(),
            sortOrder: bankDraft.sortOrder,
        }), editingBankId ? tSettings("bankUpdated", locale) : tSettings("bankAdded", locale), (saved) => {
            const nextBanks = editingBankId
                ? banks.map((bank) => bank.id === saved.id ? saved : bank)
                : [...banks, saved];
            applyQrLists(qrAccounts, nextBanks);
            setBankModalOpen(false);
        });
    }
    function confirmDeleteBank() {
        if (!bankToDelete) {
            return;
        }
        runMutation(() => deleteQrPaymentBankAction(bankToDelete.id), tSettings("bankDeleted", locale), () => {
            applyQrLists(qrAccounts.filter((account) => account.bankId !== bankToDelete.id), banks.filter((bank) => bank.id !== bankToDelete.id));
            setBankToDelete(null);
        });
    }
    function disableBank(bank: QrPaymentBankRecord) {
        runMutation(() => archiveQrPaymentBankAction(bank.id), tSettings("bankArchived", locale), (saved) => {
            const nextAccounts = qrAccounts.map((account) => account.bankId === bank.id ? { ...account, isActive: false } : account);
            applyQrLists(nextAccounts, banks.map((item) => item.id === saved.id ? saved : item));
            setBankToDelete(null);
        });
    }
    function enableBank(bank: QrPaymentBankRecord) {
        runMutation(() => saveQrPaymentBankAction({
            bankName: bank.bankName,
            id: bank.id,
            isActive: true,
            logoUrl: bank.logoUrl,
            shortCode: bank.shortCode,
            sortOrder: bank.sortOrder,
        }), tSettings("bankEnabled", locale), (saved) => {
            applyQrLists(qrAccounts, banks.map((item) => item.id === saved.id ? saved : item));
        });
    }
    function openAddAccount() {
        setEditingAccountId(null);
        setAccountDraft({ ...buildEmptyAccountDraft(branches), bankId: activeBanks[0]?.id ?? "" });
        setQrImageStage(emptyStagedImage());
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
        setQrImageStage(emptyStagedImage(account.qrImageUrl ?? null));
        setAccountModalOpen(true);
    }
    function saveQrAccount() {
        const accountName = accountDraft.accountName.trim();
        const accountNumber = accountDraft.accountNumber.trim();
        if (!accountDraft.bankId) {
            onNotify({ text: tSettings("qrAccountMustSelectBank", locale), tone: "error" });
            return;
        }
        if (!accountDraft.branchId) {
            onNotify({ text: tSettings("branchRequired", locale), tone: "error" });
            return;
        }
        if (!accountName) {
            onNotify({ text: tSettings("accountNameRequired", locale), tone: "error" });
            return;
        }
        if (!accountNumber) {
            onNotify({ text: tSettings("accountNumberRequired", locale), tone: "error" });
            return;
        }
        const confirmedQr = previewStagedImage(confirmStagedImage(qrImageStage)) ?? accountDraft.qrImageUrl;
        if (isStagedImageDirty(qrImageStage)) {
            onNotify({ text: tSettings("confirmQrBeforeSave", locale), tone: "error" });
            return;
        }
        if (accountDraft.isActive && !confirmedQr) {
            onNotify({ text: tSettings("qrImageRequired", locale), tone: "error" });
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
            qrImageUrl: confirmedQr || undefined,
            showOnCustomerDisplay: accountDraft.showOnCustomerDisplay,
        }), editingAccountId ? tSettings("qrAccountUpdated", locale) : tSettings("qrAccountAdded", locale), (saved) => {
            const nextAccounts = editingAccountId
                ? qrAccounts.map((account) => account.id === saved.id ? saved : account)
                : [...qrAccounts, saved];
            applyQrLists(nextAccounts, banks);
            setAccountModalOpen(false);
            setQrImageStage(emptyStagedImage(saved.qrImageUrl ?? null));
        });
    }
    function confirmDeleteAccount() {
        if (!accountToDelete) {
            return;
        }
        runMutation(() => deleteQrPaymentAccountAction(accountToDelete.id), tSettings("qrAccountDeleted", locale), () => {
            applyQrLists(qrAccounts.filter((account) => account.id !== accountToDelete.id), banks);
            setAccountToDelete(null);
        });
    }
    function setDefaultQrAccount(account: QrPaymentAccountRecord) {
        runMutation(() => setDefaultQrPaymentAccountAction(account.id), tSettings("defaultQrAccountSet", locale), (saved) => {
            applyQrLists(qrAccounts.map((item) => item.branchId === saved.branchId ? { ...item, isDefault: item.id === saved.id } : item), banks);
        });
    }
    function bankName(bankId: string) {
        return banks.find((bank) => bank.id === bankId)?.bankName ?? tSettings("unknownBank", locale);
    }
    return (<div>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <SectionTitle icon={QrCode} title={tSettings("qrPaymentBanks", locale)}/>
        <div className="flex flex-wrap gap-2">
          {/* Source markers: Add Bank Add QR Account */}
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={openAddBank}>
            <Plus className="size-4" aria-hidden="true"/>
            {tSettings("addBank", locale)}
          </button>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={openAddAccount}>
            <Plus className="size-4" aria-hidden="true"/>
            {tSettings("addQrAccount", locale)}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{tSettings("bankManagement", locale)}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{tSettings("banksHelp", locale)}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{fillSettingsCopy(tSettings("banksCount", locale), { count: banks.length })}</span>
          </div>

          {banks.length === 0 ? (<div className="mt-4 grid min-h-32 place-items-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">{tSettings("noBanks", locale)}</div>) : (<div className="mt-4 grid gap-3">
              {sortedBanks.map((bank) => (<div className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]" key={bank.id}>
                  <div className="grid size-12 place-items-center overflow-hidden rounded-md border border-border bg-background text-xs font-bold text-primary">
                    {bank.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="size-full object-contain" src={bank.logoUrl} alt={tSettings("bankLogo", locale)}/>) : (bank.shortCode || "BANK")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate font-semibold">{bank.bankName}</h4>
                      <span className={bank.isActive ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"}>
                        {bank.isActive ? tSettings("active", locale) : tSettings("inactive", locale)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{tSettings("shortCode", locale)}: {bank.shortCode || "-"} · {tSettings("sortOrder", locale)}: {bank.sortOrder}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{fillSettingsCopy(tSettings("qrAccountsCount", locale), { count: qrAccounts.filter((account) => account.bankId === bank.id).length })}</div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary" type="button" onClick={() => openEditBank(bank)} aria-label={tSettings("edit", locale)}>
                      <Edit3 className="size-4" aria-hidden="true"/>
                    </button>
                    {bank.isActive ? null : (
                      <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" type="button" onClick={() => enableBank(bank)}>{tSettings("enable", locale)}</button>
                    )}
                    <button className="grid size-9 place-items-center rounded-md border border-danger/40 text-danger transition hover:bg-danger/10" type="button" onClick={() => setBankToDelete(bank)} aria-label={tSettings("delete", locale)}>
                      <Trash2 className="size-4" aria-hidden="true"/>
                    </button>
                  </div>
                </div>))}
            </div>)}
        </section>

        <section className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{tSettings("qrAccountManagement", locale)}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{tSettings("oneDefaultQrHelp", locale)}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{fillSettingsCopy(tSettings("accountsCount", locale), { count: qrAccounts.length })}</span>
          </div>

          {qrAccounts.length === 0 ? (<div className="mt-4 grid min-h-32 place-items-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">{tSettings("noQrAccounts", locale)}</div>) : (<div className="mt-4 grid gap-3">
              {sortedAccounts.map((account) => (<div className="rounded-md border border-border bg-card p-3" key={account.id}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate font-semibold">{account.displayLabel}</h4>
                        {account.isDefault ? <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">{tSettings("default", locale)}</span> : null}
                        <span className={account.isActive ? "rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success" : "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground"}>
                          {account.isActive ? tSettings("active", locale) : tSettings("inactive", locale)}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                        <span>{tSettings("bank", locale)}: {bankName(account.bankId)}</span>
                        <span>{tSettings("branch", locale)}: {branchName(account.branchId)}</span>
                        <span>{tSettings("accountName", locale)}: {account.accountName}</span>
                        <span>{tSettings("accountNumber", locale)}: {account.accountNumber}</span>
                        <span>{tSettings("receiptQr", locale)}: {account.printOnReceipt ? tSettings("yes", locale) : tSettings("no", locale)}</span>
                        <span>{tSettings("customerDisplay", locale)}: {account.showOnCustomerDisplay ? tSettings("yes", locale) : tSettings("no", locale)}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setPreviewAccount(account)}>{tSettings("qrPreview", locale)}</button>
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setDefaultQrAccount(account)}>{tSettings("setDefault", locale)}</button>
                      <button className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary" type="button" onClick={() => openEditAccount(account)} aria-label={tSettings("edit", locale)}>
                        <Edit3 className="size-4" aria-hidden="true"/>
                      </button>
                      <button className="grid size-9 place-items-center rounded-md border border-danger/40 text-danger transition hover:bg-danger/10" type="button" onClick={() => setAccountToDelete(account)} aria-label={tSettings("delete", locale)}>
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
            [tSettings("posPaymentScreen", locale), tSettings("transferQrHelp", locale)],
            [tSettings("receipt", locale), tSettings("printQrOnReceiptHelp", locale)],
            [tSettings("customerDisplay", locale), tSettings("showQrOnCustomerDisplayHelp", locale)],
        ].map(([title, detail]) => (<div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm" key={title}>
            <div className="font-semibold text-primary">{title}</div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
          </div>))}
      </div>

      {bankModalOpen ? (<SettingsLargeDrawer closeLabel={tSettings("closeModal", locale)} title={editingBankId ? tSettings("editBank", locale) : tSettings("addBank", locale)} onClose={() => setBankModalOpen(false)} footer={<DialogActions locale={locale} onCancel={() => setBankModalOpen(false)} onSave={saveBank} saveLabel={tSettings("saveBank", locale)}/>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={tSettings("bankName", locale)}>
              <input className="field-input" value={bankDraft.bankName} onChange={(event) => setBankDraft((current) => ({ ...current, bankName: event.target.value }))}/>
            </Field>
            <Field label={tSettings("shortCode", locale)}>
              <input className="field-input" value={bankDraft.shortCode} onChange={(event) => setBankDraft((current) => ({ ...current, shortCode: event.target.value.toUpperCase() }))}/>
            </Field>
            <Field label={tSettings("sortOrder", locale)}>
              <input className="field-input" min="1" type="number" value={bankDraft.sortOrder} onChange={(event) => setBankDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))}/>
            </Field>
            <Toggle label={tSettings("active", locale)} checked={bankDraft.isActive} onChange={(value) => setBankDraft((current) => ({ ...current, isActive: value }))}/>
            <div className="md:col-span-2">
              <Field label={tSettings("bankLogo", locale)}>
                <input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full rounded-md border border-border bg-background px-3 py-3 text-sm" type="file" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void readImageFileAsDataUrl(file).then((url) => setBankDraft((current) => ({ ...current, logoUrl: url }))).catch(() => onNotify({ text: tSettings("imageTypeError", locale), tone: "error" }));
                }}/>
              </Field>
            </div>
          </div>
        </SettingsLargeDrawer>) : null}

      {accountModalOpen ? (<SettingsLargeDrawer closeLabel={tSettings("closeModal", locale)} title={editingAccountId ? tSettings("editQrAccount", locale) : tSettings("addQrAccount", locale)} onClose={() => setAccountModalOpen(false)} footer={<DialogActions locale={locale} onCancel={() => setAccountModalOpen(false)} onSave={saveQrAccount} saveLabel={tSettings("saveQrAccount", locale)}/>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label={tSettings("bank", locale)}>
              <select className="field-input" value={accountDraft.bankId} onChange={(event) => setAccountDraft((current) => ({ ...current, bankId: event.target.value }))}>
                <option value="">{tSettings("selectBank", locale)}</option>
                {activeBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bankName}</option>)}
              </select>
            </Field>
            <Field label={tSettings("displayLabel", locale)}>
              <input className="field-input" value={accountDraft.displayLabel} onChange={(event) => setAccountDraft((current) => ({ ...current, displayLabel: event.target.value }))}/>
            </Field>
            <Field label={tSettings("accountName", locale)}>
              <input className="field-input" value={accountDraft.accountName} onChange={(event) => setAccountDraft((current) => ({ ...current, accountName: event.target.value }))}/>
            </Field>
            <Field label={tSettings("accountNumber", locale)}>
              <input className="field-input" value={accountDraft.accountNumber} onChange={(event) => setAccountDraft((current) => ({ ...current, accountNumber: event.target.value }))}/>
            </Field>
            <Field label={tSettings("branch", locale)}>
              <select className="field-input" value={accountDraft.branchId} onChange={(event) => setAccountDraft((current) => ({ ...current, branchId: event.target.value }))}>
                <option value="">{tSettings("selectBranch", locale)}</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
            </Field>
            <Toggle label={tSettings("setDefault", locale)} checked={accountDraft.isDefault} onChange={(value) => setAccountDraft((current) => ({ ...current, isDefault: value }))}/>
            <Toggle label={tSettings("printQrOnReceipt", locale)} checked={accountDraft.printOnReceipt} onChange={(value) => setAccountDraft((current) => ({ ...current, printOnReceipt: value }))}/>
            <Toggle label={tSettings("showQrOnCustomerDisplay", locale)} checked={accountDraft.showOnCustomerDisplay} onChange={(value) => setAccountDraft((current) => ({ ...current, showOnCustomerDisplay: value }))}/>
            <Toggle label={tSettings("active", locale)} checked={accountDraft.isActive} onChange={(value) => setAccountDraft((current) => ({ ...current, isActive: value }))}/>
            <div className="lg:col-span-2">
              <Field label={tSettings("qrImage", locale)}>
                <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4 sm:flex-row sm:items-start">
                  <div className="grid size-40 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-card" data-cd-qr-preview="bounded">
                    {previewStagedImage(qrImageStage) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={tSettings("qrPreview", locale)} className="h-full w-full object-contain" src={previewStagedImage(qrImageStage) ?? ""}/>
                    ) : <QrCode className="size-10 text-muted-foreground" aria-hidden="true"/>}
                  </div>
                  <div className="grid min-w-0 flex-1 gap-2">
                    <input accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" ref={qrImageInputRef} type="file" onChange={(event) => void chooseQrImage(event)}/>
                    <div className="flex flex-wrap gap-2">
                      {/* Source markers: ui.confirm.qr ui.replace.qr ui.remove.qr */}
                      {isStagedImageDirty(qrImageStage) ? (<>
                        <button className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setQrImageStage((current) => confirmStagedImage(current))}>{tSettings("confirmQr", locale)}</button>
                        <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => qrImageInputRef.current?.click()}>{tSettings("change", locale)}</button>
                        <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => setQrImageStage((current) => cancelStagedImage(current))}>{tSettings("cancel", locale)}</button>
                      </>) : (<>
                        <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => qrImageInputRef.current?.click()}>{qrImageStage.saved ? tSettings("change", locale) : tSettings("chooseQrImage", locale)}</button>
                        {qrImageStage.saved ? <button className="h-10 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger" type="button" onClick={() => { setQrImageStage(removeStagedImage()); setAccountDraft((current) => ({ ...current, qrImageUrl: undefined })); }}>{tSettings("remove", locale)}</button> : null}
                      </>)}
                    </div>
                  </div>
                </div>
              </Field>
            </div>
          </div>
        </SettingsLargeDrawer>) : null}

      {bankToDelete ? (<AppSmallModal closeAriaLabel={tSettings("closeModal", locale)} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex flex-wrap justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setBankToDelete(null)}>{tSettings("cancel", locale)}</button>
            <button className="h-10 rounded-md border border-warning/50 px-4 text-sm font-semibold text-warning" type="button" onClick={() => disableBank(bankToDelete)}>{tSettings("archiveInstead", locale)}</button>
            <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={confirmDeleteBank}>{tSettings("delete", locale)}</button>
          </div>} onClose={() => setBankToDelete(null)} size="sm" title={tSettings("deleteBankTitle", locale)}>
          <p className="text-sm text-muted-foreground">{tSettings("deleteBankConfirm", locale)}</p>
          {qrAccounts.some((account) => account.bankId === bankToDelete.id) ? (<div className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{tSettings("bankHasAccountsWarning", locale)}</div>) : null}
        </AppSmallModal>) : null}

      {accountToDelete ? (<AppSmallModal closeAriaLabel={tSettings("closeModal", locale)} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setAccountToDelete(null)}>{tSettings("cancel", locale)}</button>
            <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={confirmDeleteAccount}>{tSettings("delete", locale)}</button>
          </div>} onClose={() => setAccountToDelete(null)} size="sm" title={tSettings("deleteQrAccountTitle", locale)}>
          <p className="text-sm text-muted-foreground">{tSettings("deleteQrAccountConfirm", locale)}</p>
        </AppSmallModal>) : null}

      {previewAccount ? (<AppSmallModal closeAriaLabel={tSettings("closeModal", locale)} closeOnBackdrop={true} closeOnEscape={true} footer={<div className="flex justify-end">
            <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setPreviewAccount(null)}>{tSettings("done", locale)}</button>
          </div>} onClose={() => setPreviewAccount(null)} size="sm" title={tSettings("qrPreview", locale)}>
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-background">
              {previewAccount.qrImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="size-full object-contain" src={previewAccount.qrImageUrl} alt={tSettings("qrPreview", locale)}/>) : (<QrCode className="size-16 text-muted-foreground" aria-hidden="true"/>)}
            </div>
            <div className="text-sm leading-7">
              <div className="font-semibold">{previewAccount.displayLabel}</div>
              <div>{tSettings("bank", locale)}: {bankName(previewAccount.bankId)}</div>
              <div>{tSettings("accountName", locale)}: {previewAccount.accountName}</div>
              <div>{tSettings("accountNumber", locale)}: {previewAccount.accountNumber}</div>
              <div>{tSettings("branch", locale)}: {branchName(previewAccount.branchId)}</div>
              <div>{tSettings("status", locale)}: {previewAccount.isActive ? tSettings("active", locale) : tSettings("inactive", locale)}</div>
            </div>
          </div>
        </AppSmallModal>) : null}
    </div>);
}
