import { hash } from "bcryptjs";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantMembership, type TenantMembership } from "@/lib/db/resolve-tenant-user";
import { decideApprovalRequest } from "@/features/approvals/approval-engine";
import {
  APPROVAL_RULE_KEYS,
  APPROVAL_RULE_LABELS,
  LEGACY_PERMISSION_ENTRIES,
  MATRIX_PERMISSION_ENTRIES,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULE_LABELS,
  ROLE_LABEL_BY_TEMPLATE_KEY,
  ROLE_TEMPLATE_LABELS,
  buildDefaultMatrix,
  matrixPermissionKey,
  type PermissionActionLabel,
  type PermissionModuleLabel,
  type RoleTemplateLabel,
} from "@/features/access-control/permission-catalog";
import type {
  ApprovalRuleRecord,
  DecideApprovalInput,
  PendingApprovalRecord,
  PermissionMatrix,
  RoleTemplateRecord,
  SaveApprovalRuleInput,
  SaveRolePermissionsInput,
  SaveStaffMemberInput,
  StaffAccessSnapshot,
  StaffMemberRecord,
} from "@/features/access-control/types";

const db = prisma as any;

function mapTemplateLabel(templateKey: string | null | undefined, roleName: string): RoleTemplateLabel {
  if (templateKey && ROLE_LABEL_BY_TEMPLATE_KEY[templateKey]) {
    return ROLE_LABEL_BY_TEMPLATE_KEY[templateKey];
  }
  const normalized = roleName.toLowerCase();
  if (normalized === "owner") return "Owner";
  if (normalized === "manager") return "Manager";
  if (normalized.includes("cashier") || normalized === "cashier") return "Staff/Cashier";
  return "Custom";
}

function mapStaffMember(row: Record<string, unknown>): StaffMemberRecord {
  const user = row.user as Record<string, unknown>;
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const roleEntry = roles[0] as Record<string, unknown> | undefined;
  const role = roleEntry?.role as Record<string, unknown> | undefined;
  const branch = row.branch as Record<string, unknown> | undefined;

  return {
    allowBackOfficeAccess: Boolean(row.allowBackOfficeAccess ?? true),
    allowPosAccess: Boolean(row.allowPosAccess ?? true),
    assignedTerminal: String(row.assignedTerminal ?? "POS-01"),
    branchId: String(row.branchId ?? ""),
    branchName: String(branch?.name ?? "Unassigned"),
    fullName: String(user?.fullName ?? ""),
    id: String(row.id),
    isOwner: Boolean(row.isOwner),
    requirePasswordChange: Boolean(row.requirePasswordChange ?? false),
    roleId: String(role?.id ?? ""),
    roleName: String(role?.name ?? "Custom"),
    roleTemplate: mapTemplateLabel(role?.templateKey ? String(role.templateKey) : null, String(role?.name ?? "Custom")),
    status: String(row.status ?? "active") === "inactive" ? "inactive" : "active",
    userId: String(user?.id ?? row.userId),
    username: String(user?.username ?? ""),
  };
}

function mapRole(row: Record<string, unknown>): RoleTemplateRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    templateKey: mapTemplateLabel(row.templateKey ? String(row.templateKey) : null, String(row.name)),
  };
}

function mapApprovalRule(row: Record<string, unknown>): ApprovalRuleRecord {
  return {
    approverRole: String(row.approverRole ?? "owner"),
    id: String(row.id),
    isEnabled: Boolean(row.isEnabled ?? true),
    ruleKey: String(row.ruleKey) as ApprovalRuleRecord["ruleKey"],
    thresholdLak: row.thresholdLak == null ? undefined : Number(row.thresholdLak),
    thresholdPercent: row.thresholdPercent == null ? undefined : Number(row.thresholdPercent),
  };
}

