import { compare } from "bcryptjs";
import type { Session } from "next-auth";

import { createStoreActivityLog } from "@/features/audit/audit-log-service";
import { auditStoreAccessDenied } from "@/features/permissions/denied-audit";
import {
  STORE_ACTIONS,
  STORE_ROLES,
  canPerformStoreAction,
  normalizeStoreRole,
  type CurrentStoreUser,
  type StoreAction,
  type StoreRoleId,
} from "@/features/permissions/store-permissions";
import { PermissionMatrixDeniedError, type PermissionContext } from "@/features/permissions/platform-permissions";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { currentStoreUserFromSession, requireStoreActionPermissions } from "@/lib/auth/store-permission-guard";

const db = prisma as any;

export const STORE_MANAGER_APPROVAL_BODY_KEY = "__storeManagerPinApproval";

export type StoreManagerPinApprovalBody = {
  approverIdentifier?: unknown;
  managerPin?: unknown;
  pin?: unknown;
  reason?: unknown;
};

export type StoreManagerPinApprovalResult = {
  approvedById: string;
  approvedByName: string;
  approvedByRole: StoreRoleId;
  reason: string;
  requestedBy: CurrentStoreUser;
};

type ApproverCandidate = {
  companies?: Array<{ isOwner?: boolean | null; status?: string | null }>;
  email?: string | null;
  fullName?: string | null;
  id: string;
  pinHash?: string | null;
  roles?: Array<{ role?: { name?: string | null; templateKey?: string | null } | null }>;
  username?: string | null;
};

