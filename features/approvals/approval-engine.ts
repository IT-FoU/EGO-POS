import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";
import { applyAtomicStockDelta } from "@/features/inventory/stock-concurrency";
import type { ApprovalRuleKey } from "@/features/access-control/permission-catalog";
import type {
  ApprovalRecord,
  ApprovalRoleTemplate,
  CreateApprovalRequestInput,
} from "@/features/approvals/types";

export type DecideApprovalRequestInput = {
  approvalId: string;
  decisionNote?: string;
  status: "approved" | "rejected";
};

type UserAccess = {
  isOwner: boolean;
  roleTemplate: ApprovalRoleTemplate;
};

// Resolve the acting user's role template + ownership inside the transaction so
// approver/requester role rules are enforced against live DB state (never trusted
// from the client). Returns null when the user is not an active member of the company.
async function resolveUserAccess(tx: any, companyId: string, userId: string): Promise<UserAccess | null> {
  const membership = await tx.companyUser.findFirst({
    select: { isOwner: true },
    where: { companyId, status: "active", userId },
  });
  if (!membership) {
    return null;
  }
  if (membership.isOwner) {
    return { isOwner: true, roleTemplate: "owner" };
  }

  const roles = await tx.userRole.findMany({
    select: { role: { select: { templateKey: true } } },
    where: { companyId, userId },
  });
  const templates = roles.map((entry: Record<string, any>) => String(entry.role?.templateKey ?? "").toLowerCase());
  const roleTemplate: ApprovalRoleTemplate = templates.includes("owner")
    ? "owner"
    : templates.includes("manager")
      ? "manager"
      : templates.includes("cashier")
        ? "cashier"
        : "custom";
  return { isOwner: false, roleTemplate };
}

// Which role templates may approve, given the configured approverRole on the rule.
// "manager" rules also allow owners; "owner" rules are owner-only. Cashier/custom
// are never allowed to approve.
function approverTemplatesFor(approverRole: string): ApprovalRoleTemplate[] {
  return approverRole.toLowerCase() === "manager" ? ["owner", "manager"] : ["owner"];
}

// Evaluate whether an action requires approval per the company's ApprovalRule.
// Disabled rule => not required. Percent rules compare discountPercent; amount
// rules compare amountLak. Missing threshold on an enabled rule => always required.
export function evaluateApprovalRequirement(
  rule: { isEnabled?: boolean; thresholdLak?: unknown; thresholdPercent?: unknown } | null | undefined,
  context: { amountLak?: number; discountPercent?: number },
): boolean {
  if (!rule || rule.isEnabled === false) {
    return false;
  }
  const thresholdPercent = rule.thresholdPercent == null ? null : numberValue(rule.thresholdPercent);
  const thresholdLak = rule.thresholdLak == null ? null : numberValue(rule.thresholdLak);

  if (thresholdPercent != null && context.discountPercent != null) {
    return numberValue(context.discountPercent) > thresholdPercent;
  }
  if (thresholdLak != null && context.amountLak != null) {
    return numberValue(context.amountLak) >= thresholdLak;
  }
  return true;
}

function mapApproval(row: Record<string, any>, extra: { executed?: boolean; executionDetail?: string } = {}): ApprovalRecord {
  return {
    action: row.action ? String(row.action) : undefined,
    amount: row.amount == null ? undefined : Number(row.amount),
    approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
    branchId: row.branchId ? String(row.branchId) : undefined,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    decidedAt: row.decidedAt ? new Date(String(row.decidedAt)).toISOString() : undefined,
    decisionNote: row.decisionNote ? String(row.decisionNote) : undefined,
    executed: extra.executed,
    executionDetail: extra.executionDetail,
    id: String(row.id),
    module: String(row.module ?? ""),
    newValue: row.newValue != null ? JSON.stringify(row.newValue) : undefined,
    oldValue: row.oldValue != null ? JSON.stringify(row.oldValue) : undefined,
    reason: row.reason ? String(row.reason) : row.note ? String(row.note) : undefined,
    requestBy: String(row.requestBy ?? ""),
    requestedByRole: row.requestedByRole ? String(row.requestedByRole) : undefined,
    requestType: row.requestType ? String(row.requestType) : undefined,
    status: String(row.status ?? "pending"),
  };
}

export async function createApprovalRequest(input: CreateApprovalRequestInput, tenant: TenantContext): Promise<ApprovalRecord> {
  const referenceId = String(input.referenceId ?? "").trim();
  if (!referenceId) {
    throw new Error("An approval request requires a reference id.");
  }
  const ruleKey = input.ruleKey;
  const amountLak = input.amountLak == null ? null : numberValue(input.amountLak);
  if (amountLak != null && amountLak < 0) {
    throw new Error("Approval amount cannot be negative.");
  }

  return withTenantTransaction({
    action: "create",
    module: "approvals",
    newData: input,
    tenant,
    write: async (tx) => {
      const requester = await resolveUserAccess(tx, tenant.companyId, tenant.userId);
      if (!requester) {
        throw new Error("Requesting user is not an active member of the company.");
      }

      const branchId = input.branchId ?? tenant.branchId ?? null;
      if (branchId) {
        const branch = await tx.branch.findFirst({ select: { id: true }, where: { companyId: tenant.companyId, id: branchId } });
        if (!branch) {
          throw new Error("Approval branch is not in the active company scope.");
        }
      }

      const row = await tx.approval.create({
        data: {
          action: input.action ?? ruleKey,
          amount: amountLak,
          branchId,
          companyId: tenant.companyId,
          module: input.module,
          newValue: input.payload === undefined ? undefined : JSON.parse(JSON.stringify(input.payload)),
          reason: input.reason ?? null,
          referenceId,
          requestBy: tenant.userId,
          requestedByRole: requester.roleTemplate,
          requestType: ruleKey,
          status: "pending",
        },
      });
      return mapApproval(row);
    },
  });
}