function mapPendingApproval(row: Record<string, unknown>): PendingApprovalRecord {
  return {
    action: row.action ? String(row.action) : undefined,
    amount: row.amount == null ? undefined : Number(row.amount),
    approvedBy: row.approvedBy ? String(row.approvedBy) : undefined,
    branchId: row.branchId ? String(row.branchId) : undefined,
    createdAt: new Date(String(row.createdAt)).toISOString(),
    id: String(row.id),
    module: String(row.module ?? ""),
    newValue: row.newValue != null ? JSON.stringify(row.newValue) : undefined,
    oldValue: row.oldValue != null ? JSON.stringify(row.oldValue) : undefined,
    reason: row.reason ? String(row.reason) : row.note ? String(row.note) : undefined,
    requestBy: String(row.requestBy ?? ""),
    requestedByRole: row.requestedByRole ? String(row.requestedByRole) : undefined,
    status: String(row.status ?? "pending"),
  };
}

function buildMatrixFromRolePermissions(
  roles: RoleTemplateRecord[],
  rolePermissions: Array<{ roleId: string; permissionKey: string }>,
): PermissionMatrix {
  const matrix = buildDefaultMatrix();
  const keysByRoleId = new Map<string, Set<string>>();

  for (const entry of rolePermissions) {
    const current = keysByRoleId.get(entry.roleId) ?? new Set<string>();
    current.add(entry.permissionKey);
    keysByRoleId.set(entry.roleId, current);
  }

  for (const role of roles) {
    const granted = keysByRoleId.get(role.id);
    if (!granted || role.templateKey === "Owner") {
      continue;
    }

    for (const moduleLabel of PERMISSION_MODULE_LABELS) {
      for (const actionLabel of PERMISSION_ACTION_LABELS) {
        const key = matrixPermissionKey(moduleLabel, actionLabel);
        matrix[role.templateKey][moduleLabel][actionLabel] = granted.has(key);
      }
    }
  }

  return matrix;
}

export async function getPosPolicyApprovalRules(tenant: TenantContext, client: any = db): Promise<ApprovalRuleRecord[]> {
  const approvalRules = await client.approvalRule.findMany({
    orderBy: { ruleKey: "asc" },
    where: { companyId: tenant.companyId },
  });
  return approvalRules.map(mapApprovalRule);
}

export async function getStaffAccessSnapshot(tenant: TenantContext, client: any = db): Promise<StaffAccessSnapshot> {
  const [branches, roles, staffRows, approvalRules, pendingApprovals, rolePermissionRows] = await Promise.all([
    client.branch.findMany({
      orderBy: [{ isMainBranch: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
      where: { companyId: tenant.companyId },
    }),
    client.role.findMany({
      orderBy: [{ templateKey: "asc" }, { name: "asc" }],
      where: { companyId: tenant.companyId },
    }),
    client.companyUser.findMany({
      include: {
        branch: { select: { id: true, name: true } },
        user: {
          include: {
            roles: {
              include: { role: true },
              where: { companyId: tenant.companyId },
            },
          },
        },
      },
      orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
      where: { companyId: tenant.companyId },
    }),
    client.approvalRule.findMany({
      orderBy: { ruleKey: "asc" },
      where: { companyId: tenant.companyId },
    }),
    client.approval.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      where: { companyId: tenant.companyId, status: "pending" },
    }),
    client.rolePermission.findMany({
      select: {
        permission: { select: { key: true } },
        roleId: true,
      },
      where: {
        role: { companyId: tenant.companyId },
      },
    }),
  ]);

  const mappedRoles = roles.map(mapRole);
  const matrix = buildMatrixFromRolePermissions(
    mappedRoles,
    rolePermissionRows.map((row: Record<string, unknown>) => ({
      permissionKey: String((row.permission as Record<string, unknown>)?.key ?? ""),
      roleId: String(row.roleId),
    })),
  );

  return {
    approvalRules: approvalRules.map(mapApprovalRule),
    branches,
    matrix,
    pendingApprovals: pendingApprovals.map(mapPendingApproval),
    roles: mappedRoles,
    staff: staffRows.map(mapStaffMember),
  };
}

