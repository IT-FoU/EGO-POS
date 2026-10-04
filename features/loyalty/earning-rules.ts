/**
 * Loyalty V2 earning rules. One evaluator is used by checkout, exchange, and POS preview.
 *
 * V1 behavior:
 * - SPEND_AMOUNT: floor(payable LAK / X) * Y points. Payable is the sale total after discounts and redemption.
 * - ITEM_QUANTITY: every X sold units across the sale earns Y points (repeatable floor multiples).
 *   A sold unit is the quantity on the sale line, not the stock base quantity.
 * - MINIMUM_BASKET: payable reaches X LAK → Y points, once per sale.
 * - PRODUCT_BONUS: Y points per sold unit of a selected product.
 * - CATEGORY_BONUS: Y points per sold unit whose product category is selected.
 * - Enabled active rules STACK. Each rule is applied once.
 * - Loyalty off, or no attached customer, earns 0.
 */

export const LOYALTY_RULE_TYPES = [
  "SPEND_AMOUNT",
  "ITEM_QUANTITY",
  "MINIMUM_BASKET",
  "PRODUCT_BONUS",
  "CATEGORY_BONUS",
] as const;

export type LoyaltyRuleType = (typeof LOYALTY_RULE_TYPES)[number];

export type LoyaltyRuleConfig = {
  categoryIds?: string[];
  legacy?: boolean;
  points?: number;
  productIds?: string[];
  quantity?: number;
  spendLak?: number;
  thresholdLak?: number;
};

export type LoyaltyEarningRuleRecord = {
  archivedAt?: string | null;
  config: LoyaltyRuleConfig;
  enabled: boolean;
  id: string;
  name: string;
  ruleType: LoyaltyRuleType;
  sortOrder: number;
  status: "active" | "archived";
};

export type LoyaltyEarnLine = {
  categoryId?: string | null;
  productId: string;
  quantity: number;
};

export type LoyaltyEarnBreakdown = {
  name: string;
  points: number;
  ruleId: string;
  ruleType: LoyaltyRuleType;
};

export type LoyaltyEarnResult = {
  breakdown: LoyaltyEarnBreakdown[];
  totalPoints: number;
};

function whole(value: unknown) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positive(value: unknown) {
  return Math.max(whole(value), 0);
}

export function isLoyaltyRuleType(value: unknown): value is LoyaltyRuleType {
  return LOYALTY_RULE_TYPES.includes(value as LoyaltyRuleType);
}

export function parseLoyaltyRuleConfig(value: unknown): LoyaltyRuleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const row = value as Record<string, unknown>;
  return {
    categoryIds: Array.isArray(row.categoryIds) ? row.categoryIds.map((id) => String(id)) : undefined,
    legacy: row.legacy === true,
    points: positive(row.points),
    productIds: Array.isArray(row.productIds) ? row.productIds.map((id) => String(id)) : undefined,
    quantity: positive(row.quantity),
    spendLak: Math.max(Number(row.spendLak) || 0, 0),
    thresholdLak: Math.max(Number(row.thresholdLak) || 0, 0),
  };
}

