"use server";

import { revalidatePath } from "next/cache";
import {
  archiveLoyaltyEarningRule,
  saveLoyaltyEarningRule,
  setLoyaltyEarningRuleEnabled,
} from "@/features/loyalty/earning-rule-repository";
import type { LoyaltyRuleConfig, LoyaltyRuleType } from "@/features/loyalty/earning-rules";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess } from "@/lib/db/write-context";

function refreshLoyalty() {
  revalidatePath("/settings/loyalty");
  revalidatePath("/pos");
}

export async function saveLoyaltyEarningRuleAction(input: {
  config: LoyaltyRuleConfig;
  enabled?: boolean;
  id?: string;
  name: string;
  ruleType: LoyaltyRuleType;
}) {
  try {
    const tenant = tenantFromSession(await requireSession());
    const rules = await saveLoyaltyEarningRule(tenant, input);
    refreshLoyalty();
    return writeSuccess(rules);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function setLoyaltyEarningRuleEnabledAction(id: string, enabled: boolean) {
  try {
    const tenant = tenantFromSession(await requireSession());
    const rules = await setLoyaltyEarningRuleEnabled(tenant, id, enabled);
    refreshLoyalty();
    return writeSuccess(rules);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function archiveLoyaltyEarningRuleAction(id: string) {
  try {
    const tenant = tenantFromSession(await requireSession());
    const rules = await archiveLoyaltyEarningRule(tenant, id);
    refreshLoyalty();
    return writeSuccess(rules);
  } catch (error) {
    return writeFailure(error);
  }
}