export async function saveStaffMember(input: SaveStaffMemberInput, tenant: TenantContext) {
  const fullName = stringValue(input.fullName).trim();
  const username = stringValue(input.username).trim();
  const branchId = stringValue(input.branchId);
  const roleId = stringValue(input.roleId);

  if (!fullName || !username || !branchId || !roleId) {
    throw new Error("Staff name, username, branch, and role are required.");
  }

  return withTenantTransaction({
    action: input.id ? "update" : "create",
    module: "staff",
    newData: { ...input, password: input.password ? "[redacted]" : undefined },
    tenant,
    write: async (tx) => {
      const branch = await tx.branch.findFirst({
        where: { companyId: tenant.companyId, id: branchId },
      });
      if (!branch) {
        throw new Error("Branch was not found for this company.");
      }

      const role = await tx.role.findFirst({
        where: { companyId: tenant.companyId, id: roleId },
      });
      if (!role) {
        throw new Error("Role was not found for this company.");
      }

      if (input.id) {
        const membership = await tx.companyUser.findFirst({
          include: {
            branch: { select: { id: true, name: true } },
            user: {
              include: {
                roles: {
                  include: { role: true },
                  where: { companyId: tenant.companyId },
                },
              },
            },
          },
          where: { companyId: tenant.companyId, id: input.id },
        });
        if (!membership) {
          throw new Error("Staff member was not found.");
        }
        if (membership.isOwner) {
          throw new Error("Owner membership cannot be edited from staff management.");
        }

        const duplicate = await tx.user.findFirst({
          where: {
            id: { not: membership.userId },
            OR: [{ username }, { email: username }],
          },
        });
        if (duplicate) {
          throw new Error("Username already exists.");
        }

        const userUpdate: Record<string, unknown> = {
          fullName,
          status: input.status,
          username,
        };
        if (input.password?.trim()) {
          userUpdate.passwordHash = await hash(input.password.trim(), 12);
        }

        await tx.user.update({
          data: userUpdate,
          where: { id: membership.userId },
        });

        await tx.companyUser.update({
          data: {
            allowBackOfficeAccess: input.allowBackOfficeAccess,
            allowPosAccess: input.allowPosAccess,
            assignedTerminal: input.assignedTerminal,
            branchId,
            requirePasswordChange: input.requirePasswordChange,
            status: input.status,
          },
          where: { id: membership.id },
        });

        const existingRole = membership.user.roles[0];
        if (!existingRole || existingRole.roleId !== roleId) {
          if (existingRole) {
            await tx.userRole.delete({
              where: {
                userId_roleId: {
                  roleId: existingRole.roleId,
                  userId: membership.userId,
                },
              },
            });
          }
          await tx.userRole.create({
            data: {
              companyId: tenant.companyId,
              roleId,
              userId: membership.userId,
            },
          });
        }

        const refreshed = await tx.companyUser.findFirst({
          include: {
            branch: { select: { id: true, name: true } },
            user: {
              include: {
                roles: {
                  include: { role: true },
                  where: { companyId: tenant.companyId },
                },
              },
            },
          },
          where: { id: membership.id },
        });
        return mapStaffMember(refreshed);
      }

      const duplicate = await tx.user.findFirst({
        where: { OR: [{ username }, { email: username }] },
      });
      if (duplicate) {
        throw new Error("Username already exists.");
      }
      if (!input.password?.trim()) {
        throw new Error("Password is required for new staff.");
      }

      const user = await tx.user.create({
        data: {
          email: `${username}@staff.local`,
          fullName,
          passwordHash: await hash(input.password.trim(), 12),
          preferredLocale: "en",
          status: input.status,
          username,
        },
      });

      const membership = await tx.companyUser.create({
        data: {
          allowBackOfficeAccess: input.allowBackOfficeAccess,
          allowPosAccess: input.allowPosAccess,
          assignedTerminal: input.assignedTerminal,
          branchId,
          companyId: tenant.companyId,
          requirePasswordChange: input.requirePasswordChange,
          status: input.status,
          userId: user.id,
        },
      });

      await tx.userRole.create({
        data: {
          companyId: tenant.companyId,
          roleId,
          userId: user.id,
        },
      });

      const refreshed = await tx.companyUser.findFirst({
        include: {
          branch: { select: { id: true, name: true } },
          user: {
            include: {
              roles: {
                include: { role: true },
                where: { companyId: tenant.companyId },
              },
            },
          },
        },
        where: { id: membership.id },
      });

      return mapStaffMember(refreshed);
    },
  });
}

