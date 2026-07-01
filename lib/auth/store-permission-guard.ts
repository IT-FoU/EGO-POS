import type { Session } from "next-auth";

import { auditStoreAccessDenied } from "@/features/permissions/denied-audit";
import {
  STORE_ACTIONS,
  STORE_ROLES,
  canPerformStoreAction,
  type CurrentStoreUser,
  type StoreAction,
} from "@/features/permissions/store-permissions";
import { PermissionMatrixDeniedError, type PermissionContext } from "@/features/permissions/platform-permissions";
import type { TenantContext } from "@/lib/db/write-context";

function storeRoleFromSession(roles: unknown) {
  const normalizedRoles = Array.isArray(roles)
    ? roles.map((role) => String(role).trim().toLowerCase())
    : [];

  if (normalizedRoles.includes(STORE_ROLES.OWNER)) return STORE_ROLES.OWNER;
  if (normalizedRoles.includes(STORE_ROLES.MANAGER)) return STORE_ROLES.MANAGER;
  if (normalizedRoles.includes(STORE_ROLES.CASHIER)) return STORE_ROLES.CASHIER;
  return STORE_ROLES.CASHIER;
}

export function currentStoreUserFromSession(session: Session, tenant: TenantContext): CurrentStoreUser {
  const user = session.user as Session["user"] & {
    activeBranchId?: string | null;
    activeCompanyId?: string | null;
    email?: string | null;
    id?: string | null;
    name?: string | null;
    roles?: unknown;
    username?: string | null;
  };

  return {
    branchId: tenant.branchId ?? user.activeBranchId ?? null,
    businessId: tenant.companyId,
    id: tenant.userId ?? user.id ?? null,
    name: user.name ?? user.username ?? user.email ?? "Store user",
    role: storeRoleFromSession(user.roles),
  };
}

export async function requireStoreActionPermission({
  action,
  context = {},
  session,
  tenant,
}: {
  action: StoreAction;
  context?: PermissionContext;
  session: Session;
  tenant: TenantContext;
}) {
  const currentStoreUser = currentStoreUserFromSession(session, tenant);

  if (canPerformStoreAction(currentStoreUser, action, context)) {
    return currentStoreUser;
  }

  await auditStoreAccessDenied(currentStoreUser, action, {
    ...context,
    businessId: tenant.companyId,
    requiredPermission: context.requiredPermission ?? action,
  });

  // TODO Phase 3.2+: cashier void/refund and other restricted actions should support owner/manager approval or PIN override.
  throw new PermissionMatrixDeniedError(currentStoreUser.role, action);
}

export async function requireStoreActionPermissions({
  actions,
  context = {},
  session,
  tenant,
}: {
  actions: StoreAction[];
  context?: PermissionContext;
  session: Session;
  tenant: TenantContext;
}) {
  for (const action of actions) {
    await requireStoreActionPermission({ action, context, session, tenant });
  }
}

export function productMutationActionsFromBody(body: Record<string, unknown>): StoreAction[] {
  const actions: StoreAction[] = [STORE_ACTIONS.PRODUCT_UPDATE];
  const priceFields = ["costPrice", "costPriceLak", "price", "priceTiers", "sellingPrice", "sellingPriceLak", "unitPrice"];
  if (priceFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    actions.push(STORE_ACTIONS.PRODUCT_PRICE_CHANGE);
  }
  return actions;
}

export function customerMutationActionsFromBody(body: Record<string, unknown>): StoreAction[] {
  const actions: StoreAction[] = [STORE_ACTIONS.CUSTOMER_UPDATE];
  const creditFields = ["creditLimit", "creditLimitLak", "creditBalance", "pointsDelta"];
  if (creditFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    actions.push(STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE);
  }
  return actions;
}
