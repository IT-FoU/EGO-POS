import { prisma } from "@/lib/db/prisma";
import { recordEssentialActivity } from "@/features/store-activity/record-essential-activity";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import type { SettingsFormData } from "@/features/settings/types";
import { parseRequireCashShiftBeforeSaleFlag, unitPricingDefaultsWithoutCashShift } from "@/features/products/unit-pricing-defaults";
import { readCompanyRequireCashShift } from "@/features/settings/cash-shift-policy";
import {
  DEFAULT_RECEIPT_LAYOUT,
  parseReceiptLayoutPrefs,
  receiptFormFieldsFromLayout,
  receiptLayoutFromFormFields,
  withReceiptLayoutPrefs,
} from "@/features/settings/receipt-layout";
import { clearStoredLogo, storeReplacementLogo } from "@/features/brand/company-logo-service";
import { APPROVAL_RULE_KEYS } from "@/features/access-control/permission-catalog";
import { signCompanyLogoUrl } from "@/lib/storage/company-logo-storage";

const db = prisma as any;

const DEFAULT_SETTINGS = {
  baseCurrency: "LAK" as const,
  currencyDisplay: "LAK",
  decimalPlaces: 0,
  loyaltyAllowPartial: true,
  loyaltyAllowRedeemWithDiscount: true,
  loyaltyEnabled: true,
  loyaltyExpiryDays: 0,
  loyaltyExpiryEnabled: false,
  loyaltyExpiryUnit: "days" as const,
  loyaltyMaxRedeemPoints: 0,
  loyaltyMinRedeemPoints: 1,
  loyaltyPointValueLak: 1000,
  loyaltySpendPerPointLak: 10000,
  receiptPrefix: "INV",
  receiptPaperSize: DEFAULT_RECEIPT_LAYOUT.paperSize,
  receiptCustomWidthMm: DEFAULT_RECEIPT_LAYOUT.customWidthMm,
  receiptCustomHeightMm: DEFAULT_RECEIPT_LAYOUT.customHeightMm,
  receiptPrintMode: "ask_every_time" as const,
  receiptShowAddress: true,
  receiptShowBranchName: true,
  receiptShowCashier: true,
  receiptShowCompanyName: true,
  receiptShowDateTime: true,
  receiptShowEmail: true,
  receiptShowFooter: true,
  receiptShowHeader: true,
  receiptShowPhone: true,
  receiptShowQr: true,
  receiptShowReceiptNumber: true,
  receiptShowTaxNumber: true,
  requireCashShiftBeforeSale: true,
  roundingMethod: "nearest",
  showLogoOnReceipt: true,
  showTaxOnReceipt: true,
  taxInclusive: false,
  vatEnabled: false,
  vatRate: 0,
};

type SettingsRow = Record<string, any>;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCurrency(value: unknown): SettingsFormData["baseCurrency"] {
  return value === "THB" || value === "USD" ? value : "LAK";
}

function mergeSettingsInput(
  current: SettingsFormData,
  input: Partial<SettingsFormData>,
): Partial<SettingsFormData> {
  const merged: Partial<SettingsFormData> = { ...current };
  for (const [key, value] of Object.entries(input) as Array<[keyof SettingsFormData, SettingsFormData[keyof SettingsFormData]]>) {
    if (value !== undefined) {
      merged[key] = value as never;
    }
  }
  return merged;
}