export async function deactivateStaffMember(membershipId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "archive",
    module: "staff",
    newData: { membershipId },
    tenant,
    write: async (tx) => {
      const membership = await tx.companyUser.findFirst({
        include: {
          branch: { select: { id: true, name: true } },
          user: {
            include: {
              roles: {
                include: { role: true },
                where: { companyId: tenant.companyId },
              },
            },
          },
        },
        where: { companyId: tenant.companyId, id: membershipId },
      });
      if (!membership) {
        throw new Error("Staff member was not found.");
      }
      if (membership.isOwner) {
        throw new Error("Owner cannot be deactivated.");
      }

      await tx.companyUser.update({
        data: { status: "inactive" },
        where: { id: membershipId },
      });
      await tx.user.update({
        data: { status: "inactive" },
        where: { id: membership.userId },
      });

      return mapStaffMember({
        ...membership,
        status: "inactive",
        user: { ...membership.user, status: "inactive" },
      });
    },
  });
}

export async function saveRolePermissions(input: SaveRolePermissionsInput, tenant: TenantContext) {
  return withTenantTransaction({
    action: "update",
    module: "permissions",
    newData: input,
    tenant,
    write: async (tx) => {
      const role = await tx.role.findFirst({
        where: { companyId: tenant.companyId, id: input.roleId },
      });
      if (!role) {
        throw new Error("Role was not found.");
      }
      if (role.templateKey === "owner") {
        throw new Error("Owner permissions cannot be changed.");
      }

      const permissions = await tx.permission.findMany({
        where: { key: { in: input.permissions } },
      });

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: permissions.map((permission: { id: string }) => ({
            permissionId: permission.id,
            roleId: role.id,
          })),
          skipDuplicates: true,
        });
      }

      return { roleId: role.id, permissionCount: permissions.length };
    },
  });
}

export async function saveApprovalRule(input: SaveApprovalRuleInput, tenant: TenantContext) {
  return withTenantTransaction({
    action: "update",
    module: "approvals",
    newData: input,
    tenant,
    write: async (tx) => {
      const row = await tx.approvalRule.upsert({
        create: {
          approverRole: input.approverRole,
          companyId: tenant.companyId,
          isEnabled: input.isEnabled,
          ruleKey: input.ruleKey,
          thresholdLak: input.thresholdLak ?? null,
          thresholdPercent: input.thresholdPercent ?? null,
        },
        update: {
          approverRole: input.approverRole,
          isEnabled: input.isEnabled,
          thresholdLak: input.thresholdLak ?? null,
          thresholdPercent: input.thresholdPercent ?? null,
        },
        where: {
          companyId_ruleKey: {
            companyId: tenant.companyId,
            ruleKey: input.ruleKey,
          },
        },
      });
      return mapApprovalRule(row);
    },
  });
}

export async function decideApproval(input: DecideApprovalInput, tenant: TenantContext) {
  // B8-2: delegate to the hardened approval engine so the decision enforces
  // approver role (owner/manager per ApprovalRule), blocks self-approval and
  // cross-company access, and executes the approved action when an executor is
  // registered for the request type.
  return decideApprovalRequest(input, tenant);
}