export async function decideApprovalRequest(input: DecideApprovalRequestInput, tenant: TenantContext): Promise<ApprovalRecord> {
  if (input.status !== "approved" && input.status !== "rejected") {
    throw new Error("Approval decision must be either approved or rejected.");
  }

  return withTenantTransaction({
    action: input.status,
    module: "approvals",
    newData: input,
    tenant,
    write: async (tx) => {
      // Cross-company isolation: an approval from another company is simply not found.
      const approval = await tx.approval.findFirst({
        where: { companyId: tenant.companyId, id: input.approvalId, status: "pending" },
      });
      if (!approval) {
        throw new Error("Pending approval was not found.");
      }

      // No self-approval: the requester cannot decide their own request.
      if (approval.requestBy === tenant.userId) {
        throw new Error("You cannot approve or reject your own request.");
      }

      const approver = await resolveUserAccess(tx, tenant.companyId, tenant.userId);
      if (!approver) {
        throw new Error("Approving user is not an active member of the company.");
      }

      // Owner/Manager approval rule: the configured approverRole on the rule gates
      // who may decide. Cashier/custom roles are blocked.
      const rule = approval.requestType
        ? await tx.approvalRule.findUnique({ where: { companyId_ruleKey: { companyId: tenant.companyId, ruleKey: approval.requestType } } })
        : null;
      const allowedTemplates = approverTemplatesFor(String(rule?.approverRole ?? "owner"));
      if (!approver.isOwner && !allowedTemplates.includes(approver.roleTemplate)) {
        throw new Error(`This approval requires a ${rule?.approverRole ?? "owner"} approver.`);
      }

      let executed = false;
      let executionDetail: string | undefined;
      if (input.status === "approved") {
        const result = await executeApprovedAction(tx, approval, tenant);
        executed = result.executed;
        executionDetail = result.detail;
      }

      const row = await tx.approval.update({
        data: {
          approvedBy: tenant.userId,
          decidedAt: new Date(),
          decisionNote: input.decisionNote ?? null,
          status: input.status,
        },
        where: { id: approval.id },
      });
      return mapApproval(row, { executed, executionDetail });
    },
  });
}

// Executors perform the real DB mutation for an approved request, keyed by
// requestType. Request types without an executor are authorization-only (their
// originating module performs the effect); they approve without a DB mutation.
type ApprovalExecutor = (tx: any, approval: Record<string, any>, tenant: TenantContext) => Promise<{ detail?: string; executed: boolean }>;

const EXECUTORS: Partial<Record<ApprovalRuleKey, ApprovalExecutor>> = {
  stock_adjustment: executeStockAdjustment,
};

async function executeApprovedAction(tx: any, approval: Record<string, any>, tenant: TenantContext) {
  const requestType = approval.requestType ? String(approval.requestType) : "";
  const executor = EXECUTORS[requestType as ApprovalRuleKey];
  if (!executor) {
    return { detail: `No auto-execution for request type "${requestType}".`, executed: false };
  }
  return executor(tx, approval, tenant);
}

async function executeStockAdjustment(tx: any, approval: Record<string, any>, tenant: TenantContext) {
  const payload = (approval.newValue ?? {}) as Record<string, any>;
  const productId = String(payload.productId ?? "").trim();
  const warehouseId = String(payload.warehouseId ?? "").trim();
  const quantity = numberValue(payload.quantity);
  const adjustmentType = String(payload.adjustmentType ?? "adjustment");

  if (!productId || !warehouseId) {
    throw new Error("Stock adjustment approval is missing product or warehouse.");
  }
  if (!Number.isFinite(quantity) || quantity === 0) {
    throw new Error("Stock adjustment quantity must be a non-zero number.");
  }

  // Scope guard: product + warehouse must belong to the approving company.
  const [product, warehouse] = await Promise.all([
    tx.product.findFirst({ select: { id: true }, where: { companyId: tenant.companyId, id: productId } }),
    tx.warehouse.findFirst({ select: { id: true }, where: { companyId: tenant.companyId, id: warehouseId } }),
  ]);
  if (!product) {
    throw new Error("Stock adjustment product is not in the active company scope.");
  }
  if (!warehouse) {
    throw new Error("Stock adjustment warehouse is not in the active company scope.");
  }

  const balance = await applyAtomicStockDelta(tx, {
    companyId: tenant.companyId,
    productId,
    quantityDelta: quantity,
    warehouseId,
  });

  await tx.stockMovement.create({
    data: {
      afterQty: balance.afterQty,
      beforeQty: balance.beforeQty,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      movementType: "adjustment",
      note: `Approved stock adjustment ${approval.id}`,
      productId,
      quantity,
      referenceId: approval.id,
      referenceType: "approval",
      warehouseId,
    },
  });

  await tx.stockAdjustment.create({
    data: {
      adjustmentType,
      approvedBy: tenant.userId,
      companyId: tenant.companyId,
      createdBy: String(approval.requestBy ?? tenant.userId),
      productId,
      quantity,
      reason: payload.reason ? String(payload.reason) : approval.reason ?? null,
      warehouseId,
    },
  });

  return { detail: `Stock adjusted by ${quantity} (after=${balance.afterQty}).`, executed: true };
}