function normalizeSettingsInput(input: Partial<SettingsFormData>): SettingsFormData {
  if (input.vatRate !== undefined) {
    const vatRate = numberValue(input.vatRate);
    if (vatRate < 0 || vatRate > 100) {
      throw new Error("VAT rate must be between 0 and 100.");
    }
  }
  if (input.decimalPlaces !== undefined) {
    const decimalPlaces = numberValue(input.decimalPlaces);
    if (decimalPlaces < 0 || decimalPlaces > 4 || !Number.isInteger(decimalPlaces)) {
      throw new Error("Decimal places must be an integer between 0 and 4.");
    }
  }

  const vatRate = Math.min(Math.max(numberValue(input.vatRate, DEFAULT_SETTINGS.vatRate), 0), 100);
  const decimalPlaces = Math.min(Math.max(Math.floor(numberValue(input.decimalPlaces, DEFAULT_SETTINGS.decimalPlaces)), 0), 4);
  const loyaltySpendPerPointLak = Math.max(numberValue(input.loyaltySpendPerPointLak, DEFAULT_SETTINGS.loyaltySpendPerPointLak), 1);
  const loyaltyPointValueLak = Math.max(numberValue(input.loyaltyPointValueLak, DEFAULT_SETTINGS.loyaltyPointValueLak), 0);
  const loyaltyMinRedeemPoints = Math.max(Math.floor(numberValue(input.loyaltyMinRedeemPoints, DEFAULT_SETTINGS.loyaltyMinRedeemPoints)), 1);
  const loyaltyMaxRedeemPoints = Math.max(Math.floor(numberValue(input.loyaltyMaxRedeemPoints, DEFAULT_SETTINGS.loyaltyMaxRedeemPoints)), 0);
  const loyaltyExpiryDays = Math.max(Math.floor(numberValue(input.loyaltyExpiryDays, DEFAULT_SETTINGS.loyaltyExpiryDays)), 0);
  const loyaltyExpiryEnabled = input.loyaltyExpiryEnabled === true;
  if (loyaltyExpiryEnabled && loyaltyExpiryDays < 1) {
    throw new Error("Point expiry days must be at least 1.");
  }
  if (loyaltyMaxRedeemPoints > 0 && loyaltyMaxRedeemPoints < loyaltyMinRedeemPoints) {
    throw new Error("Maximum redeem points cannot be below the minimum.");
  }

  return {
    baseCurrency: normalizeCurrency(input.baseCurrency),
    companyName: stringValue(input.companyName),
    currencyDisplay: stringValue(input.currencyDisplay, DEFAULT_SETTINGS.currencyDisplay),
    decimalPlaces,
    loyaltyAllowPartial: input.loyaltyAllowPartial !== false,
    loyaltyAllowRedeemWithDiscount: input.loyaltyAllowRedeemWithDiscount !== false,
    loyaltyEnabled: Boolean(input.loyaltyEnabled),
    loyaltyExpiryDays,
    loyaltyExpiryEnabled,
    loyaltyExpiryUnit: input.loyaltyExpiryUnit === "months" ? "months" : "days",
    loyaltyMaxRedeemPoints,
    loyaltyMinRedeemPoints,
    loyaltyPointValueLak,
    loyaltySpendPerPointLak,
    profileAddress: optionalString(input.profileAddress),
    profileEmail: optionalString(input.profileEmail),
    profilePhone: optionalString(input.profilePhone),
    receiptFooter: optionalString(input.receiptFooter),
    receiptHeader: optionalString(input.receiptHeader),
    ...receiptFormFieldsFromLayout(receiptLayoutFromFormFields(input)),
    receiptPrintMode: ["ask_every_time", "auto_print", "no_auto_print"].includes(String(input.receiptPrintMode))
      ? (String(input.receiptPrintMode) as SettingsFormData["receiptPrintMode"])
      : DEFAULT_SETTINGS.receiptPrintMode,
    receiptPrefix: stringValue(input.receiptPrefix, DEFAULT_SETTINGS.receiptPrefix),
    // Missing/null/undefined => ON. Explicit false/"false"/0 => OFF. Never Boolean("false").
    requireCashShiftBeforeSale:
      input.requireCashShiftBeforeSale === undefined || input.requireCashShiftBeforeSale === null
        ? DEFAULT_SETTINGS.requireCashShiftBeforeSale
        : parseRequireCashShiftBeforeSaleFlag(input.requireCashShiftBeforeSale),
    roundingMethod: ["down", "nearest", "up"].includes(String(input.roundingMethod)) ? String(input.roundingMethod) : DEFAULT_SETTINGS.roundingMethod,
    showLogoOnReceipt: Boolean(input.showLogoOnReceipt),
    showTaxOnReceipt: Boolean(input.showTaxOnReceipt),
    taxInclusive: Boolean(input.taxInclusive),
    taxNumber: optionalString(input.taxNumber),
    vatEnabled: Boolean(input.vatEnabled),
    vatRate,
  };
}