const managerPinApprovalActions = new Set<StoreAction>([
  STORE_ACTIONS.PAYMENT_REFUND,
  STORE_ACTIONS.PROMOTION_REVERSE,
  STORE_ACTIONS.SALE_REFUND,
  STORE_ACTIONS.SALE_VOID,
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function selectedPin(body: StoreManagerPinApprovalBody | null | undefined) {
  return clean(body?.managerPin) || clean(body?.pin);
}

function selectedReason(body: StoreManagerPinApprovalBody | null | undefined) {
  return clean(body?.reason);
}

function selectedIdentifier(body: StoreManagerPinApprovalBody | null | undefined) {
  return clean(body?.approverIdentifier);
}

export function isManagerPinApprovalEligible(actions: StoreAction[]) {
  if (actions.length === 0 || actions.some((action) => !managerPinApprovalActions.has(action))) {
    return false;
  }

  const requested = new Set(actions);
  return requested.has(STORE_ACTIONS.SALE_REFUND) || requested.has(STORE_ACTIONS.SALE_VOID);
}

function approverRole(candidate: ApproverCandidate): StoreRoleId {
  if (candidate.companies?.some((membership) => membership.isOwner && membership.status === "active")) {
    return STORE_ROLES.OWNER;
  }

  const roleNames = (candidate.roles ?? [])
    .map((entry) => String(entry.role?.templateKey ?? entry.role?.name ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (roleNames.includes(STORE_ROLES.OWNER)) return STORE_ROLES.OWNER;
  if (roleNames.includes(STORE_ROLES.MANAGER)) return STORE_ROLES.MANAGER;
  return STORE_ROLES.CASHIER;
}

async function findApproverCandidate(input: {
  actions: StoreAction[];
  approval: StoreManagerPinApprovalBody;
  currentStoreUser: CurrentStoreUser;
  tenant: TenantContext;
}) {
  const pin = selectedPin(input.approval);
  const identifier = selectedIdentifier(input.approval);

  const candidates = (await db.user.findMany({
    select: {
      companies: {
        select: { isOwner: true, status: true },
        where: { companyId: input.tenant.companyId },
      },
      email: true,
      fullName: true,
      id: true,
      pinHash: true,
      roles: {
        select: { role: { select: { name: true, templateKey: true } } },
        where: {
          OR: [{ companyId: input.tenant.companyId }, { companyId: null }],
        },
      },
      username: true,
    },
    where: {
      ...(identifier
        ? {
            OR: [
              { email: identifier },
              { phone: identifier },
              { username: identifier },
              { username: identifier.toLowerCase() },
            ],
          }
        : {}),
      companies: {
        some: {
          allowPosAccess: true,
          companyId: input.tenant.companyId,
          status: "active",
        },
      },
      pinHash: { not: null },
      status: "active",
    },
  })) as ApproverCandidate[];

  for (const candidate of candidates) {
    const role = approverRole(candidate);
    if (!input.actions.every((action) => canPerformStoreAction({ role }, action))) {
      continue;
    }
    if (candidate.id === input.currentStoreUser.id) {
      continue;
    }
    if (candidate.pinHash && (await compare(pin, candidate.pinHash))) {
      return { candidate, role };
    }
  }

  return null;
}

async function auditApprovalDenied(
  currentStoreUser: CurrentStoreUser,
  action: StoreAction,
  context: PermissionContext,
  reason: string,
) {
  await auditStoreAccessDenied(currentStoreUser, action, {
    ...context,
    reason,
    requiredPermission: context.requiredPermission ?? action,
  });
}

export function managerApprovalMetadata(approval: StoreManagerPinApprovalResult, actions: StoreAction[]) {
  return {
    approval_method: "manager_pin",
    approved_by_role: approval.approvedByRole,
    approved_by_user_id: approval.approvedById,
    approved_by_user_name: approval.approvedByName,
    attempted_actions: actions,
    reason: approval.reason,
    requested_by_role: approval.requestedBy.role,
    requested_by_user_id: approval.requestedBy.id ?? null,
    requested_by_user_name: approval.requestedBy.name,
  };
}

export async function requireStoreActionPermissionsOrManagerPinApproval({
  actions,
  approval,
  context = {},
  session,
  tenant,
}: {
  actions: StoreAction[];
  approval?: StoreManagerPinApprovalBody | null;
  context?: PermissionContext;
  session: Session;
  tenant: TenantContext;
}): Promise<StoreManagerPinApprovalResult | null> {
  const currentStoreUser = currentStoreUserFromSession(session, tenant);
  const directAllowed = actions.every((action) => canPerformStoreAction(currentStoreUser, action, context));
  if (directAllowed) {
    return null;
  }

  const firstDeniedAction = actions.find((action) => !canPerformStoreAction(currentStoreUser, action, context)) ?? actions[0];
  const role = normalizeStoreRole(currentStoreUser.role);

  if (role !== STORE_ROLES.CASHIER || !isManagerPinApprovalEligible(actions)) {
    await requireStoreActionPermissions({ actions, context, session, tenant });
    return null;
  }

  const pin = selectedPin(approval);
  const reason = selectedReason(approval);

  if (!pin || !reason) {
    await auditApprovalDenied(currentStoreUser, firstDeniedAction, context, "Manager PIN and approval reason are required.");
    throw new PermissionMatrixDeniedError(currentStoreUser.role, firstDeniedAction);
  }

  const approver = await findApproverCandidate({
    actions,
    approval: approval ?? {},
    currentStoreUser,
    tenant,
  });

  if (!approver) {
    await auditApprovalDenied(currentStoreUser, firstDeniedAction, context, "Manager PIN approval failed.");
    throw new PermissionMatrixDeniedError(currentStoreUser.role, firstDeniedAction);
  }

  return {
    approvedById: approver.candidate.id,
    approvedByName: approver.candidate.fullName ?? approver.candidate.username ?? "Manager",
    approvedByRole: approver.role,
    reason,
    requestedBy: currentStoreUser,
  };
}

export async function auditStoreManagerPinApproval(input: {
  actions: StoreAction[];
  approval: StoreManagerPinApprovalResult;
  context?: PermissionContext;
}) {
  try {
    await createStoreActivityLog({
      action: input.actions[0] ?? STORE_ACTIONS.SALE_REFUND,
      actorId: input.approval.requestedBy.id ?? null,
      actorName: input.approval.requestedBy.name,
      actorRole: input.approval.requestedBy.role,
      branchId: input.approval.requestedBy.branchId ?? null,
      businessId: input.approval.requestedBy.businessId,
      metadata: {
        ...managerApprovalMetadata(input.approval, input.actions),
        route: input.context?.route,
      },
      status: "success",
      targetId: input.context?.targetId ?? null,
      targetName: "Manager PIN approval",
      targetType: input.context?.targetType ?? "sale",
    });
  } catch (error) {
    console.warn("[permission-audit] store manager PIN approval audit write failed", error);
  }
}
