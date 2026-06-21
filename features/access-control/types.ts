import type {
  ApprovalRuleKey,
  PermissionActionLabel,
  PermissionModuleLabel,
  RoleTemplateLabel,
} from "@/features/access-control/permission-catalog";

export type BranchOption = {
  id: string;
  name: string;
};

export type StaffMemberRecord = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  assignedTerminal: string;
  branchId: string;
  branchName: string;
  fullName: string;
  id: string;
  isOwner: boolean;
  requirePasswordChange: boolean;
  roleId: string;
  roleName: string;
  roleTemplate: RoleTemplateLabel;
  status: "active" | "inactive";
  userId: string;
  username: string;
};

export type RoleTemplateRecord = {
  id: string;
  name: string;
  templateKey: RoleTemplateLabel;
};

export type PermissionMatrix = Record<
  RoleTemplateLabel,
  Record<PermissionModuleLabel, Record<PermissionActionLabel, boolean>>
>;

export type ApprovalRuleRecord = {
  approverRole: string;
  id: string;
  isEnabled: boolean;
  ruleKey: ApprovalRuleKey;
  thresholdLak?: number;
  thresholdPercent?: number;
};

export type PendingApprovalRecord = {
  action?: string;
  amount?: number;
  approvedBy?: string;
  branchId?: string;
  createdAt: string;
  id: string;
  module: string;
  newValue?: string;
  oldValue?: string;
  reason?: string;
  requestBy: string;
  requestedByRole?: string;
  status: string;
};

export type StaffAccessSnapshot = {
  approvalRules: ApprovalRuleRecord[];
  branches: BranchOption[];
  matrix: PermissionMatrix;
  pendingApprovals: PendingApprovalRecord[];
  roles: RoleTemplateRecord[];
  staff: StaffMemberRecord[];
};

export type SaveStaffMemberInput = {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  assignedTerminal: string;
  branchId: string;
  fullName: string;
  id?: string;
  password?: string;
  requirePasswordChange: boolean;
  roleId: string;
  status: "active" | "inactive";
  username: string;
};

export type SaveRolePermissionsInput = {
  permissions: string[];
  roleId: string;
};

export type SaveApprovalRuleInput = {
  approverRole: string;
  isEnabled: boolean;
  ruleKey: ApprovalRuleKey;
  thresholdLak?: number;
  thresholdPercent?: number;
};

export type DecideApprovalInput = {
  approvalId: string;
  decisionNote?: string;
  status: "approved" | "rejected";
};
