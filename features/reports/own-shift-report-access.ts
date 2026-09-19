import {
  STORE_ACTIONS,
  hasStorePermission,
  type StoreRoleId,
} from "@/features/permissions/store-permissions";

/** Own-shift endpoint access: Cashier own-shift OR Manager/Owner full reports. */
export function canAccessOwnShiftReport(role: string | null | undefined) {
  return (
    hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT) ||
    hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL)
  );
}

/** Branch session list / other-cashier detail: requires reports.view_full. */
export function canViewBranchShiftReports(role: string | null | undefined) {
  return hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
}

export type OwnShiftAccess = {
  canAccess: boolean;
  canViewBranch: boolean;
  role: StoreRoleId | string;
};

/** STEP 9: void cash is now properly derived and subtracted from expected drawer cash. */
export const OWN_SHIFT_VOID_CASH_LIMITATION = "";