export function taxAndLoyaltyFromSettingsRow(settings: SettingsRow | null | undefined) {
  const row = settings ?? {};
  return {
    loyaltyAllowPartial: row.loyaltyAllowPartial !== false,
    loyaltyAllowRedeemWithDiscount: row.loyaltyAllowRedeemWithDiscount !== false,
    loyaltyEnabled: row.loyaltyEnabled ?? DEFAULT_SETTINGS.loyaltyEnabled,
    loyaltyExpiryDays: toNumber(row.loyaltyExpiryDays, DEFAULT_SETTINGS.loyaltyExpiryDays),
    loyaltyExpiryEnabled: row.loyaltyExpiryEnabled === true,
    loyaltyExpiryUnit: row.loyaltyExpiryUnit === "months" ? "months" : "days",
    loyaltyMaxRedeemPoints: toNumber(row.loyaltyMaxRedeemPoints, DEFAULT_SETTINGS.loyaltyMaxRedeemPoints),
    loyaltyMinRedeemPoints: toNumber(row.loyaltyMinRedeemPoints, DEFAULT_SETTINGS.loyaltyMinRedeemPoints),
    loyaltyPointValueLak: toNumber(row.loyaltyPointValueLak, DEFAULT_SETTINGS.loyaltyPointValueLak),
    loyaltySpendPerPointLak: toNumber(row.loyaltySpendPerPointLak, DEFAULT_SETTINGS.loyaltySpendPerPointLak),
    taxInclusive: row.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
    vatEnabled: row.vatEnabled ?? DEFAULT_SETTINGS.vatEnabled,
    vatRate: toNumber(row.vatRate, DEFAULT_SETTINGS.vatRate),
  };
}

/** Canonical company boolean. JSON is only a fallback when the column is absent. */
export function requireCashShiftBeforeSaleFromOpsRow(ops: SettingsRow | null | undefined) {
  return readCompanyRequireCashShift(ops);
}

function mapSettings(company: SettingsRow): SettingsFormData {
  const settings = company.settings ?? {};
  const layout = parseReceiptLayoutPrefs(settings.unitPricingDefaults);

  return {
    baseCurrency: normalizeCurrency(settings.baseCurrency ?? company.baseCurrency),
    companyName: company.name ?? "",
    currencyDisplay: settings.currencyDisplay ?? DEFAULT_SETTINGS.currencyDisplay,
    decimalPlaces: toNumber(settings.decimalPlaces, DEFAULT_SETTINGS.decimalPlaces),
    loyaltyAllowPartial: settings.loyaltyAllowPartial !== false,
    loyaltyAllowRedeemWithDiscount: settings.loyaltyAllowRedeemWithDiscount !== false,
    loyaltyEnabled: settings.loyaltyEnabled ?? DEFAULT_SETTINGS.loyaltyEnabled,
    loyaltyExpiryDays: toNumber(settings.loyaltyExpiryDays, DEFAULT_SETTINGS.loyaltyExpiryDays),
    loyaltyExpiryEnabled: settings.loyaltyExpiryEnabled === true,
    loyaltyExpiryUnit: settings.loyaltyExpiryUnit === "months" ? "months" : "days",
    loyaltyMaxRedeemPoints: toNumber(settings.loyaltyMaxRedeemPoints, DEFAULT_SETTINGS.loyaltyMaxRedeemPoints),
    loyaltyMinRedeemPoints: toNumber(settings.loyaltyMinRedeemPoints, DEFAULT_SETTINGS.loyaltyMinRedeemPoints),
    loyaltyPointValueLak: toNumber(settings.loyaltyPointValueLak, DEFAULT_SETTINGS.loyaltyPointValueLak),
    loyaltySpendPerPointLak: toNumber(settings.loyaltySpendPerPointLak, DEFAULT_SETTINGS.loyaltySpendPerPointLak),
    profileAddress: settings.profileAddress ?? undefined,
    profileEmail: settings.profileEmail ?? undefined,
    profilePhone: settings.profilePhone ?? undefined,
    receiptFooter: settings.receiptFooter ?? undefined,
    receiptHeader: settings.receiptHeader ?? undefined,
    ...receiptFormFieldsFromLayout(layout),
    receiptPrintMode: DEFAULT_SETTINGS.receiptPrintMode,
    receiptPrefix: settings.receiptPrefix ?? DEFAULT_SETTINGS.receiptPrefix,
    requireCashShiftBeforeSale: DEFAULT_SETTINGS.requireCashShiftBeforeSale,
    roundingMethod: settings.roundingMethod ?? DEFAULT_SETTINGS.roundingMethod,
    showLogoOnReceipt: settings.showLogoOnReceipt ?? DEFAULT_SETTINGS.showLogoOnReceipt,
    showTaxOnReceipt: settings.showTaxOnReceipt ?? DEFAULT_SETTINGS.showTaxOnReceipt,
    taxInclusive: settings.taxInclusive ?? DEFAULT_SETTINGS.taxInclusive,
    taxNumber: settings.taxNumber ?? undefined,
    vatEnabled: settings.vatEnabled ?? DEFAULT_SETTINGS.vatEnabled,
    vatRate: toNumber(settings.vatRate, DEFAULT_SETTINGS.vatRate),
  };
}