export function pointsForRule(rule: LoyaltyEarningRuleRecord, input: { lines: LoyaltyEarnLine[]; payableLak: number }) {
  const config = rule.config ?? {};
  const points = positive(config.points);
  if (points <= 0) return 0;
  if (rule.ruleType === "SPEND_AMOUNT") {
    const spend = Math.max(Number(config.spendLak) || 0, 1);
    return Math.floor(Math.max(input.payableLak, 0) / spend) * points;
  }
  if (rule.ruleType === "ITEM_QUANTITY") {
    const quantity = Math.max(positive(config.quantity), 1);
    const sold = input.lines.reduce((total, line) => total + Math.max(Number(line.quantity) || 0, 0), 0);
    return Math.floor(sold / quantity) * points;
  }
  if (rule.ruleType === "MINIMUM_BASKET") {
    const threshold = Math.max(Number(config.thresholdLak) || 0, 0);
    return input.payableLak + 1e-9 >= threshold ? points : 0;
  }
  if (rule.ruleType === "PRODUCT_BONUS") {
    const ids = new Set((config.productIds ?? []).map(String));
    const units = input.lines
      .filter((line) => ids.has(String(line.productId)))
      .reduce((total, line) => total + Math.max(Number(line.quantity) || 0, 0), 0);
    return Math.floor(units) * points;
  }
  if (rule.ruleType === "CATEGORY_BONUS") {
    const ids = new Set((config.categoryIds ?? []).map(String));
    const units = input.lines
      .filter((line) => line.categoryId && ids.has(String(line.categoryId)))
      .reduce((total, line) => total + Math.max(Number(line.quantity) || 0, 0), 0);
    return Math.floor(units) * points;
  }
  return 0;
}

export function evaluateLoyaltyEarning(input: {
  enabled: boolean;
  hasCustomer: boolean;
  lines: LoyaltyEarnLine[];
  payableLak: number;
  rules: readonly LoyaltyEarningRuleRecord[];
}): LoyaltyEarnResult {
  if (!input.enabled || !input.hasCustomer) {
    return { breakdown: [], totalPoints: 0 };
  }
  const seen = new Set<string>();
  const breakdown: LoyaltyEarnBreakdown[] = [];
  const rules = [...input.rules]
    .filter((rule) => rule.enabled && rule.status !== "archived")
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  for (const rule of rules) {
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    breakdown.push({
      name: rule.name,
      points: pointsForRule(rule, input),
      ruleId: rule.id,
      ruleType: rule.ruleType,
    });
  }
  return {
    breakdown,
    totalPoints: breakdown.reduce((total, entry) => total + entry.points, 0),
  };
}

export function formatEarnNote(prefix: string, breakdown: readonly LoyaltyEarnBreakdown[]) {
  const parts = breakdown.filter((entry) => entry.points > 0).map((entry) => `${entry.name}:${entry.points}`);
  const note = parts.length > 0 ? `${prefix} [${parts.join(", ")}]` : prefix;
  return note.slice(0, 240);
}

export function legacySpendRule(spendLak: number): LoyaltyEarningRuleRecord {
  return {
    config: { legacy: true, points: 1, spendLak: Math.max(Number(spendLak) || 10000, 1) },
    enabled: true,
    id: "legacy-spend",
    name: "Base spend",
    ruleType: "SPEND_AMOUNT",
    sortOrder: 0,
    status: "active",
  };
}

export function validateLoyaltyRuleInput(input: {
  config: LoyaltyRuleConfig;
  name: string;
  ruleType: LoyaltyRuleType;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Loyalty rule name is required.");
  if (name.length > 80) throw new Error("Loyalty rule name is too long.");
  const points = positive(input.config.points);
  if (points < 1) throw new Error("Loyalty rule points must be at least 1.");
  if (input.ruleType === "SPEND_AMOUNT" && Math.max(Number(input.config.spendLak) || 0, 0) < 1) {
    throw new Error("Spend amount must be at least 1 LAK.");
  }
  if (input.ruleType === "ITEM_QUANTITY" && positive(input.config.quantity) < 1) {
    throw new Error("Item quantity must be at least 1.");
  }
  if (input.ruleType === "MINIMUM_BASKET" && Math.max(Number(input.config.thresholdLak) || 0, 0) < 1) {
    throw new Error("Basket amount must be at least 1 LAK.");
  }
  if (input.ruleType === "PRODUCT_BONUS" && (input.config.productIds ?? []).length === 0) {
    throw new Error("Select at least one product.");
  }
  if (input.ruleType === "CATEGORY_BONUS" && (input.config.categoryIds ?? []).length === 0) {
    throw new Error("Select at least one category.");
  }
}
