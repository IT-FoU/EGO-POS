import { requireSettingsSectionEdit } from "@/lib/auth/module-access";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import {
  isLoyaltyRuleType,
  legacySpendRule,
  parseLoyaltyRuleConfig,
  validateLoyaltyRuleInput,
  type LoyaltyEarningRuleRecord,
  type LoyaltyRuleConfig,
  type LoyaltyRuleType,
} from "@/features/loyalty/earning-rules";

const RULE_LIMIT = 30;

function mapRule(row: Record<string, any>): LoyaltyEarningRuleRecord {
  return {
    archivedAt: row.archivedAt ? new Date(row.archivedAt).toISOString() : null,
    config: parseLoyaltyRuleConfig(row.config),
    enabled: Boolean(row.enabled),
    id: String(row.id),
    name: String(row.name ?? ""),
    ruleType: row.ruleType,
    sortOrder: Number(row.sortOrder ?? 0),
    status: row.status === "archived" ? "archived" : "active",
  };
}

export async function ensureLegacySpendRule(tx: Record<string, any>, companyId: string, spendLak: number) {
  const existing = await tx.loyaltyEarningRule.findFirst({
    select: { id: true },
    where: { companyId },
  });
  if (existing) return;
  const rule = legacySpendRule(spendLak);
  await tx.loyaltyEarningRule.create({
    data: {
      companyId,
      config: rule.config,
      enabled: true,
      name: rule.name,
      ruleType: "SPEND_AMOUNT",
      sortOrder: 0,
      status: "active",
    },
  });
}

export async function listActiveLoyaltyRules(tx: Record<string, any>, companyId: string, spendLak = 10000) {
  await ensureLegacySpendRule(tx, companyId, spendLak);
  const rows = await tx.loyaltyEarningRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    where: { companyId, enabled: true, status: "active" },
  });
  return rows.map(mapRule);
}

async function mirrorPrimarySpend(tx: Record<string, any>, companyId: string) {
  const rule = await tx.loyaltyEarningRule.findFirst({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    where: { companyId, enabled: true, ruleType: "SPEND_AMOUNT", status: "active" },
  });
  if (!rule) return;
  const spendLak = Math.max(Number(parseLoyaltyRuleConfig(rule.config).spendLak) || 1, 1);
  await tx.companySetting.updateMany({
    data: { loyaltySpendPerPointLak: spendLak },
    where: { companyId },
  });
}

function storedConfig(ruleType: LoyaltyRuleType, config: LoyaltyRuleConfig, legacy = false): LoyaltyRuleConfig {
  const points = Math.max(Math.floor(Number(config.points) || 0), 1);
  if (ruleType === "SPEND_AMOUNT") {
    return { legacy, points, spendLak: Math.max(Number(config.spendLak) || 0, 1) };
  }
  if (ruleType === "ITEM_QUANTITY") {
    return { points, quantity: Math.max(Math.floor(Number(config.quantity) || 0), 1) };
  }
  if (ruleType === "MINIMUM_BASKET") {
    return { points, thresholdLak: Math.max(Number(config.thresholdLak) || 0, 1) };
  }
  if (ruleType === "PRODUCT_BONUS") {
    return { points, productIds: [...new Set((config.productIds ?? []).map(String))] };
  }
  return { categoryIds: [...new Set((config.categoryIds ?? []).map(String))], points };
}

async function assertCatalog(tx: Record<string, any>, companyId: string, ruleType: LoyaltyRuleType, config: LoyaltyRuleConfig) {
  if (ruleType === "PRODUCT_BONUS") {
    const ids = [...new Set((config.productIds ?? []).map(String))];
    const count = await tx.product.count({ where: { companyId, id: { in: ids } } });
    if (count !== ids.length) throw new Error("Select at least one product.");
  }
  if (ruleType === "CATEGORY_BONUS") {
    const ids = [...new Set((config.categoryIds ?? []).map(String))];
    const count = await tx.category.count({ where: { companyId, id: { in: ids } } });
    if (count !== ids.length) throw new Error("Select at least one category.");
  }
}

export async function listLoyaltyEarningRules(tenant: TenantContext) {
  const existing = await prisma.loyaltyEarningRule.count({ where: { companyId: tenant.companyId } });
  if (existing === 0) {
    const settings = await prisma.companySetting.findUnique({
      select: { loyaltySpendPerPointLak: true },
      where: { companyId: tenant.companyId },
    });
    await withTenantTransaction({
      action: "create",
      module: "settings",
      tenant,
      write: async (tx) => {
        await ensureLegacySpendRule(tx, tenant.companyId, Number(settings?.loyaltySpendPerPointLak ?? 10000));
      },
    });
  }
  const rows = await prisma.loyaltyEarningRule.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    where: { companyId: tenant.companyId, status: "active" },
  });
  return rows.map(mapRule);
}