export async function getPrismaSettings(tenant: TenantContext) {
  const company = await db.company.findFirst({
    include: { settings: true },
    where: {
      id: tenant.companyId,
      members: { some: { status: "active", userId: tenant.userId } },
    },
  });

  if (!company) {
    throw new Error("Company settings not found.");
  }

  return {
    ...mapSettings(company),
    requireCashShiftBeforeSale: requireCashShiftBeforeSaleFromOpsRow(company.settings),
  };
}

export async function getSettingsLandingSummary(
  tenant: TenantContext,
  options: { settingsOn: boolean; staffOn: boolean },
) {
  const companyId = tenant.companyId;
  const [logo, activeQrAccounts, activeQrBanks, activeStaff, disabledApprovalRules] = await Promise.all([
    options.settingsOn
      ? db.companySetting.findUnique({
          select: { logoObjectPath: true },
          where: { companyId },
        })
      : Promise.resolve(null),
    options.settingsOn
      ? db.qrPaymentAccount.count({ where: { companyId, isActive: true } })
      : Promise.resolve(0),
    options.settingsOn
      ? db.qrPaymentBank.count({ where: { companyId, isActive: true } })
      : Promise.resolve(0),
    options.staffOn
      ? db.companyUser.count({ where: { companyId, status: "active" } })
      : Promise.resolve(0),
    options.staffOn
      ? db.approvalRule.count({
          where: {
            companyId,
            isEnabled: false,
            ruleKey: { in: [...APPROVAL_RULE_KEYS] },
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    activeQrAccounts,
    activeQrBanks,
    activeStaff,
    approvalRulesEnabled: options.staffOn ? APPROVAL_RULE_KEYS.length - disabledApprovalRules : 0,
    hasLogo: Boolean(logo?.logoObjectPath),
  };
}

export async function getCompanyBusinessLogoUrl(companyId: string) {
  const settings = await db.companySetting.findUnique({
    select: { logoObjectPath: true },
    where: { companyId },
  });
  return signCompanyLogoUrl(settings?.logoObjectPath ? String(settings.logoObjectPath) : null, companyId);
}

export async function updatePrismaSettings(input: Partial<SettingsFormData>, tenant: TenantContext) {
  const current = await getPrismaSettings(tenant);
  const normalized = normalizeSettingsInput(mergeSettingsInput(current, input));

  if (!normalized.companyName) {
    throw new Error("Company name is required.");
  }

  const { receiptPrintMode: _devicePrintMode, ...companyPayload } = normalized;
  const settingsSummary = importantSettingsSummary(current, normalized);

  return withTenantTransaction({
    action: "update",
    module: "settings",
    newData: companyPayload,
    tenant,
    write: async (tx) => {
      const company = await tx.company.findFirstOrThrow({
        where: {
          id: tenant.companyId,
          members: { some: { status: "active", userId: tenant.userId } },
        },
      });

      await tx.company.update({
        data: {
          baseCurrency: normalized.baseCurrency,
          name: normalized.companyName,
        },
        where: { id: company.id },
      });

      const existingSettings = await tx.companySetting.findUnique({
        select: { unitPricingDefaults: true },
        where: { companyId: company.id },
      });
      const stripped = unitPricingDefaultsWithoutCashShift(existingSettings?.unitPricingDefaults);
      const nextDefaults = withReceiptLayoutPrefs(
        stripped,
        receiptLayoutFromFormFields(normalized),
      );

      await tx.companySetting.upsert({
        create: {
          baseCurrency: normalized.baseCurrency,
          companyId: company.id,
          currencyDisplay: normalized.currencyDisplay,
          decimalPlaces: normalized.decimalPlaces,
          loyaltyAllowPartial: normalized.loyaltyAllowPartial,
          loyaltyAllowRedeemWithDiscount: normalized.loyaltyAllowRedeemWithDiscount,
          loyaltyEnabled: normalized.loyaltyEnabled,
          loyaltyExpiryDays: normalized.loyaltyExpiryDays > 0 ? normalized.loyaltyExpiryDays : null,
          loyaltyExpiryEnabled: normalized.loyaltyExpiryEnabled,
          loyaltyExpiryUnit: normalized.loyaltyExpiryUnit,
          loyaltyMaxRedeemPoints: normalized.loyaltyMaxRedeemPoints > 0 ? normalized.loyaltyMaxRedeemPoints : null,
          loyaltyMinRedeemPoints: normalized.loyaltyMinRedeemPoints,
          loyaltyPointValueLak: normalized.loyaltyPointValueLak,
          loyaltySpendPerPointLak: normalized.loyaltySpendPerPointLak,
          profileAddress: normalized.profileAddress,
          profileEmail: normalized.profileEmail,
          profilePhone: normalized.profilePhone,
          receiptFooter: normalized.receiptFooter,
          receiptHeader: normalized.receiptHeader,
          receiptPrefix: normalized.receiptPrefix,
          requireCashShiftBeforeSale: normalized.requireCashShiftBeforeSale,
          roundingMethod: normalized.roundingMethod,
          showLogoOnReceipt: normalized.showLogoOnReceipt,
          showTaxOnReceipt: normalized.showTaxOnReceipt,
          taxInclusive: normalized.taxInclusive,
          taxNumber: normalized.taxNumber,
          unitPricingDefaults: nextDefaults,
          vatEnabled: normalized.vatEnabled,
          vatRate: normalized.vatRate,
        },
        update: {
          baseCurrency: normalized.baseCurrency,
          currencyDisplay: normalized.currencyDisplay,
          decimalPlaces: normalized.decimalPlaces,
          loyaltyAllowPartial: normalized.loyaltyAllowPartial,
          loyaltyAllowRedeemWithDiscount: normalized.loyaltyAllowRedeemWithDiscount,
          loyaltyEnabled: normalized.loyaltyEnabled,
          loyaltyExpiryDays: normalized.loyaltyExpiryDays > 0 ? normalized.loyaltyExpiryDays : null,
          loyaltyExpiryEnabled: normalized.loyaltyExpiryEnabled,
          loyaltyExpiryUnit: normalized.loyaltyExpiryUnit,
          loyaltyMaxRedeemPoints: normalized.loyaltyMaxRedeemPoints > 0 ? normalized.loyaltyMaxRedeemPoints : null,
          loyaltyMinRedeemPoints: normalized.loyaltyMinRedeemPoints,
          loyaltyPointValueLak: normalized.loyaltyPointValueLak,
          loyaltySpendPerPointLak: normalized.loyaltySpendPerPointLak,
          profileAddress: normalized.profileAddress,
          profileEmail: normalized.profileEmail,
          profilePhone: normalized.profilePhone,
          receiptFooter: normalized.receiptFooter,
          receiptHeader: normalized.receiptHeader,
          receiptPrefix: normalized.receiptPrefix,
          requireCashShiftBeforeSale: normalized.requireCashShiftBeforeSale,
          roundingMethod: normalized.roundingMethod,
          showLogoOnReceipt: normalized.showLogoOnReceipt,
          showTaxOnReceipt: normalized.showTaxOnReceipt,
          taxInclusive: normalized.taxInclusive,
          taxNumber: normalized.taxNumber,
          unitPricingDefaults: nextDefaults,
          vatEnabled: normalized.vatEnabled,
          vatRate: normalized.vatRate,
        },
        where: { companyId: company.id },
      });

      const updatedCompany = await tx.company.findUniqueOrThrow({
        include: { settings: true },
        where: { id: company.id },
      });

      const persistedFlag = updatedCompany.settings?.requireCashShiftBeforeSale === false
        ? false
        : updatedCompany.settings?.requireCashShiftBeforeSale === true
          ? true
          : requireCashShiftBeforeSaleFromOpsRow(updatedCompany.settings);
      // Fail closed if OFF was requested but JSON still reads as ON (false lost).
      if (persistedFlag !== normalized.requireCashShiftBeforeSale) {
        throw new Error(
          "Failed to persist Require Cash Shift Before Sale. Please try Save Settings again.",
        );
      }

      if (settingsSummary) {
        await recordEssentialActivity(tx, {
          action: "settings.update",
          companyId: tenant.companyId,
          entityId: tenant.companyId,
          entityType: "settings",
          module: "settings",
          summary: settingsSummary,
          userId: tenant.userId,
        });
      }

      return {
        ...mapSettings(updatedCompany),
        requireCashShiftBeforeSale: persistedFlag,
      };
    },
  });
}

function importantSettingsSummary(current: SettingsFormData, next: SettingsFormData) {
  const fields: Array<[keyof SettingsFormData, string]> = [
    ["companyName", "Company"],
    ["profilePhone", "Phone"],
    ["profileAddress", "Address"],
    ["profileEmail", "Email"],
    ["taxNumber", "Tax"],
    ["vatEnabled", "VAT"],
    ["vatRate", "VAT"],
    ["taxInclusive", "Tax"],
    ["receiptHeader", "Receipt"],
    ["receiptFooter", "Receipt"],
    ["receiptPrefix", "Receipt"],
    ["showLogoOnReceipt", "Receipt"],
    ["showTaxOnReceipt", "Receipt"],
    ["requireCashShiftBeforeSale", "Cash shift"],
    ["baseCurrency", "Currency"],
    ["currencyDisplay", "Currency"],
  ];
  const labels = new Set<string>();
  for (const [key, label] of fields) {
    if (String(current[key] ?? "") !== String(next[key] ?? "")) labels.add(label);
  }
  return [...labels].join(", ");
}

async function assertCompanyMember(tenant: TenantContext) {
  const company = await db.company.findFirst({
    where: {
      id: tenant.companyId,
      members: { some: { status: "active", userId: tenant.userId } },
    },
    select: { id: true },
  });
  if (!company) throw new Error("Company settings not found.");
  return company;
}

export async function replaceCompanyBusinessLogo(bytes: Uint8Array, declaredMime: string | null, tenant: TenantContext) {
  await assertCompanyMember(tenant);
  const existing = await db.companySetting.findUnique({
    select: { logoObjectPath: true },
    where: { companyId: tenant.companyId },
  });
  const path = await storeReplacementLogo({
    bytes,
    companyId: tenant.companyId,
    declaredMime,
    persistPath: async (nextPath) => {
      await db.companySetting.upsert({
        create: { companyId: tenant.companyId, logoObjectPath: nextPath },
        update: { logoObjectPath: nextPath },
        where: { companyId: tenant.companyId },
      });
    },
    previousPath: existing?.logoObjectPath ? String(existing.logoObjectPath) : null,
  });
  return signCompanyLogoUrl(path, tenant.companyId);
}

export async function removeCompanyBusinessLogo(tenant: TenantContext) {
  await assertCompanyMember(tenant);
  await clearStoredLogo({
    clearPath: async () => {
      const existing = await db.companySetting.findUnique({
        select: { logoObjectPath: true },
        where: { companyId: tenant.companyId },
      });
      if (!existing) return null;
      await db.companySetting.update({
        data: { logoObjectPath: null },
        where: { companyId: tenant.companyId },
      });
      return existing.logoObjectPath ? String(existing.logoObjectPath) : null;
    },
    companyId: tenant.companyId,
  });
}

export async function getPrismaTaxAndLoyaltySettings(companyId: string) {
  const company = await db.company.findUnique({
    include: { settings: true },
    where: { id: companyId },
  });

  if (!company) {
    return taxAndLoyaltyFromSettingsRow(null);
  }

  return taxAndLoyaltyFromSettingsRow(company.settings);
}
