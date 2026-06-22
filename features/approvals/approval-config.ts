import type { ApprovalRuleKey } from "@/features/access-control/permission-catalog";
import { WRITE_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";

// Requester must hold the base write permission for the underlying action; the
// approval gate is enforced in addition to (not as a replacement for) module
// permissions. Used by both the server action and the API route.
export const APPROVAL_REQUESTER_PERMISSION: Record<ApprovalRuleKey, PermissionKey> = {
  discount: WRITE_PERMISSIONS.posSell,
  purchasing: WRITE_PERMISSIONS.purchasingCreate,
  refund: WRITE_PERMISSIONS.posSell,
  stock_adjustment: WRITE_PERMISSIONS.inventoryAdjust,
};