export async function saveLoyaltyEarningRule(
  tenant: TenantContext,
  input: { config: LoyaltyRuleConfig; enabled?: boolean; id?: string; name: string; ruleType: LoyaltyRuleType },
) {
  await requireSettingsSectionEdit(tenant, "loyalty");
  if (!isLoyaltyRuleType(input.ruleType)) throw new Error("Loyalty rule type is not supported.");
  validateLoyaltyRuleInput({ config: input.config, name: input.name, ruleType: input.ruleType });
  return withTenantTransaction({
    action: input.id ? "update" : "create",
    module: "settings",
    newData: { name: input.name, ruleType: input.ruleType },
    tenant,
    write: async (tx) => {
      const config = storedConfig(input.ruleType, input.config);
      await assertCatalog(tx, tenant.companyId, input.ruleType, config);
      if (input.id) {
        const existing = await tx.loyaltyEarningRule.findFirst({
          where: { companyId: tenant.companyId, id: input.id, status: "active" },
        });
        if (!existing) throw new Error("Loyalty rule was not found.");
        if (existing.ruleType !== input.ruleType) throw new Error("Loyalty rule type cannot change.");
        await tx.loyaltyEarningRule.update({
          data: {
            config: { ...config, legacy: parseLoyaltyRuleConfig(existing.config).legacy === true },
            enabled: input.enabled ?? existing.enabled,
            name: input.name.trim(),
          },
          where: { id: existing.id },
        });
      } else {
        const count = await tx.loyaltyEarningRule.count({
          where: { companyId: tenant.companyId, status: "active" },
        });
        if (count >= RULE_LIMIT) throw new Error("Loyalty rule limit reached.");
        const last = await tx.loyaltyEarningRule.findFirst({
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
          where: { companyId: tenant.companyId },
        });
        await tx.loyaltyEarningRule.create({
          data: {
            companyId: tenant.companyId,
            config,
            enabled: input.enabled !== false,
            name: input.name.trim(),
            ruleType: input.ruleType,
            sortOrder: Number(last?.sortOrder ?? 0) + 1,
            status: "active",
          },
        });
      }
      await mirrorPrimarySpend(tx, tenant.companyId);
      const rows = await tx.loyaltyEarningRule.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        where: { companyId: tenant.companyId, status: "active" },
      });
      return rows.map(mapRule);
    },
  });
}

export async function setLoyaltyEarningRuleEnabled(tenant: TenantContext, id: string, enabled: boolean) {
  await requireSettingsSectionEdit(tenant, "loyalty");
  return withTenantTransaction({
    action: "update",
    module: "settings",
    newData: { enabled, id },
    tenant,
    write: async (tx) => {
      const existing = await tx.loyaltyEarningRule.findFirst({
        where: { companyId: tenant.companyId, id, status: "active" },
      });
      if (!existing) throw new Error("Loyalty rule was not found.");
      await tx.loyaltyEarningRule.update({
        data: { enabled },
        where: { id: existing.id },
      });
      await mirrorPrimarySpend(tx, tenant.companyId);
      const rows = await tx.loyaltyEarningRule.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        where: { companyId: tenant.companyId, status: "active" },
      });
      return rows.map(mapRule);
    },
  });
}

export async function archiveLoyaltyEarningRule(tenant: TenantContext, id: string) {
  await requireSettingsSectionEdit(tenant, "loyalty");
  return withTenantTransaction({
    action: "archive",
    module: "settings",
    newData: { id },
    tenant,
    write: async (tx) => {
      const existing = await tx.loyaltyEarningRule.findFirst({
        where: { companyId: tenant.companyId, id, status: "active" },
      });
      if (!existing) throw new Error("Loyalty rule was not found.");
      const remaining = await tx.loyaltyEarningRule.count({
        where: { companyId: tenant.companyId, id: { not: existing.id }, status: "active" },
      });
      if (remaining === 0 && parseLoyaltyRuleConfig(existing.config).legacy) {
        throw new Error("The base spend rule cannot be archived.");
      }
      await tx.loyaltyEarningRule.update({
        data: { archivedAt: new Date(), enabled: false, status: "archived" },
        where: { id: existing.id },
      });
      await mirrorPrimarySpend(tx, tenant.companyId);
      const rows = await tx.loyaltyEarningRule.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        where: { companyId: tenant.companyId, status: "active" },
      });
      return rows.map(mapRule);
    },
  });
}