async function getUserPermissionKeysUncached(tenant: TenantContext, client: any) {
  let membership: TenantMembership;
  try {
    membership = await resolveTenantMembership(tenant, client);
  } catch {
    return [] as string[];
  }

  if (membership.isOwner) {
    return ["*"];
  }

  const rows = await client.userRole.findMany({
    select: {
      role: {
        select: {
          permissions: {
            select: {
              permission: { select: { key: true } },
            },
          },
        },
      },
    },
    where: {
      companyId: tenant.companyId,
      userId: membership.effectiveUserId,
    },
  });

  return Array.from(
    new Set(
      rows.flatMap((row: Record<string, unknown>) => {
        const role = row.role as Record<string, unknown>;
        const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
        return permissions.map((entry: Record<string, unknown>) =>
          String((entry.permission as Record<string, unknown>)?.key ?? ""),
        );
      }),
    ),
  ).filter(Boolean);
}

const getUserPermissionKeysCached = cache(async (companyId: string, userId: string) =>
  getUserPermissionKeysUncached({ companyId, userId }, db),
);

export async function getUserPermissionKeys(tenant: TenantContext, client: any = db) {
  if (client === db) {
    return getUserPermissionKeysCached(tenant.companyId, tenant.userId);
  }
  return getUserPermissionKeysUncached(tenant, client);
}

export async function ensureAccessControlCatalog(dbClient: any = db) {
  for (const entry of MATRIX_PERMISSION_ENTRIES) {
    await dbClient.permission.upsert({
      create: { key: entry.key, module: entry.module, name: entry.name },
      update: { module: entry.module, name: entry.name },
      where: { key: entry.key },
    });
  }

  for (const [key, name, module] of LEGACY_PERMISSION_ENTRIES) {
    await dbClient.permission.upsert({
      create: { key, module, name },
      update: { module, name },
      where: { key },
    });
  }
}

export async function ensureDefaultApprovalRules(companyId: string, dbClient: any = db) {
  for (const ruleKey of APPROVAL_RULE_KEYS) {
    await dbClient.approvalRule.upsert({
      create: {
        approverRole: "owner",
        companyId,
        isEnabled: true,
        ruleKey,
        thresholdLak: ruleKey === "refund" || ruleKey === "purchasing" ? 100000 : null,
        thresholdPercent: ruleKey === "discount" ? 10 : null,
      },
      update: {},
      where: { companyId_ruleKey: { companyId, ruleKey } },
    });
  }
}

export async function seedRoleTemplatePermissions(
  companyId: string,
  roles: Partial<Record<RoleTemplateLabel, { id: string }>>,
  dbClient: any = db,
  options?: { skipCatalogEnsure?: boolean },
) {
  if (!options?.skipCatalogEnsure) {
    await ensureAccessControlCatalog(dbClient);
  }

  const permissions = await dbClient.permission.findMany();
  const permissionByKey = new Map<string, { id: string }>(
    permissions.map((permission: { id: string; key: string }) => [permission.key, permission]),
  );

  const defaultMatrix = buildDefaultMatrix();

  for (const roleLabel of ROLE_TEMPLATE_LABELS) {
    const role = roles[roleLabel];
    if (!role) continue;

    await dbClient.rolePermission.deleteMany({ where: { roleId: role.id } });

    if (roleLabel === "Owner") {
      await dbClient.rolePermission.createMany({
        data: permissions.map((permission: { id: string }) => ({
          permissionId: permission.id,
          roleId: role.id,
        })),
        skipDuplicates: true,
      });
      continue;
    }

    const keys = PERMISSION_MODULE_LABELS.flatMap((moduleLabel) =>
      PERMISSION_ACTION_LABELS.filter((actionLabel) => defaultMatrix[roleLabel][moduleLabel][actionLabel]).map(
        (actionLabel) => matrixPermissionKey(moduleLabel, actionLabel),
      ),
    );

    const permissionIds = keys
      .map((key) => permissionByKey.get(key)?.id)
      .filter((permissionId): permissionId is string => Boolean(permissionId));

    if (permissionIds.length > 0) {
      await dbClient.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          permissionId,
          roleId: role.id,
        })),
        skipDuplicates: true,
      });
    }
  }
}

export function approvalRuleLabel(ruleKey: string) {
  return APPROVAL_RULE_LABELS[ruleKey as keyof typeof APPROVAL_RULE_LABELS] ?? ruleKey;
}
