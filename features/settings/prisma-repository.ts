import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import type { SettingsFormData } from "@/features/settings/types";
import { isDemoMode } from "@/lib/demo-mode";

const db = prisma as any;

const DEFAULT_SETTINGS = {
  baseCurrency: "LAK" as const,
  currencyDisplay: "LAK",
  decimalPlaces: 0,
  loyaltyEnabled: true,
  loyaltyMinRedeemPoints: 1,
  loyaltyPointValueLak: 1000,
  loyaltySpendPerPointLak: 10000,
  receiptPrefix: "INV",
  receiptPrintMode: "ask_every_time" as const,
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

function normalizeSettingsInput(input: Partial<SettingsFormData>): SettingsFormData {
  const vatRate = Math.min(Math.max(numberValue(input.vatRate), 0), 100);
  const decimalPlaces = Math.min(Math.max(Math.floor(numberValue(input.decimalPlaces)), 0), 4);
  const loyaltySpendPerPointLak = Math.max(numberValue(input.loyaltySpendPerPointLak, DEFAULT_SETTINGS.loyaltySpendPerPointLak), 1);
  const loyaltyPointValueLak = Math.max(numberValue(input.loyaltyPointValueLak, DEFAULT_SETTINGS.loyaltyPointValueLak), 0);
  const loyaltyMinRedeemPoints = Math.max(Math.floor(numberValue(input.loyaltyMinRedeemPoints, DEFAULT_SETTINGS.loyaltyMinRedeemPoints)), 1);

  return {
    baseCurrency: normalizeCurrency(input.baseCurrency),
    companyName: stringValue(input.companyName),
    currencyDisplay: stringValue(input.currencyDisplay, DEFAULT_SETTINGS.currencyDisplay),
    decimalPlaces,
    loyaltyEnabled: Boolean(input.loyaltyEnabled),
    loyaltyMinRedeemPoints,
    loyaltyPointValueLak,
    loyaltySpendPerPointLak,
    profileAddress: optionalString(input.profileAddress),
    profileEmail: optionalString(input.profileEmail),
    profilePhone: optionalString(input.profilePhone),
    receiptFooter: optionalString(input.receiptFooter),
    receiptHeader: optionalString(input.receiptHeader),
    receiptPrintMode: ["ask_every_time", "auto_print", "no_auto_print"].includes(String(input.receiptPrintMode))
      ? (String(input.receiptPrintMode) as SettingsFormData["receiptPrintMode"])
      : DEFAULT_SETTINGS.receiptPrintMode,
    receiptPrefix: stringValue(input.receiptPrefix, DEFAULT_SETTINGS.receiptPrefix),
    roundingMethod: ["down", "nearest", "up"].includes(String(input.roundingMethod)) ? String(input.roundingMethod) : DEFAULT_SETTINGS.roundingMethod,
    showLogoOnReceipt: Boolean(input.showLogoOnReceipt),
    showTaxOnReceipt: Boolean(input.showTaxOnReceipt),
    taxInclusive: Boolean(input.taxInclusive),
    taxNumber: optionalString(input.taxNumber),
    vatEnabled: Boolean(input.vatEnabled),
    vatRate,
  };
}

function mapSettings(company: SettingsRow): SettingsFormData {
  const settings = company.settings ?? {};

  return {
    baseCurrency: normalizeCurrency(settings.baseCurrency ?? company.baseCurrency),
    companyName: company.name ?? "",
    currencyDisplay: settings.currencyDisplay ?? DEFAULT_SETTINGS.currencyDisplay,
    decimalPlaces: toNumber(settings.decimalPlaces, DEFAULT_SETTINGS.decimalPlaces),
    loyaltyEnabled: settings.loyaltyEnabled ?? DEFAULT_SETTINGS.loyaltyEnabled,
    loyaltyMinRedeemPoints: toNumber(settings.loyaltyMinRedeemPoints, DEFAULT_SETTINGS.loyaltyMinRedeemPoints),
    loyaltyPointValueLak: toNumber(settings.loyaltyPointValueLak, DEFAULT_SETTINGS.loyaltyPointValueLak),
    loyaltySpendPerPointLak: toNumber(settings.loyaltySpendPerPointLak, DEFAULT_SETTINGS.loyaltySpendPerPointLak),
    profileAddress: settings.profileAddress ?? undefined,
    profileEmail: settings.profileEmail ?? undefined,
    profilePhone: settings.profilePhone ?? undefined,
    receiptFooter: settings.receiptFooter ?? undefined,
    receiptHeader: settings.receiptHeader ?? undefined,
    receiptPrintMode: settings.receiptPrintMode ?? DEFAULT_SETTINGS.receiptPrintMode,
    receiptPrefix: settings.receiptPrefix ?? DEFAULT_SETTINGS.receiptPrefix,
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
    if (isDemoMode()) {
      return mapSettings({
        baseCurrency: DEFAULT_SETTINGS.baseCurrency,
        name: "GO BOX",
        settings: DEFAULT_SETTINGS,
      });
    }

    throw new Error("Company settings not found.");
  }

  return mapSettings(company);
}

export async function updatePrismaSettings(input: Partial<SettingsFormData>, tenant: TenantContext) {
  const normalized = normalizeSettingsInput(input);

  if (!normalized.companyName) {
    throw new Error("Company name is required.");
  }

  return withTenantTransaction({
    action: "update",
    module: "settings",
    newData: normalized,
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

      await tx.companySetting.upsert({
        create: {
          baseCurrency: normalized.baseCurrency,
          companyId: company.id,
          currencyDisplay: normalized.currencyDisplay,
          decimalPlaces: normalized.decimalPlaces,
          loyaltyEnabled: normalized.loyaltyEnabled,
          loyaltyMinRedeemPoints: normalized.loyaltyMinRedeemPoints,
          loyaltyPointValueLak: normalized.loyaltyPointValueLak,
          loyaltySpendPerPointLak: normalized.loyaltySpendPerPointLak,
          profileAddress: normalized.profileAddress,
          profileEmail: normalized.profileEmail,
          profilePhone: normalized.profilePhone,
          receiptFooter: normalized.receiptFooter,
          receiptHeader: normalized.receiptHeader,
          receiptPrefix: normalized.receiptPrefix,
          roundingMethod: normalized.roundingMethod,
          showLogoOnReceipt: normalized.showLogoOnReceipt,
          showTaxOnReceipt: normalized.showTaxOnReceipt,
          taxInclusive: normalized.taxInclusive,
          taxNumber: normalized.taxNumber,
          vatEnabled: normalized.vatEnabled,
          vatRate: normalized.vatRate,
        },
        update: {
          baseCurrency: normalized.baseCurrency,
          currencyDisplay: normalized.currencyDisplay,
          decimalPlaces: normalized.decimalPlaces,
          loyaltyEnabled: normalized.loyaltyEnabled,
          loyaltyMinRedeemPoints: normalized.loyaltyMinRedeemPoints,
          loyaltyPointValueLak: normalized.loyaltyPointValueLak,
          loyaltySpendPerPointLak: normalized.loyaltySpendPerPointLak,
          profileAddress: normalized.profileAddress,
          profileEmail: normalized.profileEmail,
          profilePhone: normalized.profilePhone,
          receiptFooter: normalized.receiptFooter,
          receiptHeader: normalized.receiptHeader,
          receiptPrefix: normalized.receiptPrefix,
          roundingMethod: normalized.roundingMethod,
          showLogoOnReceipt: normalized.showLogoOnReceipt,
          showTaxOnReceipt: normalized.showTaxOnReceipt,
          taxInclusive: normalized.taxInclusive,
          taxNumber: normalized.taxNumber,
          vatEnabled: normalized.vatEnabled,
          vatRate: normalized.vatRate,
        },
        where: { companyId: company.id },
      });

      const updatedCompany = await tx.company.findUniqueOrThrow({
        include: { settings: true },
        where: { id: company.id },
      });

      return mapSettings(updatedCompany);
    },
  });
}

export async function getPrismaTaxAndLoyaltySettings(companyId: string) {
  const company = await db.company.findUnique({
    include: { settings: true },
    where: { id: companyId },
  });

  if (!company) {
    return DEFAULT_SETTINGS;
  }

  const settings = mapSettings(company);

  return {
    loyaltyEnabled: settings.loyaltyEnabled,
    loyaltyMinRedeemPoints: settings.loyaltyMinRedeemPoints,
    loyaltyPointValueLak: settings.loyaltyPointValueLak,
    loyaltySpendPerPointLak: settings.loyaltySpendPerPointLak,
    taxInclusive: settings.taxInclusive,
    vatEnabled: settings.vatEnabled,
    vatRate: settings.vatRate,
  };
}
