"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Download,
  Gauge,
  LayoutDashboard,
  Lock,
  Minus,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Store,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { canViewStoreActivityLogs, getPlatformAuditActionScope } from "@/features/permissions/audit-permission-helpers";
import {
  PLATFORM_ACTIONS,
  PLATFORM_ROLES,
  canPerformPlatformAction,
  normalizePlatformPermissionRole,
  type PlatformAction,
} from "@/features/permissions/platform-permissions";
import { EGO_ADMIN_PROVISIONING_TEMPLATES } from "@/lib/setup-admin/provisioning-templates";
import { LOCALE_CHANGE_EVENT, persistClientLocale, readClientLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

type CenterBusiness = {
  _count?: { branches?: number; members?: number };
  baseCurrency?: string | null;
  branches?: Array<{
    address?: string | null;
    createdAt?: string;
    id?: string;
    isMainBranch?: boolean;
    name?: string | null;
    phone?: string | null;
    updatedAt?: string;
  }>;
  createdAt?: string;
  defaultLocale?: string | null;
  id: string;
  members?: Array<{
    allowBackOfficeAccess?: boolean;
    allowPosAccess?: boolean;
    branchId?: string | null;
    id?: string;
    isOwner?: boolean;
    status?: string | null;
    user?: { email?: string | null; fullName?: string | null; id?: string; phone?: string | null; username?: string | null } | null;
  }>;
  name: string;
  owner?: { email?: string | null; fullName?: string | null; id?: string; phone?: string | null; username?: string | null } | null;
  plan?: { monthlyPrice?: string | number | null; planName?: string | null } | null;
  settings?: {
    baseCurrency?: string | null;
    currencyDisplay?: string | null;
    profileAddress?: string | null;
    profileEmail?: string | null;
    profilePhone?: string | null;
  } | null;
  status?: string | null;
  storeCode?: string | null;
  subscriptions?: Array<{ endDate?: string | null; id?: string; plan?: { planName?: string | null } | null; startDate?: string; status?: string | null }>;
  businessTemplateKey?: string | null;
  warehouses?: Array<{ branchId?: string | null; id?: string; name?: string | null; type?: string | null }>;
};

type CenterUser = {
  companies?: Array<{
    allowBackOfficeAccess?: boolean;
    allowPosAccess?: boolean;
    branch?: { id?: string; name?: string | null } | null;
    branchId?: string | null;
    company?: { branches?: Array<{ id?: string; name?: string | null }>; id?: string; name?: string; storeCode?: string | null } | null;
    companyId?: string;
    createdAt?: string;
    id?: string;
    isOwner?: boolean;
    requirePasswordChange?: boolean;
    status?: string | null;
  }>;
  createdAt?: string;
  email?: string | null;
  fullName?: string | null;
  id: string;
  loginHistory?: Array<{ loginTime?: string; status?: string | null }>;
  phone?: string | null;
  roles?: Array<{ companyId?: string | null; role?: { name?: string | null; templateKey?: string | null } | null }>;
  status?: string | null;
  username?: string | null;
};

type CenterLog = {
  action?: string;
  company?: { name?: string | null } | null;
  createdAt?: string;
  id: string;
  module?: string;
  user?: { fullName?: string | null; username?: string | null } | null;
};

type PlatformAuditLog = {
  action: string;
  actorEmail?: string | null;
  actorId?: string | null;
  actorName: string;
  actorRole?: string | null;
  actorType?: string | null;
  afterValue?: unknown;
  beforeValue?: unknown;
  business?: { id?: string; name?: string | null } | null;
  businessId?: string | null;
  createdAt?: string;
  id: string;
  ipAddress?: string | null;
  metadata?: unknown;
  requestId?: string | null;
  severity?: string | null;
  status?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  targetType?: string | null;
  userAgent?: string | null;
};

type StoreActivityLog = {
  action: string;
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  afterValue?: unknown;
  amount?: string | number | null;
  beforeValue?: unknown;
  branch?: { id?: string; name?: string | null } | null;
  business?: { id?: string; name?: string | null } | null;
  businessId: string;
  createdAt?: string;
  currency?: string;
  deviceName?: string | null;
  id: string;
  metadata?: unknown;
  occurredAt?: string;
  status?: string | null;
  syncedAt?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  targetType?: string | null;
  terminalName?: string | null;
};

type CenterPlan = {
  customLogo?: boolean;
  id: string;
  isActive?: boolean;
  maxBranches?: number | null;
  maxCashiers?: number | null;
  maxProducts?: number | null;
  maxPromotions?: number | null;
  maxReports?: number | null;
  monthlyPrice?: string | number | null;
  planName: string;
  removeWatermark?: boolean;
  yearlyPrice?: string | number | null;
};

type CenterSubscription = {
  billingCycle?: string;
  company?: { id?: string; name?: string; status?: string } | null;
  endDate?: string | null;
  id: string;
  plan?: { monthlyPrice?: string | number | null; planName?: string | null } | null;
  startDate?: string;
  status?: string;
};

type CenterBusinessSubscription = NonNullable<CenterBusiness["subscriptions"]>[number];

type CenterRole = {
  company?: { id?: string; name?: string; storeCode?: string | null } | null;
  companyId?: string | null;
  description?: string | null;
  id: string;
  isSystem?: boolean;
  name: string;
  permissions?: Array<{ permission?: { id?: string; key?: string; module?: string; name?: string } | null }>;
  templateKey?: string | null;
  users?: Array<{
    companyId?: string | null;
    user?: {
      companies?: Array<{
        allowBackOfficeAccess?: boolean;
        allowPosAccess?: boolean;
        branch?: { id?: string; name?: string | null } | null;
        branchId?: string | null;
        companyId?: string;
        status?: string | null;
      }>;
      email?: string | null;
      fullName?: string | null;
      id?: string;
      username?: string | null;
    } | null;
  }>;
};

type CommandDashboardData = {
  generatedAt?: string;
  range?: { from: string; to: string };
  salesByBusiness: Array<{
    billCount: number;
    businessId: string;
    salesLak: number;
    todayBillCount: number;
    todaySalesLak: number;
  }>;
  salesByDay: Array<{
    billCount: number;
    date: string;
    salesLak: number;
  }>;
  status: "connected" | "unavailable";
};

type CenterData = {
  auditLogs: CenterLog[];
  businesses: CenterBusiness[];
  commandDashboard?: CommandDashboardData;
  currentPlatformUser?: { email: string; id: string; name: string; role: string } | null;
  platformAuditLogs: PlatformAuditLog[];
  platformUsersCount: number;
  plans: CenterPlan[];
  roles: CenterRole[];
  storeActivityLogs: StoreActivityLog[];
  subscriptions: CenterSubscription[];
  users: CenterUser[];
};

type DrawerKind =
  | null
  | "businesses-all"
  | "businesses-active"
  | "businesses-free"
  | "businesses-pro"
  | "businesses-trial"
  | "businesses-suspended"
  | "business-detail"
  | "store-users"
  | "platform-users"
  | "users"
  | "user-detail"
  | "roles-permissions"
  | "role-detail"
  | "platform-settings"
  | "platform-notifications"
  | "subscription-revenue"
  | "subscriptions"
  | "pending-actions"
  | "active-stores-today"
  | "sales-today"
  | "bills-today"
  | "create-business"
  | "templates"
  | "plans"
  | "plan-management-detail"
  | "recent-activity"
  | "recent-activity-detail"
  | "store-performance-detail"
  | "plan-analytics-detail"
  | "system-health-detail"
  | "integration-detail"
  | "backup-restore-detail"
  | "business-view"
  | "business-edit"
  | "business-plan"
  | "business-features"
  | "business-owner"
  | "business-suspend"
  | "template-view"
  | "template-builder"
  | "pos-template-detail"
  | "pos-template-stores"
  | "pos-template-modules"
  | "pos-template-features"
  | "pos-template-plan-locks"
  | "pos-template-permissions"
  | "pos-template-reports"
  | "pos-template-settings"
  | "pos-template-integration"
  | "pos-template-integration-detail"
  | "feature-edit"
  | "subscription-action"
  | "user-action"
  | "role-edit"
  | "audit-details"
  | "platform-audit-detail"
  | "store-activity-detail"
  | "setting-edit";

type SectionKind =
  | "businesses"
  | "templates"
  | "plans"
  | "subscriptions"
  | "users"
  | "roles"
  | "audit"
  | "settings";

type PlaceholderSectionKind =
  | "actionCenter"
  | "recentActivity"
  | "stores"
  | "storePerformance"
  | "planAnalytics"
  | "systemHealth"
  | "integrations"
  | "backupRestore";

function normalizeUiPlatformRole(role: string | null | undefined) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return Object.values(PLATFORM_ROLES).includes(normalized as (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES])
    ? normalizePlatformPermissionRole(normalized)
    : null;
}

function platformUserForRole(role: string | null | undefined) {
  const normalized = normalizeUiPlatformRole(role);
  return normalized ? { role: normalized } : null;
}

function canUsePlatformAction(role: string | null | undefined, action: PlatformAction, context?: Parameters<typeof canPerformPlatformAction>[2]) {
  return canPerformPlatformAction(platformUserForRole(role), action, context);
}

function hasAnyPlatformAction(role: string | null | undefined, actions: PlatformAction[]) {
  return actions.some((action) => canUsePlatformAction(role, action));
}

function isSuperAdminRole(role: string | null | undefined) {
  return normalizeUiPlatformRole(role) === PLATFORM_ROLES.SUPER_ADMIN;
}

function canViewPlatformAudit(role: string | null | undefined) {
  return normalizeUiPlatformRole(role) ? getPlatformAuditActionScope(role).type !== "none" : false;
}

function canViewSuperAdminSection(role: string | null | undefined, section: SectionKind) {
  if (section === "businesses") return canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW);
  if (section === "templates") return canUsePlatformAction(role, PLATFORM_ACTIONS.POS_TEMPLATE_VIEW);
  if (section === "plans") {
    return hasAnyPlatformAction(role, [
      PLATFORM_ACTIONS.PLAN_CHANGE,
      PLATFORM_ACTIONS.PLAN_CUSTOM_OVERRIDE,
      PLATFORM_ACTIONS.FEATURE_TOGGLE,
    ]);
  }
  if (section === "subscriptions") {
    return hasAnyPlatformAction(role, [
      PLATFORM_ACTIONS.SUBSCRIPTION_UPGRADE,
      PLATFORM_ACTIONS.SUBSCRIPTION_DOWNGRADE,
      PLATFORM_ACTIONS.SUBSCRIPTION_EXTEND,
      PLATFORM_ACTIONS.SUBSCRIPTION_CANCEL,
      PLATFORM_ACTIONS.SUBSCRIPTION_MARK_PAID,
    ]);
  }
  if (section === "users") return isSuperAdminRole(role);
  if (section === "roles") return canUsePlatformAction(role, PLATFORM_ACTIONS.ROLES_EDIT);
  if (section === "audit") return canViewPlatformAudit(role);
  if (section === "settings") return canUsePlatformAction(role, PLATFORM_ACTIONS.SETTINGS_UPDATE);
  return false;
}

function canViewNavHref(role: string | null | undefined, href: string) {
  const sectionByHref: Record<string, SectionKind | "dashboard"> = {
    "/super-admin": "dashboard",
    "/super-admin/action-center": "dashboard",
    "/super-admin/audit-logs": "audit",
    "/super-admin/backup-restore": "settings",
    "/super-admin/businesses": "businesses",
    "/super-admin/integrations": "settings",
    "/super-admin/plan-analytics": "plans",
    "/super-admin/plans": "plans",
    "/super-admin/recent-activity": "audit",
    "/super-admin/roles": "roles",
    "/super-admin/settings": "settings",
    "/super-admin/store-performance": "businesses",
    "/super-admin/stores": "businesses",
    "/super-admin/system-health": "settings",
    "/super-admin/subscriptions": "subscriptions",
    "/super-admin/templates": "templates",
    "/super-admin/users": "users",
  };
  const section = sectionByHref[href];
  return section === "dashboard" || (section ? canViewSuperAdminSection(role, section) : false);
}

const copy: Record<SupportedLocale, Record<string, string>> = {
  en: {
    active: "Active",
    activeBusinesses: "Active Businesses",
    activeStatus: "Active",
    archiveDelete: "Archive / Delete",
    auditDetails: "Audit Details",
    auditLogs: "Audit Logs",
    backToCenter: "Back to EGO POS Center",
    backToPosTemplate: "Back to POS Template",
    backToPosTemplates: "Back to POS Templates",
    billingHistory: "Billing history",
    business: "Business",
    businessControl: "BUSINESS CONTROL",
    businessDetails: "Business Details",
    businessInformation: "Business Information",
    businessTemplates: "POS Templates",
    businesses: "Businesses",
    cancel: "Cancel",
    changePlan: "Change Plan",
    chooseBusinessTemplate: "Choose Business Template",
    close: "Close",
    comingSoon: "Coming Soon",
    checklist: "Checklist",
    connected: "Connected",
    command: "COMMAND",
    confirmCreateBusiness: "Review & Create",
    country: "Country",
    createBusiness: "Create Business",
    createBusinessTemplate: "Create Business Template",
    currency: "Currency",
    currentStatus: "Current Status",
    custom: "Custom",
    dashboard: "Dashboard",
    defaultPlan: "Default Plan",
    defaultPermissions: "Default Permissions",
    draft: "Draft",
    edit: "Edit",
    emptyBusinesses: "No businesses yet. Create the first business from a template.",
    emptyLogs: "No platform audit logs yet.",
    expiringSoon: "Trial / Expiring Soon",
    featureAccess: "Feature Access",
    featureMatrix: "Feature Matrix",
    features: "Features",
    free: "Free",
    freePlan: "Free Plan",
    freePlanBusinesses: "Free Plan Businesses",
    fullscreen: "Fullscreen",
    lastActive: "Last active",
    manageBusinessesTemplatesPlansUsersAndPlatformControls:
      "Manage businesses, templates, plans, users and platform controls.",
    manageFeatures: "Manage Features",
    manageOwner: "Manage Owner",
    managePlansFeatures: "Manage Plans & Features",
    manualControl: "Manual control is available here. Connect a backend action to make this change permanent.",
    monthlySubscriptionRevenue: "Monthly Subscription Revenue",
    monthlyRevenue: "Monthly Revenue",
    next: "Next",
    noPlatformNotifications: "No platform notifications right now.",
    noImmediateFixes: "No immediate fixes listed.",
    noRecentActivity: "No recent activity yet.",
    noStoresUsingTemplate: "No stores are using this POS template yet.",
    notVerified: "Not Verified",
    notifications: "Notifications",
    owner: "Owner",
    ownerAccount: "Owner Account",
    overview: "Overview",
    pendingActions: "Pending Actions",
    plan: "Plan",
    planEngine: "PLAN ENGINE",
    plansFeatures: "Plans & Features",
    platformAdminUsers: "Platform Admin Users",
    platformNotifications: "Platform Notifications",
    platformSettings: "Platform Settings",
    posTemplateStatus: "POS Template Status",
    posTemplates: "POS Templates",
    posTemplateClothesRental: "EGO POS for Clothes Rental",
    posTemplateClothesSales: "EGO POS for Clothes Sales",
    posTemplateEventRental: "EGO POS for Event Rental",
    posTemplateMiniMart: "EGO POS for Mini Mart",
    posTemplateOnlineSales: "EGO POS for Online Sales",
    posTemplatePharmacy: "EGO POS for Pharmacy",
    posTemplateRestaurant: "EGO POS for Restaurant",
    posTemplateWholesale: "EGO POS for Wholesale",
    pro: "Pro",
    proPlan: "Pro Plan",
    proPlanBusinesses: "Pro Plan Businesses",
    quickActions: "Quick Actions",
    recentActivity: "Recent Activity",
    recentAuditLogs: "Recent Audit Logs",
    recentBusinesses: "Recent Businesses",
    role: "Role",
    roles: "Roles",
    rolesPermissions: "Roles & Permissions",
    save: "Save",
    saveSettings: "Save Settings",
    sectionEmpty: "This section is ready, but there is no data to show yet.",
    settingsDefaults: "Settings Defaults",
    setActiveDraft: "Set Active / Draft",
    sidebarBrand: "EGO POS Center",
    signOut: "Sign out",
    signingOut: "Signing out...",
    status: "Status",
    stores: "stores",
    storesUsingTemplate: "Stores Using This Template",
    subscriptions: "Subscriptions",
    suspendedBusinesses: "Suspended Businesses",
    systemHealth: "System Health",
    systemVault: "SYSTEM VAULT",
    securityCenter: "Security Center",
    template: "Template",
    templateBuilderComingSoon: "Template Builder Coming Soon",
    templateUsage: "Template Usage",
    integrationMap: "Integration Map",
    modules: "Modules",
    needReview: "Need Review",
    needSetup: "Need Setup",
    openMiniMartPos: "Open Mini Mart POS",
    openPosDashboard: "Open POS Dashboard",
    partial: "Partial",
    planLocks: "Plan Locks",
    ready: "Ready",
    reports: "Reports",
    relatedModules: "Related Modules",
    totalBusinesses: "Total Businesses",
    totalStoreUsers: "Total Store Users",
    users: "Users",
    whatToFix: "What to Fix",
    checklistItems: "checklist items",
    rolesAccessControl: "ACCESS CONTROL",
    view: "View",
    viewAll: "View All",
    viewRecentActivity: "View Recent Activity",
  },
  th: {
    active: "ใช้งานอยู่",
    activeBusinesses: "ธุรกิจที่ใช้งานอยู่",
    activeStatus: "ใช้งานอยู่",
    archiveDelete: "เก็บถาวร / ลบ",
    auditDetails: "รายละเอียดบันทึก",
    auditLogs: "บันทึกกิจกรรม",
    backToCenter: "กลับไป EGO POS Center",
    billingHistory: "ประวัติการชำระเงิน",
    business: "ธุรกิจ",
    businessControl: "ควบคุมธุรกิจ",
    businessDetails: "รายละเอียดธุรกิจ",
    businessInformation: "ข้อมูลธุรกิจ",
    businessTemplates: "เทมเพลตธุรกิจ",
    businesses: "Businesses",
    cancel: "ยกเลิก",
    changePlan: "เปลี่ยนแพ็กเกจ",
    chooseBusinessTemplate: "เลือกเทมเพลตธุรกิจ",
    close: "ปิด",
    comingSoon: "เร็วๆ นี้",
    command: "คำสั่ง",
    confirmCreateBusiness: "ตรวจสอบและสร้าง",
    country: "ประเทศ",
    createBusiness: "สร้างธุรกิจ",
    createBusinessTemplate: "สร้างเทมเพลตธุรกิจ",
    currency: "สกุลเงิน",
    custom: "กำหนดเอง",
    dashboard: "แดชบอร์ด",
    defaultPlan: "แพ็กเกจเริ่มต้น",
    draft: "ฉบับร่าง",
    edit: "แก้ไข",
    emptyBusinesses: "ยังไม่มีธุรกิจ สร้างธุรกิจแรกจากเทมเพลตได้เลย",
    emptyLogs: "ยังไม่มีบันทึกกิจกรรมของแพลตฟอร์ม",
    expiringSoon: "ทดลองใช้ / ใกล้หมดอายุ",
    featureAccess: "สิทธิ์ฟีเจอร์",
    featureMatrix: "ตารางฟีเจอร์",
    free: "ฟรี",
    freePlan: "แพ็กเกจฟรี",
    freePlanBusinesses: "ธุรกิจแพ็กเกจฟรี",
    fullscreen: "เต็มหน้าจอ",
    lastActive: "ใช้งานล่าสุด",
    manageBusinessesTemplatesPlansUsersAndPlatformControls:
      "จัดการธุรกิจ เทมเพลต แพ็กเกจ ผู้ใช้ และการควบคุมแพลตฟอร์ม",
    manageFeatures: "จัดการฟีเจอร์",
    manageOwner: "จัดการเจ้าของ",
    managePlansFeatures: "จัดการแพ็กเกจและฟีเจอร์",
    manualControl: "ส่วนนี้พร้อมสำหรับการควบคุมแบบ Manual เชื่อมต่อ backend action เพื่อบันทึกถาวร",
    monthlySubscriptionRevenue: "รายได้สมาชิกต่อเดือน",
    monthlyRevenue: "รายได้รายเดือน",
    next: "ถัดไป",
    noPlatformNotifications: "ยังไม่มีการแจ้งเตือนของแพลตฟอร์ม",
    notifications: "การแจ้งเตือน",
    owner: "เจ้าของ",
    ownerAccount: "บัญชีเจ้าของ",
    pendingActions: "รายการที่ต้องจัดการ",
    plan: "แพ็กเกจ",
    planEngine: "ระบบแพ็กเกจ",
    plansFeatures: "แพ็กเกจและฟีเจอร์",
    platformAdminUsers: "ผู้ดูแลแพลตฟอร์ม",
    platformNotifications: "การแจ้งเตือนแพลตฟอร์ม",
    platformSettings: "ตั้งค่าแพลตฟอร์ม",
    pro: "Pro",
    proPlan: "แพ็กเกจ Pro",
    proPlanBusinesses: "ธุรกิจแพ็กเกจ Pro",
    quickActions: "คำสั่งด่วน",
    recentActivity: "กิจกรรมล่าสุด",
    recentAuditLogs: "บันทึกล่าสุด",
    recentBusinesses: "ธุรกิจล่าสุด",
    role: "บทบาท",
    roles: "บทบาท",
    rolesPermissions: "บทบาทและสิทธิ์",
    save: "บันทึก",
    saveSettings: "บันทึกการตั้งค่า",
    sectionEmpty: "ส่วนนี้พร้อมใช้งานแล้ว แต่ยังไม่มีข้อมูล",
    setActiveDraft: "ตั้งค่าใช้งาน / ฉบับร่าง",
    sidebarBrand: "EGO POS Center",
    signOut: "ออกจากระบบ",
    signingOut: "กำลังออกจากระบบ...",
    status: "สถานะ",
    subscriptions: "Subscriptions",
    suspendedBusinesses: "ธุรกิจที่ถูกระงับ",
    systemHealth: "สถานะระบบ",
    systemVault: "ระบบกลาง",
    securityCenter: "ศูนย์ความปลอดภัย",
    template: "เทมเพลต",
    templateBuilderComingSoon: "ตัวสร้างเทมเพลตกำลังมา",
    templateUsage: "การใช้งานเทมเพลต",
    totalBusinesses: "ธุรกิจทั้งหมด",
    totalStoreUsers: "ผู้ใช้ร้านทั้งหมด",
    users: "ผู้ใช้",
    rolesAccessControl: "ควบคุมสิทธิ์",
    view: "ดู",
    viewRecentActivity: "ดูกิจกรรมล่าสุด",
  },
};

type CenterCopy = Record<string, string>;

Object.assign(copy.en, {
  access: "Access",
  accountStatus: "Account Status",
  activeUsers: "Active Users",
  branchAssignmentStatus: "Branch Assignment Status",
  cashiersStaff: "Cashiers / Staff",
  changeRole: "Change Role",
  companyAssignmentStatus: "Company Assignment Status",
  disableUser: "Disable User",
  editUser: "Edit User",
  email: "Email",
  fullName: "Full Name",
  loginAccess: "Login & Access",
  loginIdentifier: "Login Identifier",
  managers: "Managers",
  noAccess: "No Access",
  noUsersConnected: "No users connected yet.",
  passwordStatus: "Password Status",
  permissionSummary: "Permission Summary",
  owners: "Owners",
  posAccess: "POS Access",
  resetPassword: "Reset Password",
  roleName: "Role Name",
  roleType: "Role Type",
  storeBackOfficeAccess: "Store Back Office Access",
  superAdminAccess: "Super Admin Access",
  temporaryPasswordNotShown: "Not shown",
  userDetails: "User Details",
  userOverview: "User Overview",
  usersMissingAssignment: "Users Missing Assignment",
  usersWillAppearAfterStoresCreated: "Users will appear here after stores and owner accounts are created.",
  viewBusiness: "View Business",
  viewStore: "View Store",
});

Object.assign(copy.en, {
  assignedUserCount: "Assigned User Count",
  backOfficeAccess: "Back Office Access",
  branchLevelAccess: "Branch-level Access",
  cashierStaffRoles: "Cashier / Staff Roles",
  changePermissions: "Change Permissions",
  customRoles: "Custom Roles",
  disableRole: "Disable Role",
  duplicateRole: "Duplicate Role",
  editRole: "Edit Role",
  permissionCount: "Permission Count",
  permissionGroups: "Permission Groups",
  permissionsAssigned: "Permissions Assigned",
  posAccess: "POS Access",
  roleCreated: "Role Created",
  roleDetail: "Role Detail",
  roleOverview: "Role Overview",
  rolesMissingPermissions: "Roles Missing Permissions",
  scopeBusiness: "Scope / Business",
  storeLevelAccess: "Store-level Access",
  systemRoles: "System Roles",
  totalRoles: "Total Roles",
  usersAssigned: "Users Assigned",
});

Object.assign(copy.th, {
  access: "สิทธิ์เข้าถึง",
  accountStatus: "สถานะบัญชี",
  activeUsers: "ผู้ใช้ที่ใช้งานอยู่",
  branchAssignmentStatus: "สถานะการผูกสาขา",
  cashiersStaff: "แคชเชียร์ / พนักงาน",
  changeRole: "เปลี่ยนบทบาท",
  companyAssignmentStatus: "สถานะการผูกธุรกิจ",
  disableUser: "ปิดใช้งานผู้ใช้",
  editUser: "แก้ไขผู้ใช้",
  email: "อีเมล",
  fullName: "ชื่อเต็ม",
  loginAccess: "การเข้าสู่ระบบและสิทธิ์",
  loginIdentifier: "ข้อมูลสำหรับเข้าสู่ระบบ",
  managers: "ผู้จัดการ",
  noAccess: "ไม่มีสิทธิ์",
  noUsersConnected: "ยังไม่มีผู้ใช้",
  passwordStatus: "สถานะรหัสผ่าน",
  permissionSummary: "สรุปสิทธิ์",
  owners: "เจ้าของ",
  posAccess: "สิทธิ์ POS",
  resetPassword: "รีเซ็ตรหัสผ่าน",
  roleName: "ชื่อบทบาท",
  roleType: "ประเภทบทบาท",
  storeBackOfficeAccess: "สิทธิ์ Store Back Office",
  superAdminAccess: "สิทธิ์ Super Admin",
  temporaryPasswordNotShown: "ไม่แสดง",
  userDetails: "รายละเอียดผู้ใช้",
  userOverview: "ภาพรวมผู้ใช้",
  usersMissingAssignment: "ผู้ใช้ที่ยังไม่มีการผูกสิทธิ์",
  usersWillAppearAfterStoresCreated: "ผู้ใช้จะแสดงที่นี่หลังจากสร้างร้านและบัญชีเจ้าของ",
  viewBusiness: "ดูธุรกิจ",
  viewStore: "ดูร้าน",
});

Object.assign(copy.th, {
  assignedUserCount: "จำนวนผู้ใช้ที่ผูกไว้",
  backOfficeAccess: "สิทธิ์ Back Office",
  branchLevelAccess: "สิทธิ์ระดับสาขา",
  cashierStaffRoles: "บทบาทแคชเชียร์ / พนักงาน",
  changePermissions: "เปลี่ยนสิทธิ์",
  customRoles: "บทบาทกำหนดเอง",
  disableRole: "ปิดใช้งานบทบาท",
  duplicateRole: "ทำสำเนาบทบาท",
  editRole: "แก้ไขบทบาท",
  permissionCount: "จำนวนสิทธิ์",
  permissionGroups: "กลุ่มสิทธิ์",
  permissionsAssigned: "ผูกสิทธิ์แล้ว",
  posAccess: "สิทธิ์ POS",
  roleCreated: "สร้างบทบาทแล้ว",
  roleDetail: "รายละเอียดบทบาท",
  roleOverview: "ภาพรวมบทบาท",
  rolesMissingPermissions: "บทบาทที่ยังไม่มีสิทธิ์",
  scopeBusiness: "ขอบเขต / ธุรกิจ",
  storeLevelAccess: "สิทธิ์ระดับร้าน",
  systemRoles: "บทบาทระบบ",
  totalRoles: "บทบาททั้งหมด",
  usersAssigned: "ผู้ใช้ที่ผูกบทบาท",
});

Object.assign(copy.en, {
  auditCreated: "Audit Created",
  billingNotConnectedForPro: "Billing not connected for Pro",
  businessCreated: "Company Created",
  businessOverview: "Business Overview",
  businessSetupStatus: "Setup Status",
  businessesMissingData: "Businesses Missing Data",
  countryRegion: "Country / Region",
  miniMartBusinesses: "Mini Mart Businesses",
  openStoreDashboard: "Open Store Dashboard",
  ownerAssignmentActive: "Owner Assignment Active",
  primaryStore: "Primary Store",
  storeBranchCreated: "Store / Branch Created",
  storesBranches: "Stores / Branches",
  storesCount: "Stores Count",
  templatePlan: "Template & Plan",
  viewStores: "View Stores",
});

Object.assign(copy.th, {
  auditCreated: "บันทึกตรวจสอบถูกสร้าง",
  billingNotConnectedForPro: "ยังไม่ได้เชื่อมต่อระบบชำระเงินสำหรับ Pro",
  businessCreated: "สร้างธุรกิจแล้ว",
  businessOverview: "ภาพรวมธุรกิจ",
  businessSetupStatus: "สถานะการตั้งค่าธุรกิจ",
  businessesMissingData: "ธุรกิจข้อมูลไม่ครบ",
  countryRegion: "ประเทศ/ภูมิภาค",
  miniMartBusinesses: "ธุรกิจ Mini Mart",
  openStoreDashboard: "เปิดแดชบอร์ดร้าน",
  ownerAssignmentActive: "สิทธิ์เจ้าของใช้งานอยู่",
  primaryStore: "ร้านหลัก",
  storeBranchCreated: "สร้างร้าน/สาขาแล้ว",
  storesBranches: "ร้าน / สาขา",
  storesCount: "จำนวนร้าน",
  templatePlan: "Template และแผน",
  viewStores: "ดูร้านค้า",
});

Object.assign(copy.en, {
  activePlans: "Active Plans",
  billingReadiness: "Upgrade / Billing Readiness",
  billingStatus: "Billing Status",
  businessStore: "Business / Store",
  cancelSubscription: "Cancel Subscription",
  currentPlan: "Current Plan",
  freePlanRecords: "Free Plan Businesses",
  monthlyPrice: "Monthly Price",
  noPlanRecordsConnected: "No plan records connected yet.",
  noPlanRecordsConnectedSubtext: "Plan records will appear after stores are created from EGO POS Center.",
  notRequired: "Not required",
  planCreatedAt: "Created At",
  planDetails: "Plan Details",
  planFeaturesLimits: "Plan Features / Limits",
  planManagement: "Plan Management",
  planManagementSubtitle: "Review real business plan assignments, subscription status, limits, and billing readiness.",
  planRecords: "Plan Records",
  plansMissingBilling: "Billing Not Connected",
  proBillingNotEnabled: "Pro billing is not connected yet. Plan changes are disabled for now.",
  proPlanRecords: "Pro Plan Businesses",
  products: "Products",
  promotions: "Promotions",
  setupStatus: "Setup Status",
  startedAt: "Started At",
  updatedOrStartedAt: "Updated / Started At",
  upgradeToPro: "Upgrade to Pro",
  yearlyPrice: "Yearly Price",
});

Object.assign(copy.th, {
  activePlans: "แผนที่ใช้งานอยู่",
  billingReadiness: "ความพร้อมอัปเกรด / ชำระเงิน",
  billingStatus: "สถานะการชำระเงิน",
  businessStore: "ธุรกิจ / ร้าน",
  cancelSubscription: "ยกเลิกการสมัครใช้งาน",
  currentPlan: "แผนปัจจุบัน",
  freePlanRecords: "ธุรกิจแผนฟรี",
  monthlyPrice: "ราคารายเดือน",
  noPlanRecordsConnected: "ยังไม่มีข้อมูลแผน",
  noPlanRecordsConnectedSubtext: "ข้อมูลแผนจะแสดงหลังจากสร้างร้านจาก EGO POS Center",
  notRequired: "ไม่จำเป็น",
  planCreatedAt: "วันที่สร้าง",
  planDetails: "รายละเอียดแผน",
  planFeaturesLimits: "ฟีเจอร์ / ขีดจำกัดของแผน",
  planManagement: "จัดการแผน",
  planManagementSubtitle: "ตรวจสอบแผนจริงของธุรกิจ สถานะการสมัครใช้งาน ขีดจำกัด และความพร้อมการชำระเงิน",
  planRecords: "ข้อมูลแผน",
  plansMissingBilling: "ยังไม่เชื่อมต่อการชำระเงิน",
  proBillingNotEnabled: "ยังไม่ได้เชื่อมต่อระบบชำระเงิน Pro จึงยังปิดการเปลี่ยนแผนไว้",
  proPlanRecords: "ธุรกิจแผน Pro",
  products: "สินค้า",
  promotions: "โปรโมชัน",
  setupStatus: "สถานะการตั้งค่า",
  startedAt: "วันที่เริ่มต้น",
  updatedOrStartedAt: "อัปเดต / เริ่มต้น",
  upgradeToPro: "อัปเกรดเป็น Pro",
  yearlyPrice: "ราคารายปี",
});

Object.assign(copy.th, {
  backToPosTemplate: "กลับไป POS Template",
  backToPosTemplates: "กลับไป POS Templates",
  businessTemplates: "POS Templates",
  connected: "เชื่อมต่อแล้ว",
  checklist: "รายการตรวจสอบ",
  currentStatus: "สถานะปัจจุบัน",
  defaultPermissions: "สิทธิ์เริ่มต้น",
  features: "ฟีเจอร์",
  integrationMap: "แผนผังการเชื่อมต่อ",
  modules: "โมดูล",
  needReview: "ต้องตรวจสอบ",
  needSetup: "ต้องตั้งค่า",
  noImmediateFixes: "ยังไม่มีรายการที่ต้องแก้ทันที",
  noRecentActivity: "ยังไม่มีกิจกรรมล่าสุด",
  noStoresUsingTemplate: "ยังไม่มีร้านที่ใช้ POS Template นี้",
  notVerified: "ยังไม่ได้ตรวจสอบ",
  openMiniMartPos: "เปิด Mini Mart POS",
  openPosDashboard: "เปิดแดชบอร์ด POS",
  overview: "ภาพรวม",
  partial: "บางส่วน",
  planLocks: "ล็อกตามแพ็กเกจ",
  posTemplateStatus: "สถานะ POS Template",
  posTemplates: "POS Templates",
  posTemplateClothesRental: "EGO POS สำหรับร้านเช่าชุด",
  posTemplateClothesSales: "EGO POS สำหรับร้านเสื้อผ้า",
  posTemplateEventRental: "EGO POS สำหรับเช่าอุปกรณ์งานอีเวนต์",
  posTemplateMiniMart: "EGO POS สำหรับมินิมาร์ท",
  posTemplateOnlineSales: "EGO POS สำหรับขายออนไลน์",
  posTemplatePharmacy: "EGO POS สำหรับร้านยา",
  posTemplateRestaurant: "EGO POS สำหรับร้านอาหาร",
  posTemplateWholesale: "EGO POS สำหรับค้าส่ง",
  ready: "พร้อมใช้งาน",
  reports: "รายงาน",
  relatedModules: "โมดูลที่เกี่ยวข้อง",
  settingsDefaults: "ค่าเริ่มต้น",
  stores: "ร้าน",
  storesUsingTemplate: "ร้านที่ใช้ Template นี้",
  whatToFix: "สิ่งที่ต้องแก้",
  checklistItems: "รายการตรวจสอบ",
  viewAll: "ดูทั้งหมด",
});

Object.assign(copy.th, {
  language: "ภาษา",
});

Object.assign(copy.en, {
  action: "Action",
  accessDenied: "Access denied",
  after: "After",
  amount: "Amount",
  actor: "Actor",
  backToPlatformAudit: "Back to Platform Audit",
  backToStoreActivity: "Back to Store Activity",
  before: "Before",
  branch: "Branch",
  auditLogsSubtitle: "Review Super Admin, business, store, user, permission, and system events recorded by EGO POS Center.",
  businessStore: "Business / Store",
  changeSummary: "Change Summary",
  createActions: "Create Actions",
  deleteLogs: "Delete Logs",
  eventOverview: "Event Overview",
  failedActions: "Failed Actions",
  dateTime: "Date / Time",
  moduleFilter: "Module",
  ipAddress: "IP Address",
  metadata: "Metadata",
  noAuditLogsConnected: "No audit logs connected yet.",
  noAuditLogsConnectedSubtext: "Audit logs will appear after Super Admin, business, user, and system actions are recorded.",
  noPlatformAuditLogs: "No platform audit logs found.",
  noRecentActivityYet: "No recent activity yet.",
  noRecentActivityYetSubtext: "Recent activity will appear after Super Admin, business, user, plan, and system actions are recorded.",
  noStoreActivityLogs: "No store activity logs found for this selection.",
  occurredAt: "Occurred At",
  platformAudit: "Platform Audit",
  platformAuditDetail: "Platform Audit Detail",
  requestId: "Request ID",
  requiresBillingAdmin: "Requires Billing Admin",
  requiresPermission: "Requires permission",
  requiresSuperAdmin: "Requires Super Admin",
  requiresTemplateManager: "Requires Template Manager",
  restoreRevert: "Restore / Revert",
  scopedAuditView: "Scoped audit view",
  selectBusinessForStoreActivity: "Select a business to view store activity.",
  severity: "Severity",
  securityPermissionEvents: "Security / Permission Events",
  storeActivity: "Store Activity",
  storeActivityDetail: "Store Activity Detail",
  storeUser: "Store User",
  syncedAt: "Synced At",
  systemEvents: "System Events",
  target: "Target",
  terminal: "Terminal",
  totalLogs: "Total Logs",
  updateActions: "Update Actions",
  activityLabel: "Activity",
  activityOverview: "Activity Overview",
  businessCreated: "Business created",
  businessStoreEvents: "Business / Store Events",
  errorFailedEvents: "Error / Failed Events",
  exportActivity: "Export Activity",
  loginEvent: "Login event",
  permissionEvents: "Permission Events",
  permissionUpdated: "Permission updated",
  planEvents: "Plan Events",
  planAssigned: "Plan assigned",
  relatedContext: "Related Context",
  safeChangeSummary: "Safe change summary",
  storeCreated: "Store created",
  systemEvent: "System event",
  targetName: "Target Name",
  targetType: "Target Type",
  totalActivities: "Total Activities",
  unknownActivity: "Unknown activity",
  userCreated: "User created",
  userEvents: "User Events",
  viewAuditLog: "View Audit Log",
  viewUser: "View User",
  youDoNotHavePermissionToViewThisSection: "You do not have permission to view this section.",
  userAgent: "User Agent",
});

Object.assign(copy.th, {
  auditLogsSubtitle: "ตรวจสอบเหตุการณ์ Super Admin ธุรกิจ ร้าน ผู้ใช้ สิทธิ์ และระบบที่บันทึกโดย EGO POS Center",
  businessStore: "ธุรกิจ / ร้าน",
  changeSummary: "สรุปการเปลี่ยนแปลง",
  createActions: "รายการสร้าง",
  deleteLogs: "ลบบันทึก",
  eventOverview: "ภาพรวมเหตุการณ์",
  failedActions: "รายการล้มเหลว",
  moduleFilter: "โมดูล",
  noAuditLogsConnected: "ยังไม่มีบันทึกตรวจสอบ",
  noAuditLogsConnectedSubtext: "บันทึกตรวจสอบจะแสดงหลังจากมีการบันทึกการทำงานของ Super Admin ธุรกิจ ผู้ใช้ และระบบ",
  noRecentActivityYet: "ยังไม่มีกิจกรรมล่าสุด",
  noRecentActivityYetSubtext: "กิจกรรมล่าสุดจะแสดงหลังจากมีการบันทึกการทำงานของ Super Admin ธุรกิจ ผู้ใช้ แผน และระบบ",
  restoreRevert: "กู้คืน / ย้อนกลับ",
  securityPermissionEvents: "เหตุการณ์ความปลอดภัย / สิทธิ์",
  systemEvents: "เหตุการณ์ระบบ",
  totalLogs: "บันทึกทั้งหมด",
  updateActions: "รายการอัปเดต",
  activityLabel: "กิจกรรม",
  activityOverview: "ภาพรวมกิจกรรม",
  businessCreated: "สร้างธุรกิจแล้ว",
  businessStoreEvents: "เหตุการณ์ธุรกิจ / ร้าน",
  errorFailedEvents: "ข้อผิดพลาด / ล้มเหลว",
  exportActivity: "ส่งออกกิจกรรม",
  loginEvent: "เหตุการณ์เข้าสู่ระบบ",
  permissionEvents: "เหตุการณ์สิทธิ์",
  permissionUpdated: "อัปเดตสิทธิ์แล้ว",
  planEvents: "เหตุการณ์แผน",
  planAssigned: "กำหนดแผนแล้ว",
  relatedContext: "บริบทที่เกี่ยวข้อง",
  safeChangeSummary: "สรุปการเปลี่ยนแปลงที่ปลอดภัย",
  storeCreated: "สร้างร้านแล้ว",
  systemEvent: "เหตุการณ์ระบบ",
  targetName: "ชื่อเป้าหมาย",
  targetType: "ประเภทเป้าหมาย",
  totalActivities: "กิจกรรมทั้งหมด",
  unknownActivity: "กิจกรรมไม่ทราบประเภท",
  userCreated: "สร้างผู้ใช้แล้ว",
  userEvents: "เหตุการณ์ผู้ใช้",
  viewAuditLog: "ดูบันทึกตรวจสอบ",
  viewUser: "ดูผู้ใช้",
});

Object.assign(copy.en, {
  actionCenter: "Action Center",
  activeStoresToday: "Active Stores Today",
  advancedDetails: "Advanced Details",
  all: "All",
  appStatus: "App status",
  averageBill: "Average Bill",
  backupStatus: "Backup status",
  backupRestore: "Backup & Restore",
  billCount: "Bill count",
  bills: "Bills",
  commandDashboardTitle: "EGO POS Center Dashboard",
  critical: "Critical",
  databaseStatus: "Database status",
  dateRange: "Date range",
  disabled: "Disabled",
  emptyNoActions: "No actions need attention right now.",
  emptyNoActivity: "No activity yet.",
  emptyNoSalesData: "No sales data yet.",
  emptyNoStorePerformance: "No store performance data yet.",
  emptySystemHealth: "System health checks are not connected yet.",
  error: "Error",
  export: "Export",
  exportNotReady: "Export is not connected yet.",
  info: "Info",
  login: "Login",
  monthlyPlatformRevenue: "Monthly Platform Revenue",
  noData: "No data",
  notEnoughData: "Not enough data",
  ordersBills: "Orders / Bills",
  planAnalytics: "Plan Analytics",
  planManagement: "Plan Management",
  performanceScore: "Performance Score",
  platformSalesOverview: "Platform Sales Overview",
  refresh: "Refresh",
  salesAmount: "Sales amount",
  sales: "Sales",
  scoreHelp: "Score is based on sales activity, store activity, stock alerts, sync status, and unresolved issues.",
  sectionNotConnectedYet: "This section is not connected yet.",
  stockAlerts: "Stock Alerts",
  store: "Store",
  storeHealth: "Store health",
  storePerformance: "Store Performance",
  storesNav: "Stores",
  syncStatus: "Sync Status",
  systemApiStatus: "API status",
  systemHealthNotConnected: "System health checks are not connected yet.",
  templateDataNotConnected: "Template data not connected yet.",
  technicalMetadata: "Technical metadata",
  thisMonth: "This Month",
  thirtyDays: "30 Days",
  today: "Today",
  todaySales: "Today Sales",
  topStoresBySales: "Top 10 Stores by Sales",
  totalBillsToday: "Total Bills Today",
  totalPlatformSales: "Total platform sales",
  totalSalesToday: "Total Sales Today",
  rawPayload: "Raw payload",
  readableSummary: "Summary",
  trialPlan: "Trial",
  upgradePending: "Upgrade pending",
  sevenDaySales: "7-day sales",
  sevenDays: "7 Days",
  viewActivity: "View activity",
  viewPlan: "View plan",
  viewTemplateStatus: "View template status",
  vsPreviousPeriod: "vs previous period",
  warning: "Warning",
});

Object.assign(copy.th, {
  action: "การทำงาน",
  accessDenied: "ไม่มีสิทธิ์",
  after: "หลังเปลี่ยน",
  amount: "จำนวนเงิน",
  actor: "ผู้ทำรายการ",
  backToPlatformAudit: "กลับไป Platform Audit",
  backToStoreActivity: "กลับไป Store Activity",
  before: "ก่อนเปลี่ยน",
  branch: "สาขา",
  dateTime: "วันที่ / เวลา",
  ipAddress: "IP Address",
  metadata: "ข้อมูลเพิ่มเติม",
  noPlatformAuditLogs: "ยังไม่มี Platform Audit Log",
  noStoreActivityLogs: "ไม่พบ Store Activity Log สำหรับตัวเลือกนี้",
  occurredAt: "เวลาที่เกิดเหตุการณ์",
  platformAudit: "Platform Audit",
  platformAuditDetail: "รายละเอียด Platform Audit",
  requestId: "Request ID",
  requiresBillingAdmin: "ต้องใช้สิทธิ์ Billing Admin",
  requiresPermission: "ต้องมีสิทธิ์",
  requiresSuperAdmin: "ต้องใช้สิทธิ์ Super Admin",
  requiresTemplateManager: "ต้องใช้สิทธิ์ Template Manager",
  scopedAuditView: "Scoped audit view",
  selectBusinessForStoreActivity: "เลือกธุรกิจเพื่อดู Store Activity",
  severity: "ระดับความสำคัญ",
  storeActivity: "Store Activity",
  storeActivityDetail: "รายละเอียด Store Activity",
  storeUser: "ผู้ใช้ร้าน",
  syncedAt: "เวลาซิงก์",
  target: "เป้าหมาย",
  terminal: "เครื่องขาย",
  youDoNotHavePermissionToViewThisSection: "คุณไม่มีสิทธิ์ดูส่วนนี้",
  userAgent: "User Agent",
});

Object.assign(copy.th, {
  actionCenter: "ศูนย์การดำเนินการ",
  activeStoresToday: "ร้านที่ใช้งานวันนี้",
  advancedDetails: "รายละเอียดขั้นสูง",
  all: "ทั้งหมด",
  appStatus: "สถานะแอป",
  averageBill: "บิลเฉลี่ย",
  backupStatus: "สถานะสำรองข้อมูล",
  backupRestore: "สำรองและกู้คืน",
  billCount: "จำนวนบิล",
  bills: "บิล",
  commandDashboardTitle: "แดชบอร์ด EGO POS Center",
  critical: "วิกฤต",
  databaseStatus: "สถานะฐานข้อมูล",
  dateRange: "ช่วงวันที่",
  disabled: "ปิดใช้งาน",
  emptyNoActions: "ตอนนี้ไม่มีรายการที่ต้องดำเนินการ",
  emptyNoActivity: "ยังไม่มีกิจกรรม",
  emptyNoSalesData: "ยังไม่มีข้อมูลยอดขาย",
  emptyNoStorePerformance: "ยังไม่มีข้อมูลประสิทธิภาพร้าน",
  emptySystemHealth: "ยังไม่ได้เชื่อมต่อการตรวจสอบสถานะระบบ",
  error: "ข้อผิดพลาด",
  export: "ส่งออก",
  exportNotReady: "ยังไม่ได้เชื่อมต่อการส่งออก",
  info: "ข้อมูล",
  login: "เข้าสู่ระบบ",
  monthlyPlatformRevenue: "รายได้แพลตฟอร์มรายเดือน",
  noData: "ไม่มีข้อมูล",
  notEnoughData: "ข้อมูลไม่เพียงพอ",
  ordersBills: "ออเดอร์ / บิล",
  planAnalytics: "วิเคราะห์แผน",
  planManagement: "จัดการแผน",
  performanceScore: "คะแนนประสิทธิภาพ",
  platformSalesOverview: "ภาพรวมยอดขายแพลตฟอร์ม",
  refresh: "รีเฟรช",
  salesAmount: "ยอดขาย",
  sales: "ยอดขาย",
  scoreHelp: "คะแนนคำนวณจากยอดขาย กิจกรรมร้าน สต็อก การซิงก์ และปัญหาที่ยังไม่ถูกแก้ไข",
  sectionNotConnectedYet: "ส่วนนี้ยังไม่ได้เชื่อมต่อ",
  stockAlerts: "แจ้งเตือนสต็อก",
  store: "ร้าน",
  storeHealth: "สุขภาพร้าน",
  storePerformance: "ประสิทธิภาพร้าน",
  storesNav: "ร้านค้า",
  syncStatus: "สถานะซิงก์",
  systemApiStatus: "สถานะ API",
  systemHealthNotConnected: "ยังไม่ได้เชื่อมต่อการตรวจสอบสถานะระบบ",
  templateDataNotConnected: "ยังไม่ได้เชื่อมต่อข้อมูลเทมเพลต",
  technicalMetadata: "ข้อมูลทางเทคนิค",
  thisMonth: "เดือนนี้",
  thirtyDays: "30 วัน",
  today: "วันนี้",
  todaySales: "ยอดขายวันนี้",
  topStoresBySales: "10 ร้านยอดขายสูงสุด",
  totalBillsToday: "บิลทั้งหมดวันนี้",
  totalPlatformSales: "ยอดขายรวมแพลตฟอร์ม",
  totalSalesToday: "ยอดขายรวมวันนี้",
  rawPayload: "ข้อมูลดิบ",
  readableSummary: "สรุป",
  trialPlan: "ทดลองใช้",
  upgradePending: "รออัปเกรด",
  sevenDaySales: "ยอดขาย 7 วัน",
  sevenDays: "7 วัน",
  viewActivity: "ดูกิจกรรม",
  viewPlan: "ดูแผน",
  viewTemplateStatus: "ดูสถานะเทมเพลต",
  vsPreviousPeriod: "เทียบช่วงก่อนหน้า",
  warning: "เตือน",
});

Object.assign(copy.en, {
  storesBusinesses: "Stores / Businesses",
  integrations: "Integrations",
  settingsMenu: "Settings",
  templates: "Templates",
});

Object.assign(copy.th, {
  active: "ใช้งานอยู่",
  activeBusinesses: "ธุรกิจที่ใช้งานอยู่",
  activeStatus: "ใช้งานอยู่",
  archiveDelete: "เก็บถาวร / ลบ",
  auditDetails: "รายละเอียดบันทึก",
  auditLogs: "บันทึกตรวจสอบ",
  backToCenter: "กลับไป EGO POS Center",
  business: "ธุรกิจ",
  businessControl: "ควบคุมธุรกิจ",
  businessDetails: "รายละเอียดธุรกิจ",
  businessInformation: "ข้อมูลธุรกิจ",
  businessTemplates: "POS Templates",
  businesses: "ธุรกิจ",
  cancel: "ยกเลิก",
  changePlan: "เปลี่ยนแผน",
  chooseBusinessTemplate: "เลือก POS Template",
  close: "ปิด",
  command: "คำสั่ง",
  confirmCreateBusiness: "ตรวจสอบและสร้าง",
  connected: "เชื่อมต่อแล้ว",
  country: "ประเทศ",
  createBusiness: "สร้างธุรกิจ",
  createBusinessTemplate: "สร้าง POS Template",
  currency: "สกุลเงิน",
  currentStatus: "สถานะปัจจุบัน",
  dashboard: "แดชบอร์ด",
  defaultPlan: "แผนเริ่มต้น",
  defaultPermissions: "สิทธิ์เริ่มต้น",
  draft: "ฉบับร่าง",
  edit: "แก้ไข",
  emptyBusinesses: "ยังไม่มีธุรกิจ สร้างธุรกิจแรกจาก POS Template ได้เลย",
  emptyLogs: "ยังไม่มีบันทึกตรวจสอบของแพลตฟอร์ม",
  expiringSoon: "ทดลองใช้ / ใกล้หมดอายุ",
  featureAccess: "สิทธิ์ฟีเจอร์",
  featureMatrix: "ตารางฟีเจอร์",
  features: "ฟีเจอร์",
  free: "ฟรี",
  freePlan: "แผนฟรี",
  freePlanBusinesses: "ธุรกิจแผนฟรี",
  fullscreen: "เต็มหน้าจอ",
  lastActive: "ใช้งานล่าสุด",
  manageBusinessesTemplatesPlansUsersAndPlatformControls: "จัดการธุรกิจ POS Templates แผน ผู้ใช้ และการควบคุมแพลตฟอร์ม",
  manageFeatures: "จัดการฟีเจอร์",
  manageOwner: "จัดการเจ้าของ",
  managePlansFeatures: "จัดการแผนและฟีเจอร์",
  manualControl: "ส่วนนี้พร้อมสำหรับการควบคุมแบบ Manual เชื่อมต่อ backend action เพื่อบันทึกถาวร",
  monthlyRevenue: "รายได้รายเดือน",
  monthlySubscriptionRevenue: "รายได้สมาชิกต่อเดือน",
  needReview: "ต้องตรวจสอบ",
  needSetup: "ต้องตั้งค่า",
  next: "ถัดไป",
  noImmediateFixes: "ยังไม่มีรายการที่ต้องแก้ทันที",
  noPlatformNotifications: "ยังไม่มีการแจ้งเตือนของแพลตฟอร์ม",
  noRecentActivity: "ยังไม่มีกิจกรรมล่าสุด",
  noStoresUsingTemplate: "ยังไม่มีร้านที่ใช้ POS Template นี้",
  notVerified: "ยังไม่ได้ตรวจสอบ",
  notifications: "การแจ้งเตือน",
  openMiniMartPos: "เปิด Mini Mart POS",
  openPosDashboard: "เปิดแดชบอร์ด POS",
  owner: "เจ้าของ",
  ownerAccount: "บัญชีเจ้าของ",
  partial: "บางส่วน",
  pendingActions: "รายการที่ต้องจัดการ",
  plan: "แผน",
  planEngine: "ระบบแผน",
  planLocks: "ล็อกตามแผน",
  plansFeatures: "แผนและฟีเจอร์",
  platformAdminUsers: "ผู้ดูแลแพลตฟอร์ม",
  platformNotifications: "การแจ้งเตือนแพลตฟอร์ม",
  platformSettings: "ตั้งค่าแพลตฟอร์ม",
  posTemplateStatus: "สถานะ POS Template",
  posTemplates: "POS Templates",
  proPlan: "แผน Pro",
  proPlanBusinesses: "ธุรกิจแผน Pro",
  ready: "พร้อมใช้งาน",
  recentActivity: "กิจกรรมล่าสุด",
  recentAuditLogs: "บันทึกล่าสุด",
  recentBusinesses: "ธุรกิจล่าสุด",
  reports: "รายงาน",
  role: "บทบาท",
  roles: "บทบาท",
  rolesAccessControl: "ควบคุมสิทธิ์",
  rolesPermissions: "บทบาทและสิทธิ์",
  save: "บันทึก",
  saveSettings: "บันทึกการตั้งค่า",
  sectionEmpty: "ส่วนนี้พร้อมใช้งานแล้ว แต่ยังไม่มีข้อมูล",
  settingsDefaults: "ค่าเริ่มต้น",
  setActiveDraft: "ตั้งค่าใช้งาน / ฉบับร่าง",
  signOut: "ออกจากระบบ",
  signingOut: "กำลังออกจากระบบ...",
  status: "สถานะ",
  stores: "ร้าน",
  storesBusinesses: "ร้าน / ธุรกิจ",
  storesUsingTemplate: "ร้านที่ใช้ Template นี้",
  subscriptions: "สมาชิกและการชำระเงิน",
  suspendedBusinesses: "ธุรกิจที่ถูกระงับ",
  systemHealth: "สถานะระบบ",
  systemVault: "ระบบกลาง",
  template: "Template",
  templateBuilderComingSoon: "ตัวสร้าง Template กำลังมา",
  templateUsage: "การใช้งาน Template",
  totalBusinesses: "ธุรกิจทั้งหมด",
  totalStoreUsers: "ผู้ใช้ร้านทั้งหมด",
  users: "ผู้ใช้",
  view: "ดู",
  viewAll: "ดูทั้งหมด",
  viewRecentActivity: "ดูกิจกรรมล่าสุด",
});

Object.assign(copy.th, {
  integrations: "การเชื่อมต่อ",
  settingsMenu: "ตั้งค่า",
  templates: "เทมเพลต",
});

Object.assign(copy.th, {
  activeStores: "ร้านที่ใช้งานอยู่",
  actions: "การทำงาน",
  activeAssignment: "การผูกสิทธิ์ใช้งาน",
  backOfficeAccess: "สิทธิ์ Back Office",
  branchId: "รหัสสาขา",
  businessProfile: "ข้อมูลธุรกิจ",
  companyId: "รหัสธุรกิจ",
  createdAt: "วันที่สร้าง",
  disableStore: "ปิดใช้งานร้าน",
  editStore: "แก้ไขร้าน",
  freePlanStores: "ร้านแผน Free",
  miniMartStores: "ร้าน Mini Mart",
  missingData: "ข้อมูลไม่ครบ",
  missingStoreData: "ข้อมูลไม่ครบ",
  openDashboard: "เปิดแดชบอร์ด",
  ownerEmail: "อีเมลเจ้าของ",
  ownerPhone: "เบอร์โทรเจ้าของ",
  ownerUsername: "ชื่อผู้ใช้เจ้าของ",
  posAccess: "สิทธิ์ POS",
  resetOwnerPassword: "รีเซ็ตรหัสผ่านเจ้าของ",
  setupComplete: "ตั้งค่าครบ",
  storeCode: "รหัสร้าน",
  storeDetails: "รายละเอียดร้าน",
  storeOverview: "ภาพรวมร้าน",
  subscriptionStatus: "สถานะแพ็กเกจ",
  warehouseCreated: "สร้างคลังแล้ว",
});

Object.assign(copy.en, {
  actionCenterSubtitle: "Review approvals, sync issues, store alerts, plan issues, and system warnings.",
  actionDataNotConnected: "No connected action data yet.",
  activeActors: "Active Actors",
  activityDataNotConnected: "Activity data is not connected yet.",
  addStore: "Add Store",
  approval: "Approval",
  averagePerformanceScore: "Average Performance Score",
  backup: "Backup",
  backupWarnings: "Backup Warnings",
  backupWarningsDescription: "Backup freshness and restore readiness warnings will appear here.",
  category: "Category",
  critical: "Critical",
  disabledNotConnected: "Not connected yet",
  excellent: "Excellent",
  excellentStores: "Excellent Stores",
  exportNotConnected: "Export is not connected yet.",
  failedSync: "Failed Sync",
  failedSyncDescription: "Sync failures and offline queue issues will appear here.",
  filterAll: "All",
  good: "Good",
  info: "Info",
  lowStockAlerts: "Low Stock Alerts",
  lowStockAlertsDescription: "Stock alerts will appear after inventory alerts are connected.",
  maintenance: "Maintenance",
  noActionsNeedAttention: "No actions need attention right now.",
  noActionsNeedAttentionSubtext: "Connect approval, sync, stock, plan, and backup data sources to activate this page.",
  noIssues: "No issues",
  noRecentActivityYet: "No recent activity yet.",
  noRecentActivityYetSubtext: "Recent activity will appear after Super Admin, business, user, plan, and system actions are recorded.",
  notConnected: "Not connected",
  offlineStores: "Offline Stores",
  onlineStores: "Online Stores",
  pendingApprovals: "Pending Approvals",
  pendingApprovalsDescription: "Approval requests will appear here after approval workflows are connected.",
  performanceFilter: "Performance",
  planIssues: "Plan Issues",
  planIssuesDescription: "Subscription, expiry, and plan mismatch issues will appear here.",
  recentActivitySubtitle: "Review platform events, store actions, user activity, and system logs.",
  resolved: "Resolved",
  search: "Search",
  searchStores: "Search stores",
  security: "Security",
  securityAlerts: "Security Alerts",
  securityAlertsDescription: "Denied access, failed actions, and security warnings from audit logs.",
  storeDataNotConnected: "Store data is not connected yet.",
  activeStores: "Active Stores",
  miniMartStores: "Mini Mart Stores",
  freePlanStores: "Free Plan Stores",
  missingStoreData: "Missing Data",
  storeName: "Store Name",
  storeCode: "Store Code",
  createdAt: "Created At",
  actions: "Actions",
  storeDetails: "Store Details",
  storeOverview: "Store Overview",
  companyId: "Company ID",
  branchId: "Branch ID",
  language: "Language",
  ownerEmail: "Owner Email",
  ownerUsername: "Owner Username",
  ownerPhone: "Owner Phone",
  businessProfile: "Business Profile",
  accessSetup: "Access & Setup",
  backOfficeAccess: "Back Office Access",
  posAccess: "POS Access",
  activeAssignment: "Active Assignment",
  warehouseCreated: "Warehouse Created",
  subscriptionStatus: "Subscription Status",
  setupComplete: "Setup Complete",
  missingData: "Missing data",
  openDashboard: "Open Dashboard",
  resetOwnerPassword: "Reset Owner Password",
  disableStore: "Disable Store",
  editStore: "Edit Store",
  storePerformanceNotConnected: "Store performance data is not connected yet.",
  storePerformanceNotConnectedSubtext: "Connect sales, activity, stock, and sync data to calculate performance scores.",
  storePerformancePageTitle: "Store Performance",
  storePerformanceRows: "Store Performance",
  storePerformanceSubtitle: "Compare sales activity, store health, sync status, stock alerts, and performance score.",
  storesNeedingAttention: "Stores Needing Attention",
  storesPageSubtitle: "View and manage stores, branches, templates, plans, and online status.",
  storesPageTitle: "Stores",
  storesTableEmpty: "No stores connected yet.",
  storesTableEmptySubtext: "Stores will appear here after businesses are created and store data is connected.",
  successfulEvents: "Successful Events",
  sync: "Sync",
  syncIssueStores: "Sync Issue Stores",
  stockAlertStores: "Stock Alert Stores",
  templateDrafts: "Template Drafts",
  templateDraftsDescription: "Draft template readiness items from the current POS template registry.",
  totalEvents: "Total Events",
  totalActivities: "Total Activities",
  businessStoreEvents: "Business / Store Events",
  errorFailedEvents: "Error / Failed Events",
  permissionEvents: "Permission Events",
  planEvents: "Plan Events",
  userEvents: "User Events",
  activityLabel: "Activity",
  activityOverview: "Activity Overview",
  businessCreated: "Business created",
  exportActivity: "Export Activity",
  loginEvent: "Login event",
  permissionUpdated: "Permission updated",
  relatedContext: "Related Context",
  safeChangeSummary: "Safe change summary",
  storeCreated: "Store created",
  systemEvent: "System event",
  targetName: "Target Name",
  targetType: "Target Type",
  unknownActivity: "Unknown activity",
  userCreated: "User created",
  viewAuditLog: "View Audit Log",
  totalStores: "Total Stores",
  totalOpenActions: "Total Open Actions",
  viewDetails: "View details",
  warning: "Warning",
  api: "API",
  apiKeys: "API Keys",
  autoBackup: "Auto Backup",
  availableIntegrations: "Available Integrations",
  backupDestination: "Backup destination",
  backupFilter: "Backup",
  backupRestoreSubtitle: "Manage backup readiness, restore workflow, storage destination, and recovery history.",
  backupServiceNotConnected: "Backup service is not connected yet.",
  backupSettings: "Backup Settings",
  backupStatus: "Backup Status",
  backupStorage: "Backup Storage",
  backupStorageNotConnected: "Backup storage is not connected yet.",
  backupWorkerDescription: "Backup worker and retention readiness.",
  billingStatus: "Billing status",
  branchCount: "Branches",
  cloudBackup: "Cloud Backup",
  cloudBackupBackend: "External backup storage provider.",
  cloudBackupDescription: "Connect external backup storage.",
  configure: "Configure",
  configureStorage: "Configure Storage",
  createBackup: "Create Backup",
  currentPlan: "Current Plan",
  apiHealthDescription: "API response and platform route checks.",
  apiKeysBackend: "API key vault and rotation service.",
  apiKeysDescription: "Manage secure API access for integrations.",
  appHealthDescription: "Application runtime health endpoint.",
  accounting: "Accounting",
  accountingBackend: "Accounting provider API and mapping rules.",
  accountingDescription: "Sync sales, tax, and invoices to accounting tools.",
  automation: "Automation",
  databaseHealthDescription: "Database connection and query readiness.",
  encryption: "Encryption",
  emailService: "Email Service",
  emailServiceBackend: "Email service credentials and sender verification.",
  emailServiceDescription: "Send receipts, alerts, and platform emails.",
  ecommerceSync: "E-commerce Sync",
  ecommerceSyncBackend: "Commerce platform connectors.",
  ecommerceSyncDescription: "Sync online orders and products.",
  expiringSoon: "Expiring Soon",
  failed: "Failed",
  failedBackups: "Failed Backups",
  frequency: "Frequency",
  healthy: "Healthy",
  integrationsEmpty: "Integrations are not connected yet.",
  integrationsEmptySubtext: "Configure integration providers when backend services are ready.",
  integrationStatusNotConnected: "Integration status is not connected yet.",
  integrationsSubtitle: "Manage payment, messaging, accounting, backup, API, and automation integrations.",
  lastBackup: "Last Backup",
  lastChecked: "Last Checked",
  manual: "Manual",
  manualBackup: "Manual Backup",
  manualBackupDescription: "Create a manual platform backup when backup service is connected.",
  messaging: "Messaging",
  notificationService: "Notification Service",
  notificationServiceBackend: "Notification routing and alert preferences.",
  notificationServiceDescription: "Manage platform alerts.",
  notificationAlerts: "Notification alerts",
  payment: "Payment",
  paymentGateway: "Payment Gateway",
  paymentGatewayBackend: "Payment provider credentials and transaction status API.",
  paymentGatewayDescription: "Connect payment providers for online payments and transaction status.",
  planAnalyticsNotConnected: "Plan analytics is not connected yet.",
  planAnalyticsSubtitle: "Track plan usage, subscription status, upgrade opportunities, and platform revenue.",
  planDistribution: "Plan Distribution",
  planDistributionNotConnected: "Plan distribution is not connected yet.",
  planUsageDataEmpty: "No plan usage data yet.",
  planUsageDataEmptySubtext: "Connect subscription and business plan data to review usage here.",
  planUsageTable: "Plan Usage Table",
  qrPayment: "QR Payment",
  qrPaymentBackend: "QR payment provider and settlement callback.",
  qrPaymentDescription: "Connect QR payment channels for store checkout and reports.",
  queueJobs: "Queue / Jobs",
  queueJobsDescription: "Background job and queue health checks.",
  requiresSetup: "Requires Setup",
  responseTime: "Response Time",
  restore: "Restore",
  restoreHistory: "Restore History",
  restoreHistoryEmpty: "No restore history yet.",
  restoreHistoryEmptySubtext: "Restore history will appear after backup and restore services are connected.",
  restorePoint: "Restore Point",
  restorePoints: "Restore Points",
  retentionPeriod: "Retention period",
  runChecks: "Run Checks",
  scheduled: "Scheduled",
  searchBackupHistory: "Search backup history",
  searchIntegrations: "Search integrations",
  searchService: "Search service",
  service: "Service",
  serviceStatus: "Service Status",
  smsWhatsapp: "SMS / WhatsApp",
  smsWhatsappBackend: "Messaging provider credentials and templates.",
  smsWhatsappDescription: "Send customer notifications and membership messages.",
  storage: "Storage",
  storageProviderDescription: "Storage provider and usage checks.",
  storageStatus: "Storage Status",
  storageUsed: "Storage Used",
  successful: "Successful",
  syncWorkerDescription: "Offline queue and store sync worker checks.",
  systemChecks: "System Checks",
  systemHealthSubtitle: "Monitor app, database, API, sync, backup, and storage health.",
  terminals: "Terminals",
  testConnection: "Test connection",
  trialStores: "Trial Stores",
  upgradeCandidates: "Upgrade Candidates",
  upgradeNotes: "Upgrade notes",
  upgradeOpportunities: "Upgrade Opportunities",
  upgradeOpportunitiesEmpty: "Upgrade opportunities are not connected yet.",
  upgradeOpportunitiesEmptySubtext: "Connect usage limits, sales activity, and plan data to identify upgrade candidates.",
  usage: "Usage",
  webhooks: "Webhooks",
  webhooksBackend: "Webhook delivery worker and signing secrets.",
  webhooksDescription: "Send system events to external services.",
  whatThisIntegrationDoes: "What this integration will do",
  downloadBackup: "Download Backup",
});

Object.assign(copy.th, {
  actionCenterSubtitle: "ตรวจสอบการอนุมัติ ปัญหาซิงก์ การแจ้งเตือนร้าน ปัญหาแพ็กเกจ และคำเตือนระบบ",
  actionDataNotConnected: "ยังไม่ได้เชื่อมต่อข้อมูลรายการที่ต้องจัดการ",
  activeActors: "ผู้ใช้งานที่มีกิจกรรม",
  activityDataNotConnected: "ยังไม่ได้เชื่อมต่อข้อมูลกิจกรรม",
  addStore: "เพิ่มร้าน",
  approval: "การอนุมัติ",
  averagePerformanceScore: "คะแนนเฉลี่ย",
  backup: "สำรองข้อมูล",
  backupWarnings: "คำเตือนสำรองข้อมูล",
  backupWarningsDescription: "คำเตือนความพร้อมของการสำรองและกู้คืนข้อมูลจะแสดงที่นี่",
  category: "หมวดหมู่",
  critical: "ร้ายแรง",
  disabledNotConnected: "ยังไม่ได้เชื่อมต่อ",
  excellent: "ยอดเยี่ยม",
  excellentStores: "ร้านที่ยอดเยี่ยม",
  exportNotConnected: "ยังไม่ได้เชื่อมต่อการส่งออก",
  failedSync: "ซิงก์ล้มเหลว",
  failedSyncDescription: "ปัญหาการซิงก์และคิวออฟไลน์จะแสดงที่นี่",
  filterAll: "ทั้งหมด",
  good: "ดี",
  info: "ข้อมูล",
  lowStockAlerts: "แจ้งเตือนสต็อกต่ำ",
  lowStockAlertsDescription: "การแจ้งเตือนสต็อกจะแสดงเมื่อเชื่อมต่อข้อมูลสินค้าคงคลังแล้ว",
  maintenance: "บำรุงรักษา",
  noActionsNeedAttention: "ตอนนี้ไม่มีรายการที่ต้องจัดการ",
  noActionsNeedAttentionSubtext: "เชื่อมต่อข้อมูลการอนุมัติ ซิงก์ สต็อก แผน และสำรองข้อมูลเพื่อเปิดใช้งานหน้านี้",
  noIssues: "ไม่มีปัญหา",
  noRecentActivityYet: "ยังไม่มีกิจกรรมล่าสุด",
  noRecentActivityYetSubtext: "กิจกรรมล่าสุดจะแสดงหลังจากมีการบันทึกการทำงานของ Super Admin ธุรกิจ ผู้ใช้ แผน และระบบ",
  notConnected: "ยังไม่เชื่อมต่อ",
  offlineStores: "ร้านออฟไลน์",
  onlineStores: "ร้านออนไลน์",
  pendingApprovals: "รออนุมัติ",
  pendingApprovalsDescription: "คำขออนุมัติจะแสดงเมื่อเชื่อมต่อเวิร์กโฟลว์การอนุมัติแล้ว",
  performanceFilter: "ประสิทธิภาพ",
  planIssues: "ปัญหาแพ็กเกจ",
  planIssuesDescription: "ปัญหาการสมัครใช้งาน วันหมดอายุ และแพ็กเกจจะแสดงที่นี่",
  recentActivitySubtitle: "ตรวจสอบกิจกรรมแพลตฟอร์ม กิจกรรมร้าน ผู้ใช้ และบันทึกระบบ",
  resolved: "แก้ไขแล้ว",
  search: "ค้นหา",
  searchStores: "ค้นหาร้าน",
  security: "ความปลอดภัย",
  securityAlerts: "แจ้งเตือนความปลอดภัย",
  securityAlertsDescription: "การปฏิเสธสิทธิ์ การทำงานล้มเหลว และคำเตือนความปลอดภัยจากบันทึกตรวจสอบ",
  storeDataNotConnected: "ยังไม่ได้เชื่อมต่อข้อมูลร้าน",
  storeName: "ชื่อร้าน",
  storePerformanceNotConnected: "ยังไม่ได้เชื่อมต่อข้อมูลประสิทธิภาพร้าน",
  storePerformanceNotConnectedSubtext: "เชื่อมต่อยอดขาย กิจกรรม สต็อก และข้อมูลซิงก์เพื่อคำนวณคะแนน",
  storePerformancePageTitle: "ประสิทธิภาพร้าน",
  storePerformanceRows: "ประสิทธิภาพร้าน",
  storePerformanceSubtitle: "เปรียบเทียบยอดขาย สุขภาพร้าน สถานะซิงก์ แจ้งเตือนสต็อก และคะแนนประสิทธิภาพ",
  storesNeedingAttention: "ร้านที่ต้องดูแล",
  storesPageSubtitle: "ดูและจัดการร้าน สาขา เทมเพลต แพ็กเกจ และสถานะออนไลน์",
  storesPageTitle: "ร้านค้า",
  storesTableEmpty: "ยังไม่มีร้านที่เชื่อมต่อ",
  storesTableEmptySubtext: "ร้านจะแสดงที่นี่หลังจากสร้างธุรกิจและเชื่อมต่อข้อมูลร้านแล้ว",
  successfulEvents: "สำเร็จ",
  sync: "ซิงก์",
  syncIssueStores: "ร้านที่มีปัญหาซิงก์",
  stockAlertStores: "ร้านที่มีแจ้งเตือนสต็อก",
  templateDrafts: "เทมเพลตฉบับร่าง",
  templateDraftsDescription: "รายการความพร้อมของเทมเพลตฉบับร่างจากทะเบียน POS Template ปัจจุบัน",
  totalEvents: "กิจกรรมทั้งหมด",
  totalActivities: "กิจกรรมทั้งหมด",
  businessStoreEvents: "เหตุการณ์ธุรกิจ / ร้าน",
  errorFailedEvents: "ข้อผิดพลาด / ล้มเหลว",
  permissionEvents: "เหตุการณ์สิทธิ์",
  planEvents: "เหตุการณ์แผน",
  userEvents: "เหตุการณ์ผู้ใช้",
  activityLabel: "กิจกรรม",
  activityOverview: "ภาพรวมกิจกรรม",
  businessCreated: "สร้างธุรกิจแล้ว",
  exportActivity: "ส่งออกกิจกรรม",
  loginEvent: "เหตุการณ์เข้าสู่ระบบ",
  permissionUpdated: "อัปเดตสิทธิ์แล้ว",
  relatedContext: "บริบทที่เกี่ยวข้อง",
  safeChangeSummary: "สรุปการเปลี่ยนแปลงที่ปลอดภัย",
  storeCreated: "สร้างร้านแล้ว",
  systemEvent: "เหตุการณ์ระบบ",
  targetName: "ชื่อเป้าหมาย",
  targetType: "ประเภทเป้าหมาย",
  unknownActivity: "กิจกรรมไม่ทราบประเภท",
  userCreated: "สร้างผู้ใช้แล้ว",
  viewAuditLog: "ดูบันทึกตรวจสอบ",
  totalStores: "ร้านทั้งหมด",
  totalOpenActions: "รายการเปิดทั้งหมด",
  viewDetails: "ดูรายละเอียด",
  warning: "คำเตือน",
  api: "API",
  apiKeys: "API Keys",
  autoBackup: "สำรองอัตโนมัติ",
  availableIntegrations: "การเชื่อมต่อที่มี",
  backupDestination: "ปลายทางสำรองข้อมูล",
  backupFilter: "สำรองข้อมูล",
  backupRestoreSubtitle: "จัดการความพร้อมสำรองข้อมูล เวิร์กโฟลว์กู้คืน ปลายทางจัดเก็บ และประวัติกู้คืน",
  backupServiceNotConnected: "ยังไม่ได้เชื่อมต่อบริการสำรองข้อมูล",
  backupSettings: "ตั้งค่าสำรองข้อมูล",
  backupStatus: "สถานะสำรองข้อมูล",
  backupStorage: "พื้นที่สำรองข้อมูล",
  backupStorageNotConnected: "ยังไม่ได้เชื่อมต่อพื้นที่สำรองข้อมูล",
  backupWorkerDescription: "ความพร้อมของระบบสำรองข้อมูลและการเก็บรักษาข้อมูล",
  billingStatus: "สถานะชำระเงิน",
  branchCount: "สาขา",
  cloudBackup: "สำรองข้อมูลคลาวด์",
  cloudBackupBackend: "ผู้ให้บริการพื้นที่สำรองข้อมูลภายนอก",
  cloudBackupDescription: "เชื่อมต่อพื้นที่สำรองข้อมูลภายนอก",
  configure: "ตั้งค่า",
  configureStorage: "ตั้งค่าพื้นที่จัดเก็บ",
  createBackup: "สร้างข้อมูลสำรอง",
  currentPlan: "แพ็กเกจปัจจุบัน",
  apiHealthDescription: "ตรวจการตอบสนองของ API และเส้นทางแพลตฟอร์ม",
  apiKeysBackend: "ระบบจัดเก็บและหมุนเวียน API key",
  apiKeysDescription: "จัดการการเข้าถึง API สำหรับการเชื่อมต่ออย่างปลอดภัย",
  appHealthDescription: "ปลายทางตรวจสถานะการทำงานของแอป",
  accounting: "บัญชี",
  accountingBackend: "API ผู้ให้บริการบัญชีและกฎการแมปข้อมูล",
  accountingDescription: "ซิงก์ยอดขาย ภาษี และใบแจ้งหนี้ไปยังระบบบัญชี",
  automation: "อัตโนมัติ",
  databaseHealthDescription: "ตรวจการเชื่อมต่อฐานข้อมูลและความพร้อมการ query",
  encryption: "การเข้ารหัส",
  emailService: "บริการอีเมล",
  emailServiceBackend: "ข้อมูลเชื่อมต่ออีเมลและการยืนยันผู้ส่ง",
  emailServiceDescription: "ส่งใบเสร็จ แจ้งเตือน และอีเมลแพลตฟอร์ม",
  ecommerceSync: "ซิงก์ E-commerce",
  ecommerceSyncBackend: "ตัวเชื่อมต่อแพลตฟอร์มร้านค้าออนไลน์",
  ecommerceSyncDescription: "ซิงก์ออเดอร์ออนไลน์และสินค้า",
  expiringSoon: "ใกล้หมดอายุ",
  failed: "ล้มเหลว",
  failedBackups: "สำรองล้มเหลว",
  frequency: "ความถี่",
  healthy: "ปกติ",
  integrationsEmpty: "ยังไม่ได้เชื่อมต่อ Integrations",
  integrationsEmptySubtext: "ตั้งค่าผู้ให้บริการเชื่อมต่อเมื่อ backend พร้อม",
  integrationStatusNotConnected: "ยังไม่ได้เชื่อมต่อสถานะการเชื่อมต่อ",
  integrationsSubtitle: "จัดการการเชื่อมต่อชำระเงิน ข้อความ บัญชี สำรองข้อมูล API และระบบอัตโนมัติ",
  lastBackup: "สำรองล่าสุด",
  lastChecked: "ตรวจล่าสุด",
  manual: "ด้วยตนเอง",
  manualBackup: "สำรองด้วยตนเอง",
  manualBackupDescription: "สร้างข้อมูลสำรองแพลตฟอร์มด้วยตนเองเมื่อเชื่อมต่อบริการสำรองข้อมูลแล้ว",
  messaging: "ข้อความ",
  notificationService: "บริการแจ้งเตือน",
  notificationServiceBackend: "ระบบกำหนดเส้นทางแจ้งเตือนและการตั้งค่าการแจ้งเตือน",
  notificationServiceDescription: "จัดการการแจ้งเตือนของแพลตฟอร์ม",
  notificationAlerts: "แจ้งเตือน",
  payment: "ชำระเงิน",
  paymentGateway: "ช่องทางชำระเงิน",
  paymentGatewayBackend: "ข้อมูลเชื่อมต่อผู้ให้บริการชำระเงินและ API สถานะธุรกรรม",
  paymentGatewayDescription: "เชื่อมต่อผู้ให้บริการชำระเงินออนไลน์และสถานะธุรกรรม",
  planAnalyticsNotConnected: "ยังไม่ได้เชื่อมต่อการวิเคราะห์แพ็กเกจ",
  planAnalyticsSubtitle: "ติดตามการใช้งานแพ็กเกจ สถานะสมาชิก โอกาสอัปเกรด และความพร้อมรายได้แพลตฟอร์ม",
  planDistribution: "สัดส่วนแพ็กเกจ",
  planDistributionNotConnected: "ยังไม่ได้เชื่อมต่อสัดส่วนแพ็กเกจ",
  planUsageDataEmpty: "ยังไม่มีข้อมูลการใช้งานแพ็กเกจ",
  planUsageDataEmptySubtext: "เชื่อมต่อข้อมูลสมาชิกและแพ็กเกจธุรกิจเพื่อดูการใช้งานที่นี่",
  planUsageTable: "ตารางการใช้งานแพ็กเกจ",
  qrPayment: "ชำระเงิน QR",
  qrPaymentBackend: "ผู้ให้บริการ QR Payment และ callback การชำระเงิน",
  qrPaymentDescription: "เชื่อมต่อช่องทาง QR Payment สำหรับหน้าขายและรายงานร้าน",
  queueJobs: "คิว / งานระบบ",
  queueJobsDescription: "ตรวจสุขภาพงานเบื้องหลังและคิวงาน",
  requiresSetup: "ต้องตั้งค่า",
  responseTime: "เวลาตอบสนอง",
  restore: "กู้คืน",
  restoreHistory: "ประวัติกู้คืน",
  restoreHistoryEmpty: "ยังไม่มีประวัติกู้คืน",
  restoreHistoryEmptySubtext: "ประวัติกู้คืนจะแสดงหลังจากเชื่อมต่อบริการสำรองและกู้คืน",
  restorePoint: "จุดกู้คืน",
  restorePoints: "จุดกู้คืน",
  retentionPeriod: "ระยะเวลาเก็บข้อมูล",
  runChecks: "รันการตรวจสอบ",
  scheduled: "ตามกำหนด",
  searchBackupHistory: "ค้นหาประวัติสำรอง",
  searchIntegrations: "ค้นหาการเชื่อมต่อ",
  searchService: "ค้นหาบริการ",
  service: "บริการ",
  serviceStatus: "สถานะบริการ",
  smsWhatsapp: "SMS / WhatsApp",
  smsWhatsappBackend: "ข้อมูลเชื่อมต่อผู้ให้บริการข้อความและเทมเพลต",
  smsWhatsappDescription: "ส่งข้อความแจ้งเตือนลูกค้าและสมาชิก",
  storage: "พื้นที่จัดเก็บ",
  storageProviderDescription: "ตรวจผู้ให้บริการพื้นที่จัดเก็บและการใช้งาน",
  storageStatus: "สถานะพื้นที่จัดเก็บ",
  storageUsed: "พื้นที่ใช้งาน",
  successful: "สำเร็จ",
  syncWorkerDescription: "ตรวจคิวออฟไลน์และระบบซิงก์ร้าน",
  systemChecks: "การตรวจระบบ",
  systemHealthSubtitle: "ตรวจสอบสถานะแอป ฐานข้อมูล API ซิงก์ สำรองข้อมูล และพื้นที่จัดเก็บ",
  terminals: "เครื่องขาย",
  testConnection: "ทดสอบการเชื่อมต่อ",
  trialStores: "ร้านทดลองใช้",
  upgradeCandidates: "ร้านที่อาจอัปเกรด",
  upgradeNotes: "หมายเหตุอัปเกรด",
  upgradeOpportunities: "โอกาสอัปเกรด",
  upgradeOpportunitiesEmpty: "ยังไม่ได้เชื่อมต่อโอกาสอัปเกรด",
  upgradeOpportunitiesEmptySubtext: "เชื่อมต่อขีดจำกัดการใช้งาน ยอดขาย และแพ็กเกจเพื่อระบุร้านที่ควรอัปเกรด",
  usage: "การใช้งาน",
  webhooks: "Webhooks",
  webhooksBackend: "ระบบส่ง webhook และ signing secret",
  webhooksDescription: "ส่ง event ของระบบไปยังบริการภายนอก",
  whatThisIntegrationDoes: "สิ่งที่การเชื่อมต่อนี้จะทำ",
  downloadBackup: "ดาวน์โหลดข้อมูลสำรอง",
});

type PosTemplateDefinition = {
  defaultPermissions: Record<string, string[]>;
  features: string[];
  integration: Array<{ checklist: string[]; key: string; related: string[]; status: string; title: string; whatToFix: string[] }>;
  key: string;
  modules: string[];
  name: string;
  planLocks: string[];
  reports: string[];
  settingsDefaults: string[];
  status: string;
  summary: string;
};

const posTemplateDefinitions: PosTemplateDefinition[] = [
  {
    key: "mini-mart",
    name: "EGO POS for Mini Mart",
    status: "Active / Ready",
    summary: "POS, Products, Inventory, Purchasing, Reports",
    modules: ["Dashboard", "POS", "Products", "Inventory", "Purchasing", "Suppliers", "Customers", "Membership", "Promotions", "Reports", "Settings"],
    features: ["Barcode scanning", "Product images", "Stock control", "Supplier purchasing", "Membership points", "Promotions", "Expiry support", "Multi-currency"],
    planLocks: ["Free plan: core POS and product controls", "Pro plan: purchasing, suppliers, membership, promotions, advanced reports", "Trial: full template preview where enabled"],
    defaultPermissions: {
      Owner: ["All Mini Mart modules", "Settings", "Reports", "Plan controls"],
      Manager: ["POS", "Products", "Inventory", "Purchasing", "Suppliers", "Customers", "Reports"],
      Cashier: ["POS", "Customers", "Limited product lookup"],
    },
    reports: ["Sales", "Products & Stock", "Customers & Membership", "Suppliers & Purchasing", "Promotions"],
    settingsDefaults: ["Default modules", "Default currency", "Receipt settings", "QR/payment behavior", "Customer display behavior", "Default report layout"],
    integration: [
      { key: "modules", title: "Modules Integration", status: "Connected", checklist: ["Mini Mart modules are defined", "Live dashboard routes exist", "Store back office uses Mini Mart shell"], whatToFix: [], related: ["Dashboard", "Products", "Inventory"] },
      { key: "pos", title: "POS Workflow Integration", status: "Connected", checklist: ["POS route exists", "Products connect to POS", "Sales write stock impact"], whatToFix: [], related: ["POS", "Products", "Inventory"] },
      { key: "inventory", title: "Inventory Integration", status: "Connected", checklist: ["Inventory route exists", "Stock movement screens exist", "Low stock and expiry controls exist"], whatToFix: [], related: ["Inventory", "Reports"] },
      { key: "purchasing", title: "Purchasing Integration", status: "Connected", checklist: ["Purchasing route exists", "Suppliers route exists", "Receiving workflow exists"], whatToFix: [], related: ["Purchasing", "Suppliers", "Inventory"] },
      { key: "customers", title: "Customer/Membership Integration", status: "Partial", checklist: ["Customers route exists", "Membership route exists", "Points and credit controls need operational verification"], whatToFix: ["Verify loyalty point posting from POS", "Verify credit warnings in POS"], related: ["Customers", "Membership", "POS"] },
      { key: "promotions", title: "Promotions Integration", status: "Partial", checklist: ["Promotions route exists", "Promotion reporting exists", "Stacking and priority need verification"], whatToFix: ["Verify promotion stacking rules", "Verify discount reversal on refund/void"], related: ["Promotions", "POS", "Reports"] },
      { key: "reports", title: "Reports Integration", status: "Connected", checklist: ["Reports route exists", "Mini Mart report groups are defined", "Export remains available"], whatToFix: [], related: ["Reports"] },
      { key: "plans", title: "Plan Lock Integration", status: "Need Review", checklist: ["Plan feature matrix exists", "Template-specific lock isolation needs review"], whatToFix: ["Verify Mini Mart locks do not apply to draft templates"], related: ["Plans & Features"] },
      { key: "permissions", title: "Permission Integration", status: "Need Review", checklist: ["Store roles exist", "Template-specific default permissions need review"], whatToFix: ["Verify role defaults when creating a Mini Mart store"], related: ["Users", "Roles"] },
      { key: "settings", title: "Settings Integration", status: "Partial", checklist: ["Settings route exists", "Template default settings are listed", "Apply-to-store behavior is protected"], whatToFix: ["Keep live GO BOX settings unchanged unless explicitly applied"], related: ["Settings"] },
    ],
  },
  {
    key: "restaurant",
    name: "EGO POS for Restaurant",
    status: "Draft",
    summary: "Tables, Menu, Orders, Kitchen",
    modules: ["Tables", "Menu", "Orders", "Kitchen", "POS", "Customers", "Reports", "Settings"],
    features: ["Table management", "Kitchen queue", "Menu modifiers", "Dine-in/takeaway", "Split bill", "Service charge"],
    planLocks: ["Draft Free/Pro rules need setup", "Kitchen and table features planned for Pro"],
    defaultPermissions: { Owner: ["All restaurant modules"], Manager: ["Tables", "Orders", "Kitchen", "Reports"], Cashier: ["POS", "Orders"] },
    reports: ["Sales", "Menu Items", "Table Turnover", "Kitchen Orders", "Staff/Cashier"],
    settingsDefaults: ["Table zones", "Service charge", "Kitchen printer defaults", "Receipt defaults"],
    integration: [],
  },
  {
    key: "pharmacy",
    name: "EGO POS for Pharmacy",
    status: "Draft",
    summary: "Medicines, Expiry, Batch, Inventory",
    modules: ["Products / Medicines", "Expiry", "Batch", "Inventory", "POS", "Suppliers", "Reports", "Settings"],
    features: ["Expiry tracking", "Medicine categories", "Batch/lot", "Supplier purchase", "Controlled item warning"],
    planLocks: ["Draft Free/Pro rules need setup", "Batch and controlled-item warnings planned for Pro"],
    defaultPermissions: { Owner: ["All pharmacy modules"], Manager: ["Medicines", "Inventory", "Suppliers", "Reports"], Cashier: ["POS", "Medicine lookup"] },
    reports: ["Sales", "Expiry", "Batch", "Inventory", "Supplier"],
    settingsDefaults: ["Expiry warning defaults", "Batch tracking defaults", "Medicine category defaults"],
    integration: [],
  },
  {
    key: "clothes-sales",
    name: "EGO POS for Clothes Sales",
    status: "Draft",
    summary: "Products, Sizes / Colors, Inventory",
    modules: ["Products", "Sizes / Colors", "Inventory", "POS", "Customers", "Promotions", "Reports"],
    features: ["Size/color variants", "Product images", "Barcode labels", "Promotions", "Customer history"],
    planLocks: ["Draft Free/Pro rules need setup", "Variant controls planned for Pro"],
    defaultPermissions: { Owner: ["All clothes sales modules"], Manager: ["Products", "Inventory", "Promotions", "Reports"], Cashier: ["POS", "Customers"] },
    reports: ["Sales", "Products", "Sizes / Colors", "Inventory", "Promotions"],
    settingsDefaults: ["Variant defaults", "Barcode label defaults", "POS image display defaults"],
    integration: [],
  },
  {
    key: "clothes-rental",
    name: "EGO POS for Clothes Rental",
    status: "Draft",
    summary: "Rental Calendar, Booking, Deposit",
    modules: ["Rental Calendar", "Booking", "Deposit", "Return", "Damage Fee", "Customers", "Reports"],
    features: ["Rental date range", "Deposit", "Return status", "Damage fee", "Late fee"],
    planLocks: ["Draft Free/Pro rules need setup", "Rental calendar planned for Pro"],
    defaultPermissions: { Owner: ["All rental modules"], Manager: ["Booking", "Return", "Damage Fee", "Reports"], Cashier: ["Booking", "Customers"] },
    reports: ["Rental Sales", "Bookings", "Returns", "Damage Fees", "Customer History"],
    settingsDefaults: ["Deposit defaults", "Late fee defaults", "Return window defaults"],
    integration: [],
  },
  {
    key: "wholesale",
    name: "EGO POS for Wholesale",
    status: "Draft",
    summary: "Bulk Orders, Price Tiers, Credit",
    modules: ["Bulk Orders", "Price Tiers", "Customer Credit", "Inventory", "Suppliers", "Reports"],
    features: ["Bulk orders", "Price tiers", "Customer credit", "Supplier purchasing", "Reorder support"],
    planLocks: ["Draft Free/Pro rules need setup", "Bulk pricing and credit planned for Pro"],
    defaultPermissions: { Owner: ["All wholesale modules"], Manager: ["Orders", "Credit", "Inventory", "Reports"], Cashier: ["Orders", "Customers"] },
    reports: ["Sales", "Bulk Orders", "Customer Credit", "Inventory", "Supplier"],
    settingsDefaults: ["Default price tier", "Credit threshold", "Bulk order defaults"],
    integration: [],
  },
  {
    key: "online-sales",
    name: "EGO POS for Online Sales",
    status: "Draft",
    summary: "Orders, Delivery, Payment Tracking",
    modules: ["Orders", "Customer Address", "Delivery", "Payment Tracking", "Products", "Reports"],
    features: ["Delivery tracking", "Customer address", "Payment status", "Online order status"],
    planLocks: ["Draft Free/Pro rules need setup", "Delivery and payment tracking planned for Pro"],
    defaultPermissions: { Owner: ["All online sales modules"], Manager: ["Orders", "Delivery", "Reports"], Cashier: ["Orders"] },
    reports: ["Orders", "Delivery", "Payments", "Products", "Customers"],
    settingsDefaults: ["Delivery defaults", "Payment status defaults", "Order notification defaults"],
    integration: [],
  },
  {
    key: "event-rental",
    name: "EGO POS for Event Rental",
    status: "Draft",
    summary: "Event Booking, Rental Items, Deposit",
    modules: ["Event Booking", "Rental Items", "Deposit", "Return Schedule", "Damage/Late Fee", "Customers", "Reports"],
    features: ["Event booking", "Rental items", "Return schedule", "Damage fee", "Late fee"],
    planLocks: ["Draft Free/Pro rules need setup", "Event booking planned for Pro"],
    defaultPermissions: { Owner: ["All event rental modules"], Manager: ["Booking", "Rental Items", "Return Schedule", "Reports"], Cashier: ["Booking", "Customers"] },
    reports: ["Bookings", "Rental Items", "Returns", "Fees", "Customers"],
    settingsDefaults: ["Booking defaults", "Deposit defaults", "Return schedule defaults"],
    integration: [],
  },
];

const templateDefinitions = posTemplateDefinitions;

const featureRows = [
  ["Products limit", "500", "Unlimited", "Unlimited", "Custom"],
  ["Bills per month", "1,000", "Unlimited", "Unlimited", "Custom"],
  ["Users/staff limit", "2", "Unlimited", "5", "Custom"],
  ["Branch limit", "1", "Multi branch", "Multi branch", "Custom"],
  ["Inventory", "Basic", "Full", "Full", "Custom"],
  ["Purchasing", "Locked", "Enabled", "Enabled", "Custom"],
  ["Suppliers", "View only", "Enabled", "Enabled", "Custom"],
  ["Membership", "Locked", "Enabled", "Enabled", "Custom"],
  ["Promotions", "Limited", "Enabled", "Enabled", "Custom"],
  ["Advanced Reports", "Locked", "Enabled", "Enabled", "Custom"],
  ["Export", "Locked", "Enabled", "Enabled", "Custom"],
];

const platformSettings = [
  "Platform name",
  "Platform logo",
  "Default language",
  "Default currency",
  "Default country",
  "Default plan",
  "Default free plan limits",
  "Default business template",
  "Maintenance mode",
  "Ads / watermark",
  "Cloud backup",
  "System email/contact",
  "Localization defaults",
];

const platformRoles = ["Super Admin", "Support Admin", "Billing Admin", "Template Manager"];
const storeRoles = ["Owner", "Manager", "Cashier"];

function useCenterCopy() {
  const [locale, setLocale] = useState<SupportedLocale>("en");

  useEffect(() => {
    setLocale(readClientLocale("en"));
    const handler = () => setLocale(readClientLocale("en"));
    window.addEventListener(LOCALE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handler);
  }, []);

  return { c: copy[locale], locale, setLocale: persistClientLocale };
}

function money(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";
}

function statusClass(status?: string | null) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized.includes("suspend") || normalized.includes("closed") || normalized.includes("failed") || normalized.includes("critical")) {
    return "border-[#EF4444]/40 bg-[#EF4444]/10 text-[#F8FAFC]";
  }
  if (normalized.includes("draft") || normalized.includes("soon") || normalized.includes("warning") || normalized.includes("denied")) {
    return "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#F8FAFC]";
  }
  if (normalized.includes("security")) {
    return "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#F8FAFC]";
  }
  return "border-[#5EEAD4] bg-[#5EEAD4]/[0.12] text-[#5EEAD4]";
}

function CenterDrawer({
  backLabel,
  children,
  footer,
  onClose,
  onBack,
  title,
}: {
  children: React.ReactNode;
  backLabel?: string;
  footer?: React.ReactNode;
  onBack?: () => void;
  onClose: () => void;
  title: string;
}) {
  const { c } = useCenterCopy();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-50 flex w-full max-w-[100vw] overflow-hidden bg-[#020617] text-[#F8FAFC] shadow-2xl lg:left-[var(--center-sidebar-width)] lg:w-[calc(100vw_-_var(--center-sidebar-width))]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-[#334155] bg-[#0F172A]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
          <div className="min-w-0">
            <button
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#5EEAD4] transition hover:text-[#F8FAFC]"
              onClick={onClose}
              type="button"
            >
              <ArrowLeft className="size-4" />
              {c.backToCenter}
            </button>
            <h2 className="truncate text-2xl font-semibold tracking-normal">{title}</h2>
          </div>
          <button
            aria-label={c.close}
            className="grid size-10 shrink-0 place-items-center rounded-md border border-[#334155] text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 md:px-8">{children}</div>
        <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
          {footer ?? (
            <button className="rounded-md border border-[#334155] px-4 py-2 text-sm font-semibold text-[#CBD5E1]" onClick={onClose} type="button">
              {c.close}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value?: string | null }) {
  return <span className={cn("rounded-md border px-2 py-1 text-xs font-semibold", statusClass(value))}>{value ?? "-"}</span>;
}

function templateStatusLabel(status: string, c: CenterCopy) {
  if (status.toLowerCase().includes("ready")) {
    return `${c.ready} / ${c.active}`;
  }
  if (status.toLowerCase().includes("draft")) {
    return c.draft;
  }
  return status;
}

function posTemplateName(template: PosTemplateDefinition, c: CenterCopy) {
  const map: Record<string, string> = {
    "clothes-rental": c.posTemplateClothesRental,
    "clothes-sales": c.posTemplateClothesSales,
    "event-rental": c.posTemplateEventRental,
    "mini-mart": c.posTemplateMiniMart,
    "online-sales": c.posTemplateOnlineSales,
    pharmacy: c.posTemplatePharmacy,
    restaurant: c.posTemplateRestaurant,
    wholesale: c.posTemplateWholesale,
  };
  return map[template.key] ?? template.name;
}

function normalizePosTemplateKey(value?: string | null) {
  const normalized = String(value ?? "mini-mart").trim().toLowerCase().replace(/_/g, "-");
  const aliases: Record<string, string> = {
    clothes: "clothes-sales",
    clothing: "clothes-sales",
    "clothes-sale": "clothes-sales",
    "event-rentals": "event-rental",
    minimart: "mini-mart",
    "mini-marts": "mini-mart",
    "online-sale": "online-sales",
  };
  return aliases[normalized] ?? normalized;
}

function posTemplateNameFromKey(value: string | null | undefined, c: CenterCopy) {
  const key = normalizePosTemplateKey(value);
  const template = templateDefinitions.find((item) => item.key === key);
  return template ? posTemplateName(template, c) : value || c.posTemplateMiniMart;
}

function integrationStatusLabel(status: string, c: CenterCopy) {
  const normalized = status.toLowerCase();
  if (normalized.includes("connected")) return c.connected;
  if (normalized.includes("partial")) return c.partial;
  if (normalized.includes("setup")) return c.needSetup;
  if (normalized.includes("review")) return c.needReview;
  if (normalized.includes("verified")) return c.notVerified;
  return status;
}

function KpiCard({ label, value, onClick }: { label: string; onClick: () => void; value: string | number }) {
  return (
    <button
      className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
      onClick={onClick}
      type="button"
    >
      <div className="min-h-8 text-[11px] font-semibold uppercase leading-snug tracking-wide text-[#94A3B8]">{label}</div>
      <div className="mt-2 truncate text-2xl font-semibold text-[#F8FAFC]">{value}</div>
    </button>
  );
}

function ActionCard({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 place-items-center rounded-md border border-[#5EEAD4]/35 bg-[#5EEAD4]/[0.12] text-[#5EEAD4]">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 text-sm font-semibold leading-snug text-[#F8FAFC]">{label}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[#94A3B8]" />
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#475569] bg-[#111827] p-6 text-sm text-[#CBD5E1]">
      {text}
    </div>
  );
}

type CommandDatePreset = "today" | "7d" | "30d" | "month";
type CommandActivityFilter = "all" | "sales" | "login" | "plan" | "template" | "permission" | "error";

type StorePerformanceRow = {
  averageBillLak: number;
  billCount: number;
  business: CenterBusiness;
  lastActive?: string;
  planName: string;
  salesLak: number;
  score: number | null;
  stockAlerts: number | null;
  syncStatus: "synced" | "unknown";
  templateName: string;
  todayBillCount: number;
  todaySalesLak: number;
};

function dateRangeForPreset(preset: CommandDatePreset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "today") return { from: today, to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) };
  if (preset === "7d") return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) };
  if (preset === "month") return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) };
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29), to: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) };
}

function inDateRange(date: string | undefined, preset: CommandDatePreset) {
  if (!date) return false;
  const value = new Date(date);
  const range = dateRangeForPreset(preset);
  return value >= range.from && value < range.to;
}

function formatCompactMoney(value: number) {
  if (!value) return "0 LAK";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M LAK`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}K LAK`;
  return `${Math.round(value)} LAK`;
}

function salesAmount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function salesForPreset(commandDashboard: CommandDashboardData | undefined, preset: CommandDatePreset) {
  const salesByDay = (commandDashboard?.salesByDay ?? []).filter((row) => inDateRange(row.date, preset));
  const salesByBusiness = new Map<string, { billCount: number; salesLak: number; todayBillCount: number; todaySalesLak: number }>();
  for (const row of commandDashboard?.salesByBusiness ?? []) {
    salesByBusiness.set(row.businessId, {
      billCount: salesAmount(row.billCount),
      salesLak: salesAmount(row.salesLak),
      todayBillCount: salesAmount(row.todayBillCount),
      todaySalesLak: salesAmount(row.todaySalesLak),
    });
  }
  return { salesByBusiness, salesByDay };
}

function latestActivityForBusiness(logs: StoreActivityLog[], businessId: string) {
  return logs
    .filter((log) => log.businessId === businessId)
    .map((log) => log.occurredAt ?? log.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function storeScore(row: Pick<StorePerformanceRow, "billCount" | "lastActive" | "salesLak" | "stockAlerts" | "syncStatus">) {
  const hasSales = row.salesLak > 0 || row.billCount > 0;
  const hasActivity = Boolean(row.lastActive);
  if (!hasSales && !hasActivity && row.stockAlerts === null && row.syncStatus === "unknown") return null;
  let score = 35;
  if (row.salesLak > 0) score += 25;
  if (row.billCount > 0) score += Math.min(20, row.billCount * 2);
  if (hasActivity) score += 15;
  if (row.syncStatus === "synced") score += 10;
  if ((row.stockAlerts ?? 0) > 0) score -= Math.min(20, (row.stockAlerts ?? 0) * 4);
  return Math.max(1, Math.min(100, Math.round(score)));
}

function scoreTone(score: number | null) {
  if (score === null) return "border-[#475569] bg-[#1E293B] text-[#94A3B8]";
  if (score >= 85) return "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]";
  if (score >= 65) return "border-[#38BDF8]/30 bg-[#38BDF8]/10 text-[#38BDF8]";
  if (score >= 40) return "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]";
  return "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]";
}

function buildStorePerformanceRows(data: CenterData, preset: CommandDatePreset, c: CenterCopy) {
  const { salesByBusiness } = salesForPreset(data.commandDashboard, preset);
  return data.businesses.map((business) => {
    const sales = salesByBusiness.get(business.id) ?? { billCount: 0, salesLak: 0, todayBillCount: 0, todaySalesLak: 0 };
    const lastActive = latestActivityForBusiness(data.storeActivityLogs, business.id);
    const row = {
      averageBillLak: sales.billCount > 0 ? sales.salesLak / sales.billCount : 0,
      billCount: sales.billCount,
      business,
      lastActive,
      planName: business.plan?.planName ?? c.free,
      salesLak: sales.salesLak,
      score: null,
      stockAlerts: null,
      syncStatus: data.storeActivityLogs.some((log) => log.businessId === business.id && log.syncedAt) ? "synced" as const : "unknown" as const,
      templateName: posTemplateNameFromKey(business.businessTemplateKey, c),
      todayBillCount: sales.todayBillCount,
      todaySalesLak: sales.todaySalesLak,
    };
    return { ...row, score: storeScore(row) };
  });
}

function dashboardPanelClass(extra = "") {
  return cn("min-w-0 max-w-full overflow-hidden rounded-lg border border-[#334155] bg-[#111827] p-4", extra);
}

function CommandSectionTitle({ action, subtitle, title }: { action?: React.ReactNode; subtitle?: string; title: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[#F8FAFC]">{title}</h2>
        {subtitle ? <p className="mt-1 text-xs text-[#94A3B8]">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  const { c } = useCenterCopy();
  return (
    <span className={cn("inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold", scoreTone(score))}>
      {score === null ? c.notEnoughData : `${score}/100`}
    </span>
  );
}

function CommandKpiCard({
  label,
  onOpen,
  trend = "neutral",
  value,
}: {
  label: string;
  onOpen?: () => void;
  trend?: "up" | "down" | "neutral";
  value: string;
}) {
  const { c } = useCenterCopy();
  const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendClass = trend === "up" ? "text-[#22C55E]" : trend === "down" ? "text-[#EF4444]" : "text-[#94A3B8]";
  const Component = onOpen ? "button" : "div";
  return (
    <Component
      className={cn(
        "min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4 text-left",
        onOpen && "transition hover:border-[#5EEAD4] hover:bg-[#1E293B]",
      )}
      onClick={onOpen}
      type={onOpen ? "button" : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[11px] font-semibold uppercase leading-snug tracking-wide text-[#94A3B8]">{label}</div>
        <TrendIcon className={cn("size-4 shrink-0", trendClass)} />
      </div>
      <div className="mt-3 truncate text-2xl font-semibold text-[#F8FAFC]">{value}</div>
      <div className="mt-2 text-xs text-[#64748B]">{c.vsPreviousPeriod}</div>
      <div className="mt-3 flex h-7 items-end gap-1" aria-hidden="true">
        {[35, 52, 42, 68, 58, 76].map((height, index) => (
          <span className="w-full rounded-t-sm bg-[#5EEAD4]/20" key={`${height}-${index}`} style={{ height: `${height}%` }} />
        ))}
      </div>
    </Component>
  );
}

function PlatformSalesOverview({ data, onOpen, preset }: { data: CenterData; onOpen: () => void; preset: CommandDatePreset }) {
  const { c } = useCenterCopy();
  const { salesByDay } = salesForPreset(data.commandDashboard, preset);
  const totalSales = salesByDay.reduce((sum, row) => sum + row.salesLak, 0);
  const totalBills = salesByDay.reduce((sum, row) => sum + row.billCount, 0);
  const maxSales = Math.max(...salesByDay.map((row) => row.salesLak), 0);
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.platformSalesOverview} subtitle={data.commandDashboard?.status === "unavailable" ? c.emptyNoSalesData : c.totalPlatformSales} />
      {salesByDay.length ? (
        <button className="grid w-full min-w-0 gap-4 text-left" onClick={onOpen} type="button">
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniMetric label={c.salesAmount} value={formatCompactMoney(totalSales)} />
            <MiniMetric label={c.billCount} value={String(totalBills)} />
            <MiniMetric label={c.averageBill} value={formatCompactMoney(totalBills ? totalSales / totalBills : 0)} />
          </div>
          <div className="flex h-48 min-w-0 items-end gap-2 overflow-hidden rounded-lg border border-[#334155] bg-[#020617] p-3">
            {salesByDay.map((row) => (
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={row.date}>
                <div className="w-full rounded-t-md bg-[#5EEAD4]" style={{ height: `${Math.max(8, (row.salesLak / maxSales) * 100)}%` }} />
                <span className="max-w-full truncate text-[10px] text-[#94A3B8]">{row.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </button>
      ) : (
        <EmptyState text={c.emptyNoSalesData} />
      )}
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#334155] bg-[#1E293B] p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="mt-2 truncate text-lg font-semibold text-[#F8FAFC]">{value}</div>
    </div>
  );
}

function TopStoresBySales({ rows, onOpen }: { onOpen: (row: StorePerformanceRow) => void; rows: StorePerformanceRow[] }) {
  const { c } = useCenterCopy();
  const topRows = [...rows].filter((row) => row.salesLak > 0).sort((a, b) => b.salesLak - a.salesLak).slice(0, 10);
  const max = Math.max(...topRows.map((row) => row.salesLak), 0);
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.topStoresBySales} />
      {topRows.length ? (
        <div className="grid gap-3">
          {topRows.map((row, index) => (
            <button className="grid w-full min-w-0 gap-2 rounded-lg border border-[#334155] bg-[#020617] p-3 text-left transition hover:border-[#5EEAD4]" key={row.business.id} onClick={() => onOpen(row)} type="button">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[#F8FAFC]">#{index + 1} {row.business.name}</div>
                  <div className="mt-1 text-xs text-[#94A3B8]">{row.templateName} | {row.planName}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#F8FAFC]">{formatCompactMoney(row.salesLak)}</div>
                  <div className="text-xs text-[#94A3B8]">{row.billCount} {c.bills}</div>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#1E293B]">
                <div className="h-full rounded-full bg-[#5EEAD4]" style={{ width: `${Math.max(4, (row.salesLak / max) * 100)}%` }} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState text={c.emptyNoSalesData} />
      )}
    </section>
  );
}

function StorePerformanceTable({ onOpen, rows }: { onOpen: (row: StorePerformanceRow) => void; rows: StorePerformanceRow[] }) {
  const { c } = useCenterCopy();
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.storePerformance} subtitle={c.scoreHelp} />
      {rows.length ? (
        <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-sm">
              <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                <tr>
                  {[c.store, c.template, c.plan, c.todaySales, c.ordersBills, c.averageBill, c.stockAlerts, c.syncStatus, c.lastActive, c.performanceScore].map((header) => (
                    <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.business.id} onClick={() => onOpen(row)}>
                    <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.business.name}</td>
                    <td className="px-4 py-3">{row.templateName}</td>
                    <td className="px-4 py-3">{row.planName}</td>
                    <td className="px-4 py-3">{formatCompactMoney(row.todaySalesLak)}</td>
                    <td className="px-4 py-3">{row.billCount}</td>
                    <td className="px-4 py-3">{formatCompactMoney(row.averageBillLak)}</td>
                    <td className="px-4 py-3">{row.stockAlerts === null ? "-" : row.stockAlerts}</td>
                    <td className="px-4 py-3"><StatusBadge value={row.syncStatus === "synced" ? "synced" : c.noData} /></td>
                    <td className="px-4 py-3">{row.lastActive ? new Date(row.lastActive).toLocaleString() : "-"}</td>
                    <td className="px-4 py-3"><ScoreBadge score={row.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState text={c.emptyNoStorePerformance} />
      )}
    </section>
  );
}

function ActionCenter({ data, onOpen, rows }: { data: CenterData; onOpen: (item: { severity: string; text: string }) => void; rows: StorePerformanceRow[] }) {
  const { c } = useCenterCopy();
  const draftTemplates = templateDefinitions.filter((template) => template.status.toLowerCase() !== "ready" && template.status.toLowerCase() !== "active");
  const suspended = data.businesses.filter((business) => String(business.status ?? "").toLowerCase().includes("suspend"));
  const lowScore = rows.filter((row) => row.score !== null && row.score < 40);
  const actions = [
    ...suspended.map((business) => ({ severity: c.critical, text: `${business.name}: ${c.suspendedBusinesses}` })),
    ...lowScore.map((row) => ({ severity: c.warning, text: `${row.business.name}: ${c.performanceScore} ${row.score}/100` })),
    ...draftTemplates.map((template) => ({ severity: c.info, text: `${posTemplateName(template, c)}: ${templateStatusLabel(template.status, c)}` })),
  ];
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.actionCenter} />
      {actions.length ? (
        <div className="grid gap-2">
          {actions.slice(0, 8).map((item, index) => (
            <button className="w-full rounded-lg border border-[#334155] bg-[#020617] p-3 text-left transition hover:border-[#5EEAD4]" key={`${item.text}-${index}`} onClick={() => onOpen(item)} type="button">
              <StatusBadge value={item.severity} />
              <div className="mt-2 text-sm text-[#CBD5E1]">{item.text}</div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState text={c.emptyNoActions} />
      )}
    </section>
  );
}

function PlanEngineSummary({ businesses, onOpen }: { businesses: CenterBusiness[]; onOpen: (drawer: DrawerKind) => void }) {
  const { c } = useCenterCopy();
  const free = businesses.filter((business) => !business.plan?.planName || business.plan.planName.toLowerCase().includes("free")).length;
  const pro = businesses.filter((business) => business.plan?.planName?.toLowerCase().includes("pro")).length;
  const trial = businesses.filter((business) => business.plan?.planName?.toLowerCase().includes("trial")).length;
  const total = Math.max(1, free + pro + trial);
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.planEngine} />
      <div className="h-3 overflow-hidden rounded-full bg-[#020617]">
        <div className="h-full bg-[#5EEAD4]" style={{ width: `${(pro / total) * 100}%` }} />
      </div>
      <div className="mt-4 grid gap-2 text-sm">
        <PlanRow label={c.freePlan} onOpen={() => onOpen("businesses-free")} value={free} />
        <PlanRow label={c.proPlan} onOpen={() => onOpen("businesses-pro")} value={pro} />
        <PlanRow label={c.trialPlan} onOpen={() => onOpen("businesses-trial")} value={trial} />
      </div>
    </section>
  );
}

function PlanRow({ label, onOpen, value }: { label: string; onOpen: () => void; value: number }) {
  return (
    <button className="flex w-full items-center justify-between gap-3 rounded-md border border-[#334155] bg-[#020617] px-3 py-2 text-left transition hover:border-[#5EEAD4]" onClick={onOpen} type="button">
      <span className="text-[#CBD5E1]">{label}</span>
      <span className="font-semibold text-[#F8FAFC]">{value}</span>
    </button>
  );
}

function TemplateUsageSummary({ businesses, onOpen }: { businesses: CenterBusiness[]; onOpen: (template: PosTemplateDefinition) => void }) {
  const { c } = useCenterCopy();
  const usedByKey = new Map<string, number>();
  businesses.forEach((business) => {
    const key = normalizePosTemplateKey(business.businessTemplateKey);
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + 1);
  });
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.templateUsage} />
      <div className="grid gap-2">
        {templateDefinitions.map((template) => (
          <button className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#020617] px-3 py-2 text-left transition hover:border-[#5EEAD4]" key={template.key} onClick={() => onOpen(template)} type="button">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#F8FAFC]">{posTemplateName(template, c)}</span>
              <span className="text-xs text-[#94A3B8]">{usedByKey.get(template.key) ?? 0} {c.stores}</span>
            </span>
            <StatusBadge value={templateStatusLabel(template.status, c)} />
          </button>
        ))}
      </div>
    </section>
  );
}

function SystemHealthSummary() {
  const { c } = useCenterCopy();
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle title={c.systemHealth} />
      <div className="grid gap-2">
        {[c.appStatus, c.databaseStatus, c.syncStatus, c.backupStatus, c.systemApiStatus].map((label) => (
          <div className="flex items-center justify-between gap-3 rounded-md border border-[#334155] bg-[#020617] px-3 py-2" key={label}>
            <span className="text-sm text-[#CBD5E1]">{label}</span>
            <span className="text-xs text-[#94A3B8]">{c.notVerified}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#94A3B8]">{c.systemHealthNotConnected}</p>
    </section>
  );
}

function activityCategory(action: string | undefined): CommandActivityFilter {
  const value = String(action ?? "").toLowerCase();
  if (value.includes("sale") || value.includes("payment") || value.includes("refund") || value.includes("void")) return "sales";
  if (value.includes("login")) return "login";
  if (value.includes("plan") || value.includes("subscription")) return "plan";
  if (value.includes("template")) return "template";
  if (value.includes("permission") || value.includes("role")) return "permission";
  if (value.includes("error") || value.includes("fail") || value.includes("denied")) return "error";
  return "all";
}

function activityTone(action: string | undefined) {
  const value = String(action ?? "").toLowerCase();
  if (value.includes("complete") || value.includes("success") || value.includes("create")) return "success";
  if (value.includes("void") || value.includes("refund") || value.includes("error") || value.includes("fail") || value.includes("denied")) return "danger";
  if (value.includes("update") || value.includes("plan")) return "warning";
  if (value.includes("login") || value.includes("open")) return "info";
  return "muted";
}

function RecentActivityCommand({
  filter,
  logs,
  onFilter,
  onOpen,
  onViewAll,
}: {
  filter: CommandActivityFilter;
  logs: CenterLog[];
  onFilter: (filter: CommandActivityFilter) => void;
  onOpen: (log: CenterLog) => void;
  onViewAll: () => void;
}) {
  const { c } = useCenterCopy();
  const filters: Array<{ label: string; value: CommandActivityFilter }> = [
    { label: c.all, value: "all" },
    { label: c.sales, value: "sales" },
    { label: c.login, value: "login" },
    { label: c.plan, value: "plan" },
    { label: c.template, value: "template" },
    { label: c.requiresPermission, value: "permission" },
    { label: c.error, value: "error" },
  ];
  const visibleLogs = logs.filter((log) => filter === "all" || activityCategory(log.action) === filter).slice(0, 8);
  return (
    <section className={dashboardPanelClass()}>
      <CommandSectionTitle
        title={c.recentActivity}
        action={<button className="rounded-md border border-[#334155] px-3 py-2 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={onViewAll} type="button">{c.viewAll}</button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            className={cn("rounded-md border px-3 py-1.5 text-xs font-semibold transition", filter === item.value ? "border-[#5EEAD4] bg-[#5EEAD4]/10 text-[#F8FAFC]" : "border-[#334155] text-[#94A3B8] hover:border-[#5EEAD4]")}
            key={item.value}
            onClick={() => onFilter(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {visibleLogs.length ? (
        <div className="overflow-hidden rounded-lg border border-[#334155]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                <tr>
                  {[c.dateTime, c.actor, c.action, c.target, c.business, c.auditDetails].map((header) => (
                    <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((log) => (
                  <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id} onClick={() => onOpen(log)}>
                    <td className="whitespace-nowrap px-4 py-3">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                    <td className="px-4 py-3">{log.user?.fullName ?? log.user?.username ?? "-"}</td>
                    <td className="px-4 py-3"><StatusBadge value={activityTone(log.action)} /> <span className="ml-2">{log.action ?? "-"}</span></td>
                    <td className="px-4 py-3">{log.module ?? "-"}</td>
                    <td className="px-4 py-3">{log.company?.name ?? "-"}</td>
                    <td className="px-4 py-3"><button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(log); }} type="button">{c.view}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState text={c.emptyNoActivity} />
      )}
    </section>
  );
}

function StorePerformanceDetail({ row }: { row: StorePerformanceRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <DetailGrid
        rows={[
          [c.store, row.business.name],
          [c.owner, row.business.owner?.fullName ?? row.business.owner?.email ?? "-"],
          [c.template, row.templateName],
          [c.plan, row.planName],
          [c.todaySales, formatCompactMoney(row.todaySalesLak)],
          [c.sevenDaySales, formatCompactMoney(row.salesLak)],
          [c.bills, String(row.billCount)],
          [c.averageBill, formatCompactMoney(row.averageBillLak)],
          [c.stockAlerts, row.stockAlerts === null ? "-" : row.stockAlerts],
          [c.syncStatus, row.syncStatus === "synced" ? c.connected : c.noData],
          [c.lastActive, row.lastActive ? new Date(row.lastActive).toLocaleString() : "-"],
          [c.performanceScore, <ScoreBadge key="score" score={row.score} />],
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <Link className="rounded-md border border-[#334155] px-3 py-2 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/businesses">{c.openPosDashboard}</Link>
        <Link className="rounded-md border border-[#334155] px-3 py-2 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/audit-logs">{c.viewActivity}</Link>
        <Link className="rounded-md border border-[#334155] px-3 py-2 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/plans">{c.viewPlan}</Link>
        <Link className="rounded-md border border-[#334155] px-3 py-2 text-center text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/templates">{c.viewTemplateStatus}</Link>
      </div>
    </div>
  );
}

type ActionSeverityFilter = "all" | "critical" | "warning" | "info" | "resolved";
type ActionCategoryFilter = "all" | "approval" | "sync" | "stock" | "plan" | "template" | "security" | "backup";
type PerformanceFilter = "all" | "excellent" | "good" | "warning" | "critical" | "unknown";

type ActionCategoryCard = {
  category: ActionCategoryFilter;
  connected: boolean;
  count: number;
  description: string;
  icon: LucideIcon;
  severity: Exclude<ActionSeverityFilter, "all">;
  title: string;
};

type RecentActivitySource =
  | { kind: "legacy"; value: CenterLog }
  | { kind: "platform"; value: PlatformAuditLog }
  | { kind: "store"; value: StoreActivityLog };

type RecentActivityRow = {
  action: string;
  activityLabel: string;
  actor: string;
  actorEmail: string;
  actorRole: string;
  business: string;
  date?: string;
  filter: RecentActivityFilter;
  id: string;
  metadataSearch: string;
  module: string;
  source: RecentActivitySource;
  status: string;
  store: string;
  summary: string;
  target: string;
  targetName: string;
  targetType: string;
};

type RecentActivityFilter = "all" | "business" | "store" | "user" | "plan" | "permission" | "login" | "error" | "system";
type AuditModuleFilter = "all" | "super-admin" | "business" | "store" | "plan" | "user" | "role" | "pos" | "inventory" | "system";
type AuditActionFilter = "all" | "create" | "update" | "delete" | "login" | "permission" | "error" | "other";
type AuditStatusFilter = "all" | "success" | "failed" | "warning" | "info" | "unknown";

type AuditLogRow = {
  action: string;
  actionFilter: AuditActionFilter;
  actor: string;
  business: string;
  date?: string;
  id: string;
  metadataSearch: string;
  module: string;
  moduleFilter: AuditModuleFilter;
  source: RecentActivitySource;
  status: string;
  statusFilter: AuditStatusFilter;
  store: string;
  target: string;
};

type StoreDirectoryRow = {
  activeAssignment: boolean;
  address: string;
  backOfficeAccess: string;
  branchId: string;
  business: CenterBusiness;
  businessName: string;
  companyId: string;
  createdAt?: string;
  currency: string;
  language: string;
  lastActive?: string;
  missingDataCount: number;
  owner: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerUsername: string;
  plan: string;
  posAccess: string;
  rowId: string;
  setupStatus: string;
  status: string;
  storeCode: string;
  storeName: string;
  subscriptionStatus: string;
  template: string;
  warehouseStatus: string;
};

type BusinessDirectoryRow = {
  activeAssignment: boolean;
  address: string;
  auditCreated: boolean;
  backOfficeAccess: string;
  business: CenterBusiness;
  businessName: string;
  companyId: string;
  country: string;
  createdAt?: string;
  currency: string;
  language: string;
  missingDataCount: number;
  owner: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerUsername: string;
  plan: string;
  posAccess: string;
  primaryBranchId: string;
  primaryStoreName: string;
  setupStatus: string;
  status: string;
  storeCode: string;
  storesCount: number;
  subscriptionStatus: string;
  template: string;
  warehouseStatus: string;
};

type UserDirectoryRow = {
  access: string;
  activeAssignment: boolean;
  assignmentId: string;
  backOfficeAccess: boolean;
  branchAssignmentStatus: string;
  businessId: string;
  businessName: string;
  companyAssignmentStatus: string;
  createdAt?: string;
  email: string;
  fullName: string;
  isOwner: boolean;
  lastActive?: string;
  loginIdentifier: string;
  missingAssignment: boolean;
  permissionSummary: string;
  phone: string;
  posAccess: boolean;
  requirePasswordChange: boolean;
  roleName: string;
  roleType: string;
  status: string;
  storeCode: string;
  storeName: string;
  user: CenterUser;
  userId: string;
  username: string;
};

type RoleDirectoryRow = {
  assignedUsers: Array<{
    access: string;
    businessName: string;
    email: string;
    fullName: string;
    storeName: string;
    userId: string;
    username: string;
  }>;
  backOfficeAccess: string;
  businessId: string;
  businessName: string;
  createdAt?: string;
  isSystem: boolean;
  permissionCount: number;
  permissionKeys: string[];
  permissionModules: string[];
  posAccess: string;
  role: CenterRole;
  roleId: string;
  roleName: string;
  roleType: string;
  status: string;
  storeLevelAccess: string;
  usersCount: number;
};

type PlanManagementRow = {
  billingStatus: string;
  business: CenterBusiness;
  businessName: string;
  companyId: string;
  createdAt?: string;
  currentPlan: string;
  currentPlanKey: string;
  missingDataCount: number;
  owner: string;
  ownerEmail: string;
  ownerUsername: string;
  plan: CenterPlan | null;
  planStatus: string;
  primaryStoreName: string;
  setupStatus: string;
  startedAt?: string;
  storeCode: string;
  storesCount: number;
  subscription: CenterBusinessSubscription | null;
  subscriptionId: string;
  template: string;
  updatedAt?: string;
};

function PageHeader({
  controls,
  subtitle,
  title,
}: {
  controls?: React.ReactNode;
  subtitle: string;
  title: string;
}) {
  return (
    <header className="flex min-w-0 max-w-full flex-col gap-4 rounded-lg border border-[#334155] bg-[#111827] p-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-normal text-[#F8FAFC] md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#94A3B8]">{subtitle}</p>
      </div>
      {controls ? <div className="flex min-w-0 flex-wrap items-center gap-2">{controls}</div> : null}
    </header>
  );
}

function SummaryCard({ helper, label, value }: { helper?: string; label: string; value: string | number }) {
  return (
    <section className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="mt-3 truncate text-2xl font-semibold text-[#F8FAFC]">{value}</div>
      {helper ? <p className="mt-2 text-xs text-[#64748B]">{helper}</p> : null}
    </section>
  );
}

function EmptyPanel({ description, title }: { description: string; title: string }) {
  return (
    <section className="rounded-lg border border-dashed border-[#475569] bg-[#111827] p-8">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-md border border-[#5EEAD4]/30 bg-[#5EEAD4]/10 text-[#5EEAD4]">
          <ClipboardList className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-[#F8FAFC]">{title}</h2>
        <p className="mt-2 text-sm text-[#94A3B8]">{description}</p>
      </div>
    </section>
  );
}

function DisabledPillButton({ label }: { label: string }) {
  return (
    <button
      className="inline-flex h-9 cursor-not-allowed items-center rounded-md border border-[#334155] px-3 text-xs font-semibold text-[#64748B]"
      disabled
      type="button"
    >
      {label}
    </button>
  );
}

function FilterSelect<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-[#334155] bg-[#020617] px-3 text-sm text-[#CBD5E1]">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</span>
      <select className="min-w-0 bg-transparent text-[#F8FAFC] outline-none" onChange={(event) => onChange(event.target.value as T)} value={value}>
        {options.map((option) => (
          <option className="bg-[#111827]" key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SearchControl({ onChange, placeholder, value }: { onChange: (value: string) => void; placeholder: string; value: string }) {
  return (
    <input
      className="h-10 min-w-[12rem] rounded-md border border-[#334155] bg-[#020617] px-3 text-sm text-[#F8FAFC] outline-none placeholder:text-[#64748B] focus:border-[#5EEAD4]"
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      value={value}
    />
  );
}

function RefreshButton() {
  const { c } = useCenterCopy();
  const router = useRouter();
  return (
    <button className="inline-flex h-10 items-center gap-2 rounded-md border border-[#334155] px-3 text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={() => router.refresh()} type="button">
      <RefreshCw className="size-4" />
      {c.refresh}
    </button>
  );
}

function ExportDisabledButton() {
  const { c } = useCenterCopy();
  return (
    <button className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border border-[#334155] px-3 text-sm font-semibold text-[#64748B]" disabled title={c.exportNotConnected} type="button">
      <Download className="size-4" />
      {c.export}
    </button>
  );
}

function issueStatusLabel(item: ActionCategoryCard, c: CenterCopy) {
  if (!item.connected) return c.notConnected;
  if (item.count > 0) return item.severity;
  return c.noIssues;
}

function buildActionCategoryCards(data: CenterData, rows: StorePerformanceRow[], c: CenterCopy): ActionCategoryCard[] {
  const failedSyncCount = data.storeActivityLogs.filter((log) => {
    const text = `${log.action} ${log.status ?? ""}`.toLowerCase();
    return text.includes("sync") && (text.includes("fail") || text.includes("error"));
  }).length;
  const planIssueCount = data.subscriptions.filter((subscription) => {
    const status = String(subscription.status ?? "").toLowerCase();
    return status.includes("past_due") || status.includes("expired") || status.includes("failed") || status.includes("cancel");
  }).length;
  const securityAlertCount = data.platformAuditLogs.filter((log) => {
    const text = `${log.action} ${log.status ?? ""} ${log.severity ?? ""}`.toLowerCase();
    return text.includes("security") || text.includes("denied") || text.includes("failed") || text.includes("critical");
  }).length;
  const draftTemplateCount = templateDefinitions.filter((template) => {
    const status = template.status.toLowerCase();
    return status.includes("draft") || status.includes("review") || status.includes("setup");
  }).length;
  const lowScoreCount = rows.filter((row) => row.score !== null && row.score < 40).length;

  const cards: ActionCategoryCard[] = [
    { category: "approval", connected: false, count: 0, description: c.pendingApprovalsDescription, icon: ClipboardList, severity: "info", title: c.pendingApprovals },
    { category: "sync", connected: data.storeActivityLogs.length > 0, count: failedSyncCount, description: c.failedSyncDescription, icon: RefreshCw, severity: "warning", title: c.failedSync },
    { category: "stock", connected: false, count: 0, description: c.lowStockAlertsDescription, icon: Store, severity: "warning", title: c.lowStockAlerts },
    { category: "plan", connected: data.subscriptions.length > 0, count: planIssueCount, description: c.planIssuesDescription, icon: CreditCard, severity: "warning", title: c.planIssues },
    { category: "template", connected: true, count: draftTemplateCount, description: c.templateDraftsDescription, icon: LayoutDashboard, severity: draftTemplateCount > 0 ? "info" : "resolved", title: c.templateDrafts },
    { category: "security", connected: data.platformAuditLogs.length > 0, count: securityAlertCount, description: c.securityAlertsDescription, icon: Shield, severity: securityAlertCount > 0 ? "critical" : "resolved", title: c.securityAlerts },
    { category: "backup", connected: false, count: 0, description: c.backupWarningsDescription, icon: Bell, severity: "info", title: c.backupWarnings },
  ];
  return cards.map((item) => {
    if (item.category === "stock" && lowScoreCount > 0) {
      return { ...item, connected: true, count: lowScoreCount, description: c.scoreHelp, severity: "warning" as const };
    }
    return item;
  });
}

function ActionCenterPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [severity, setSeverity] = useState<ActionSeverityFilter>("all");
  const [category, setCategory] = useState<ActionCategoryFilter>("all");
  const [search, setSearch] = useState("");
  const rows = buildStorePerformanceRows(data, "today", c);
  const cards = buildActionCategoryCards(data, rows, c);
  const realOpenCards = cards.filter((item) => item.connected && item.count > 0);
  const visibleCards = cards.filter((item) => {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    return (severity === "all" || item.severity === severity)
      && (category === "all" || item.category === category)
      && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  });
  const summaryHelper = realOpenCards.length ? undefined : c.actionDataNotConnected;

  const severityOptions: Array<{ label: string; value: ActionSeverityFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.critical, value: "critical" },
    { label: c.warning, value: "warning" },
    { label: c.info, value: "info" },
    { label: c.resolved, value: "resolved" },
  ];
  const categoryOptions: Array<{ label: string; value: ActionCategoryFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.approval, value: "approval" },
    { label: c.sync, value: "sync" },
    { label: c.stockAlerts, value: "stock" },
    { label: c.plan, value: "plan" },
    { label: c.template, value: "template" },
    { label: c.security, value: "security" },
    { label: c.backup, value: "backup" },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.actionCenter}
        subtitle={c.actionCenterSubtitle}
        controls={
          <>
            <FilterSelect label={c.severity} onChange={setSeverity} options={severityOptions} value={severity} />
            <FilterSelect label={c.category} onChange={setCategory} options={categoryOptions} value={category} />
            <SearchControl onChange={setSearch} placeholder={c.search} value={search} />
            <RefreshButton />
            <ExportDisabledButton />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={summaryHelper} label={c.critical} value={cards.filter((item) => item.severity === "critical" && item.count > 0).reduce((sum, item) => sum + item.count, 0)} />
        <SummaryCard helper={summaryHelper} label={c.warning} value={cards.filter((item) => item.severity === "warning" && item.count > 0).reduce((sum, item) => sum + item.count, 0)} />
        <SummaryCard helper={summaryHelper} label={c.info} value={cards.filter((item) => item.severity === "info" && item.count > 0).reduce((sum, item) => sum + item.count, 0)} />
        <SummaryCard helper={summaryHelper} label={c.resolved} value={cards.filter((item) => item.severity === "resolved").length} />
        <SummaryCard helper={summaryHelper} label={c.totalOpenActions} value={realOpenCards.reduce((sum, item) => sum + item.count, 0)} />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((item) => {
          const Icon = item.icon;
          const canOpen = item.connected && item.count > 0;
          return (
            <article className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4" key={item.category}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-[#5EEAD4]/35 bg-[#5EEAD4]/[0.12] text-[#5EEAD4]">
                  <Icon className="size-4" />
                </span>
                <StatusBadge value={issueStatusLabel(item, c)} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[#F8FAFC]">{item.title}</h2>
              <p className="mt-2 min-h-10 text-sm text-[#94A3B8]">{item.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-2xl font-semibold text-[#F8FAFC]">{item.count}</span>
                {canOpen ? (
                  <button className="rounded-md border border-[#334155] px-3 py-2 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={() => onAction("pending-actions", { severity: item.severity, text: item.title })} type="button">
                    {c.viewDetails}
                  </button>
                ) : (
                  <DisabledPillButton label={item.connected ? c.noIssues : c.disabledNotConnected} />
                )}
              </div>
            </article>
          );
        })}
      </section>
      {!realOpenCards.length ? <EmptyPanel title={c.noActionsNeedAttention} description={c.noActionsNeedAttentionSubtext} /> : null}
    </div>
  );
}

function recentActivityFilter(action: string | undefined, targetType?: string | null, module?: string | null): RecentActivityFilter {
  const value = `${action ?? ""} ${targetType ?? ""} ${module ?? ""}`.toLowerCase();
  if (value.includes("error") || value.includes("fail") || value.includes("denied") || value.includes("critical")) return "error";
  if (value.includes("login") || value.includes("auth")) return "login";
  if (value.includes("permission") || value.includes("role")) return "permission";
  if (value.includes("plan") || value.includes("subscription") || value.includes("billing")) return "plan";
  if (value.includes("user") || value.includes("owner") || value.includes("staff")) return "user";
  if (value.includes("store") || value.includes("branch")) return "store";
  if (value.includes("business") || value.includes("company")) return "business";
  return "system";
}

function recentActivityLabel(action: string | undefined, filter: RecentActivityFilter, c: CenterCopy) {
  const value = String(action ?? "").toLowerCase();
  if (filter === "business" && value.includes("create")) return c.businessCreated;
  if (filter === "store" && value.includes("create")) return c.storeCreated;
  if (filter === "user" && value.includes("create")) return c.userCreated;
  if (filter === "plan" && (value.includes("assign") || value.includes("create") || value.includes("change"))) return c.planAssigned;
  if (filter === "permission") return c.permissionUpdated;
  if (filter === "login") return c.loginEvent;
  if (filter === "system") return c.systemEvent;
  if (filter === "error") return c.errorFailedEvents;
  return c.unknownActivity;
}

function recentActivityReadableValue(value: string | null | undefined, c: CenterCopy) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const normalized = raw.toLowerCase();
  if (normalized === "cash_sessions" || normalized === "cash_session") return c.cashShift ?? "Cash shift";
  if (normalized === "auth") return c.loginEvent;
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function recentActivitySummary(input: {
  action: string;
  actor: string;
  business: string;
  module: string;
  store: string;
  target: string;
}) {
  const actor = input.actor !== "-" ? input.actor : input.module;
  const target = input.target !== "-" ? input.target : input.module;
  const location = input.store !== "-" ? input.store : input.business !== "-" ? input.business : "";
  return [actor, input.action, target, location].filter(Boolean).join(" · ");
}

function buildRecentActivityRows(data: CenterData, c: CenterCopy): RecentActivityRow[] {
  const rowId = (prefix: string, id: string | undefined, action: string | undefined, date: string | undefined, target: string | undefined) =>
    id ? `${prefix}-${id}` : `${prefix}-${action ?? "action"}-${date ?? "no-date"}-${target ?? "target"}`;
  const legacyRows: RecentActivityRow[] = data.auditLogs.map((log) => {
    const rawAction = log.action ?? "-";
    const rawTarget = log.module ?? "-";
    const action = recentActivityReadableValue(rawAction, c);
    const target = recentActivityReadableValue(rawTarget, c);
    const filter = recentActivityFilter(rawAction, log.module, log.module);
    const module = log.module ? recentActivityReadableValue(log.module, c) : auditModuleLabel(auditModuleFilter(rawAction, log.module), c);
    const row = {
      action,
      activityLabel: recentActivityLabel(rawAction, filter, c),
      actor: log.user?.fullName ?? log.user?.username ?? "-",
      actorEmail: "-",
      actorRole: "-",
      business: log.company?.name ?? "-",
      date: log.createdAt,
      filter,
      id: rowId("legacy", log.id, rawAction, log.createdAt, log.module),
      metadataSearch: "",
      module,
      source: { kind: "legacy" as const, value: log },
      status: activityTone(rawAction),
      store: "-",
      target,
      targetName: target,
      targetType: target,
    };
    return { ...row, summary: recentActivitySummary(row) };
  });
  const platformRows: RecentActivityRow[] = data.platformAuditLogs.map((log) => {
    const filter = recentActivityFilter(log.action, log.targetType);
    const moduleFilter = auditModuleFilter(log.action, log.targetType);
    const module = auditModuleLabel(moduleFilter, c);
    const action = recentActivityReadableValue(log.action, c);
    const target = recentActivityReadableValue(log.targetName ?? log.targetType, c);
    const targetName = recentActivityReadableValue(log.targetName, c);
    const targetType = recentActivityReadableValue(log.targetType, c);
    const row = {
      action,
      activityLabel: recentActivityLabel(log.action, filter, c),
      actor: log.actorName || log.actorEmail || "-",
      actorEmail: log.actorEmail ?? "-",
      actorRole: log.actorRole ?? log.actorType ?? "-",
      business: log.business?.name ?? "-",
      date: log.createdAt,
      filter,
      id: rowId("platform", log.id, log.action, log.createdAt, log.targetName ?? log.targetType ?? undefined),
      metadataSearch: safeAuditSearchText(log.beforeValue, log.afterValue, log.metadata),
      module,
      source: { kind: "platform" as const, value: log },
      status: log.status ?? log.severity ?? activityTone(log.action),
      store: "-",
      target,
      targetName,
      targetType,
    };
    return { ...row, summary: recentActivitySummary(row) };
  });
  const storeRows: RecentActivityRow[] = data.storeActivityLogs.map((log) => {
    const filter = recentActivityFilter(log.action, log.targetType);
    const module = auditModuleLabel(auditModuleFilter(log.action, log.targetType), c);
    const action = recentActivityReadableValue(log.action, c);
    const target = recentActivityReadableValue(log.targetName ?? log.targetType, c);
    const targetName = recentActivityReadableValue(log.targetName, c);
    const targetType = recentActivityReadableValue(log.targetType, c);
    const row = {
      action,
      activityLabel: recentActivityLabel(log.action, filter, c),
      actor: log.actorName,
      actorEmail: "-",
      actorRole: log.actorRole,
      business: log.business?.name ?? "-",
      date: log.occurredAt ?? log.createdAt,
      filter,
      id: rowId("store", log.id, log.action, log.occurredAt ?? log.createdAt, log.targetName ?? log.targetType ?? undefined),
      metadataSearch: safeAuditSearchText(log.beforeValue, log.afterValue, log.metadata),
      module,
      source: { kind: "store" as const, value: log },
      status: log.status ?? activityTone(log.action),
      store: log.branch?.name ?? "-",
      target,
      targetName,
      targetType,
    };
    return { ...row, summary: recentActivitySummary(row) };
  });
  return [...platformRows, ...storeRows, ...legacyRows].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
}

function openRecentActivityRow(row: RecentActivityRow, onAction: (drawer: DrawerKind, selected?: unknown) => void) {
  onAction("recent-activity-detail", row);
}

const AUDIT_SENSITIVE_KEY_PATTERN = /(password|passwordhash|password_hash|token|secret|credential|csrf|session|cookie|apikey|api_key|accesstoken|access_token|refreshtoken|refresh_token)/i;

function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditValue(item));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !AUDIT_SENSITIVE_KEY_PATTERN.test(key))
        .map(([key, entry]) => [key, sanitizeAuditValue(entry)]),
    );
  }
  return value;
}

function safeAuditSearchText(...values: unknown[]) {
  return values
    .map((value) => {
      const sanitized = sanitizeAuditValue(value);
      if (sanitized === null || sanitized === undefined) return "";
      if (typeof sanitized === "string" || typeof sanitized === "number" || typeof sanitized === "boolean") return String(sanitized);
      return JSON.stringify(sanitized);
    })
    .join(" ")
    .toLowerCase();
}

function auditActionFilter(action: string | undefined): AuditActionFilter {
  const value = String(action ?? "").toLowerCase();
  if (value.includes("create")) return "create";
  if (value.includes("update") || value.includes("change") || value.includes("mark") || value.includes("extend")) return "update";
  if (value.includes("delete") || value.includes("archive") || value.includes("cancel") || value.includes("disable") || value.includes("suspend")) return "delete";
  if (value.includes("login") || value.includes("auth")) return "login";
  if (value.includes("permission") || value.includes("role") || value.includes("denied")) return "permission";
  if (value.includes("error") || value.includes("fail") || value.includes("critical")) return "error";
  return "other";
}

function auditStatusFilter(status: string | undefined, severity?: string | null): AuditStatusFilter {
  const value = `${status ?? ""} ${severity ?? ""}`.toLowerCase();
  if (value.includes("success") || value.includes("complete") || value.includes("active")) return "success";
  if (value.includes("failed") || value.includes("fail") || value.includes("denied") || value.includes("error") || value.includes("critical")) return "failed";
  if (value.includes("warning") || value.includes("warn")) return "warning";
  if (value.includes("info")) return "info";
  return "unknown";
}

function auditModuleFilter(action: string | undefined, targetType?: string | null): AuditModuleFilter {
  const value = `${action ?? ""} ${targetType ?? ""}`.toLowerCase();
  if (value.includes("business") || value.includes("company")) return "business";
  if (value.includes("store") || value.includes("branch")) return "store";
  if (value.includes("plan") || value.includes("subscription") || value.includes("billing")) return "plan";
  if (value.includes("user")) return "user";
  if (value.includes("role") || value.includes("permission")) return "role";
  if (value.includes("sale") || value.includes("pos") || value.includes("shift") || value.includes("payment")) return "pos";
  if (value.includes("inventory") || value.includes("stock") || value.includes("product")) return "inventory";
  if (value.includes("auth") || value.includes("settings") || value.includes("system")) return "system";
  if (value.includes("template") || value.includes("feature")) return "super-admin";
  return "system";
}

function auditModuleLabel(filter: AuditModuleFilter, c: CenterCopy) {
  const labels: Record<AuditModuleFilter, string> = {
    all: c.filterAll,
    business: c.business,
    inventory: c.inventory,
    plan: c.plan,
    pos: "POS",
    role: c.rolesPermissions,
    "super-admin": "Super Admin",
    store: c.store,
    system: c.systemVault ?? "System",
    user: c.users,
  };
  return labels[filter] ?? filter;
}

function buildAuditLogRows(data: CenterData, c: CenterCopy): AuditLogRow[] {
  const rowId = (prefix: string, id: string | undefined, action: string | undefined, date: string | undefined, target: string | undefined) =>
    id ? `${prefix}-${id}` : `${prefix}-${action ?? "action"}-${date ?? "no-date"}-${target ?? "target"}`;

  const legacyRows: AuditLogRow[] = data.auditLogs.map((log) => {
    const action = log.action ?? "-";
    const moduleFilter = auditModuleFilter(action, log.module);
    const status = activityTone(action);
    return {
      action,
      actionFilter: auditActionFilter(action),
      actor: log.user?.fullName ?? log.user?.username ?? "-",
      business: log.company?.name ?? "-",
      date: log.createdAt,
      id: rowId("legacy", log.id, action, log.createdAt, log.module),
      metadataSearch: "",
      module: log.module ?? auditModuleLabel(moduleFilter, c),
      moduleFilter,
      source: { kind: "legacy", value: log },
      status,
      statusFilter: auditStatusFilter(status),
      store: "-",
      target: log.module ?? "-",
    };
  });

  const platformRows: AuditLogRow[] = data.platformAuditLogs.map((log) => {
    const moduleFilter = auditModuleFilter(log.action, log.targetType);
    const status = log.status ?? log.severity ?? activityTone(log.action);
    return {
      action: log.action,
      actionFilter: auditActionFilter(log.action),
      actor: log.actorName || log.actorEmail || "-",
      business: log.business?.name ?? "-",
      date: log.createdAt,
      id: rowId("platform", log.id, log.action, log.createdAt, log.targetName ?? log.targetType ?? undefined),
      metadataSearch: safeAuditSearchText(log.beforeValue, log.afterValue, log.metadata),
      module: auditModuleLabel(moduleFilter, c),
      moduleFilter,
      source: { kind: "platform", value: log },
      status,
      statusFilter: auditStatusFilter(log.status ?? undefined, log.severity),
      store: "-",
      target: log.targetName ?? log.targetType ?? "-",
    };
  });

  const storeRows: AuditLogRow[] = data.storeActivityLogs.map((log) => {
    const moduleFilter = auditModuleFilter(log.action, log.targetType);
    const status = log.status ?? activityTone(log.action);
    return {
      action: log.action,
      actionFilter: auditActionFilter(log.action),
      actor: log.actorName,
      business: log.business?.name ?? "-",
      date: log.occurredAt ?? log.createdAt,
      id: rowId("store", log.id, log.action, log.occurredAt ?? log.createdAt, log.targetName ?? log.targetType ?? undefined),
      metadataSearch: safeAuditSearchText(log.beforeValue, log.afterValue, log.metadata),
      module: auditModuleLabel(moduleFilter, c),
      moduleFilter,
      source: { kind: "store", value: log },
      status,
      statusFilter: auditStatusFilter(log.status ?? undefined),
      store: log.branch?.name ?? "-",
      target: log.targetName ?? log.targetType ?? "-",
    };
  });

  return [...platformRows, ...storeRows, ...legacyRows].sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
}

function openAuditLogRow(row: AuditLogRow, onAction: (drawer: DrawerKind, selected?: unknown) => void) {
  if (row.source.kind === "platform") onAction("platform-audit-detail", row.source.value);
  if (row.source.kind === "store") onAction("store-activity-detail", row.source.value);
  if (row.source.kind === "legacy") onAction("audit-details", row.source.value);
}

function RecentActivityPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c, locale } = useCenterCopy();
  const [preset, setPreset] = useState<CommandDatePreset>("30d");
  const [filter, setFilter] = useState<RecentActivityFilter>("all");
  const [search, setSearch] = useState("");
  const rows = buildRecentActivityRows(data, c);
  const dateRows = rows.filter((row) => (row.date ? inDateRange(row.date, preset) : false));
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const inRange = row.date ? inDateRange(row.date, preset) : false;
    const matchesFilter = filter === "all" || row.filter === filter;
    const matchesSearch =
      !query ||
      `${row.actor} ${row.actorEmail} ${row.actorRole} ${row.activityLabel} ${row.module} ${row.action} ${row.business} ${row.store} ${row.summary} ${row.target} ${row.metadataSearch}`
        .toLowerCase()
        .includes(query);
    return inRange && matchesFilter && matchesSearch;
  });
  const businessStoreEvents = dateRows.filter((row) => row.filter === "business" || row.filter === "store").length;
  const userEvents = dateRows.filter((row) => row.filter === "user").length;
  const planEvents = dateRows.filter((row) => row.filter === "plan").length;
  const permissionEvents = dateRows.filter((row) => row.filter === "permission").length;
  const errorEvents = dateRows.filter((row) => row.filter === "error" || ["danger", "error", "failed", "denied", "critical"].some((token) => row.status.toLowerCase().includes(token))).length;
  const dateOptions: Array<{ label: string; value: CommandDatePreset }> = [
    { label: c.today, value: "today" },
    { label: c.sevenDays, value: "7d" },
    { label: c.thirtyDays, value: "30d" },
    { label: c.thisMonth, value: "month" },
  ];
  const filters: Array<{ label: string; value: RecentActivityFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.business, value: "business" },
    { label: c.store, value: "store" },
    { label: c.users, value: "user" },
    { label: c.plan, value: "plan" },
    { label: locale === "en" ? "Permission" : c.requiresPermission, value: "permission" },
    { label: c.login, value: "login" },
    { label: c.error, value: "error" },
    { label: locale === "en" ? "System" : (c.systemVault ?? "System"), value: "system" },
  ];
  const columns = [
    { key: "date-time", label: c.dateTime },
    { key: "actor", label: c.actor },
    { key: "activity", label: c.activityLabel },
    { key: "module", label: c.module },
    { key: "business-store", label: c.businessStore },
    { key: "status", label: c.status },
    { key: "summary", label: c.summary },
    { key: "actions", label: c.actions },
  ];
  const helper = rows.length ? undefined : c.activityDataNotConnected ?? "Activity data is not connected yet.";

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.recentActivity}
        subtitle={c.recentActivitySubtitle}
        controls={
          <>
            <FilterSelect label={c.dateRange} onChange={setPreset} options={dateOptions} value={preset} />
            <SearchControl onChange={setSearch} placeholder={c.search} value={search} />
            <RefreshButton />
            <ExportDisabledButton />
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            className={cn("rounded-md border px-3 py-2 text-xs font-semibold transition", filter === item.value ? "border-[#5EEAD4] bg-[#5EEAD4]/10 text-[#F8FAFC]" : "border-[#334155] text-[#94A3B8] hover:border-[#5EEAD4]")}
            key={item.value}
            onClick={() => setFilter(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={helper} label={c.totalActivities} value={dateRows.length} />
        <SummaryCard helper={helper} label={c.businessStoreEvents} value={businessStoreEvents} />
        <SummaryCard helper={helper} label={c.userEvents} value={userEvents} />
        <SummaryCard helper={helper} label={c.planEvents} value={planEvents} />
        <SummaryCard helper={helper} label={c.permissionEvents} value={permissionEvents} />
        <SummaryCard helper={helper} label={c.errorFailedEvents} value={errorEvents} />
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.recentActivity} subtitle={c.recentActivitySubtitle} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {columns.map((column) => (
                      <th className="px-4 py-3 font-semibold" key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.id} onClick={() => openRecentActivityRow(row, onAction)}>
                      <td className="whitespace-nowrap px-4 py-3">{row.date ? new Date(row.date).toLocaleString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#F8FAFC]">{row.actor}</div>
                        {row.actorEmail !== "-" ? <div className="text-xs text-[#94A3B8]">{row.actorEmail}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[#F8FAFC]">{row.activityLabel}</div>
                        <div className="text-xs text-[#94A3B8]">{row.action}</div>
                      </td>
                      <td className="px-4 py-3">{row.module}</td>
                      <td className="px-4 py-3">
                        <div>{row.business}</div>
                        {row.store !== "-" ? <div className="text-xs text-[#94A3B8]">{row.store}</div> : null}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3 text-[#CBD5E1]">{row.summary}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); openRecentActivityRow(row, onAction); }} type="button">
                            {c.view}
                          </button>
                          <Link className="text-[#94A3B8] underline-offset-4 hover:text-[#5EEAD4] hover:underline" href="/super-admin/audit-logs" onClick={(event) => event.stopPropagation()}>
                            {c.viewAuditLog}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title={c.noRecentActivityYet} description={c.noRecentActivityYetSubtext} />
        )}
      </section>
    </div>
  );
}

function CenterLogDetail({ log }: { log: CenterLog }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.eventOverview} subtitle={log.action ?? c.auditLogs} />
        <DetailGrid
          rows={[
            [c.dateTime, log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"],
            [c.action, log.action ?? "-"],
            [c.module, log.module ?? "-"],
            [c.status, <StatusBadge key="status" value={activityTone(log.action)} />],
            [c.target, log.module ?? "-"],
            [c.readableSummary, `${log.user?.fullName ?? log.user?.username ?? c.actor} ${log.action ?? c.action}`],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.actor} subtitle={log.user?.fullName ?? log.user?.username ?? "-"} />
        <DetailGrid
          rows={[
            [c.actor, log.user?.fullName ?? log.user?.username ?? "-"],
            [c.business, log.company?.name ?? "-"],
          ]}
        />
      </section>
      <AdvancedDetails sections={[{ title: c.rawPayload, value: sanitizeAuditValue(log) }]} />
    </div>
  );
}

function RecentActivityDetail({ row }: { row: RecentActivityRow }) {
  const { c } = useCenterCopy();
  let rawIds: Record<string, unknown> = {};
  let safeBefore: unknown;
  let safeAfter: unknown;
  let safeMetadata: unknown;

  if (row.source.kind === "platform") {
    const source = row.source.value;
    rawIds = {
      actorId: source.actorId,
      businessId: source.businessId,
      requestId: source.requestId,
      targetId: source.targetId,
    };
    safeBefore = sanitizeAuditValue(source.beforeValue);
    safeAfter = sanitizeAuditValue(source.afterValue);
    safeMetadata = sanitizeAuditValue(source.metadata);
  } else if (row.source.kind === "store") {
    const source = row.source.value;
    rawIds = {
      actorId: source.actorId,
      branchId: source.branch?.id,
      businessId: source.businessId,
      targetId: source.targetId,
    };
    safeBefore = sanitizeAuditValue(source.beforeValue);
    safeAfter = sanitizeAuditValue(source.afterValue);
    safeMetadata = sanitizeAuditValue(source.metadata);
  } else {
    rawIds = { auditId: row.source.value.id };
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.activityOverview} subtitle={row.activityLabel} />
        <DetailGrid
          rows={[
            [c.dateTime, row.date ? new Date(row.date).toLocaleString() : "-"],
            [c.activityLabel, row.activityLabel],
            [c.module, row.module],
            [c.status, <StatusBadge key="status" value={row.status} />],
            [c.summary, row.summary],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.actor} subtitle={row.actor} />
        <DetailGrid
          rows={[
            [c.actor, row.actor],
            [c.email, row.actorEmail],
            [c.role, row.actorRole],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessStore} subtitle={row.business !== "-" ? row.business : row.store} />
        <DetailGrid
          rows={[
            [c.business, row.business],
            [c.store, row.store],
            [c.storeCode, "-"],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.relatedContext} subtitle={row.target} />
        <DetailGrid
          rows={[
            [c.targetType, row.targetType],
            [c.targetName, row.targetName],
            [c.safeChangeSummary, `${formatReadableValue(safeBefore)} -> ${formatReadableValue(safeAfter)}`],
          ]}
        />
      </section>
      <AdvancedDetails
        sections={[
          { title: c.changeSummary, value: { after: safeAfter, before: safeBefore } },
          { title: c.metadata, value: safeMetadata },
          { title: "IDs", value: rawIds },
          { title: c.rawPayload, value: sanitizeAuditValue(row.source.value) },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/audit-logs">
          {c.viewAuditLog}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/businesses">
          {c.viewBusiness}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
          {c.viewStore}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/users">
          {c.viewUser}
        </Link>
        <DisabledPillButton label={c.exportActivity} />
      </div>
    </div>
  );
}

function buildStoreDirectoryRows(data: CenterData, c: CenterCopy): StoreDirectoryRow[] {
  return data.businesses.flatMap((business) => {
    const branches = business.branches?.length ? business.branches : [null];
    const lastActive = latestActivityForBusiness(data.storeActivityLogs, business.id);
    const ownerMember = business.members?.find((member) => member.isOwner) ?? business.members?.[0];
    const owner = business.owner ?? ownerMember?.user ?? null;
    const subscription = business.subscriptions?.[0];
    const plan = subscription?.plan?.planName ?? business.plan?.planName ?? c.free;
    const businessStatus = business.status ?? c.notConnected;
    return branches.map((branch) => {
      const branchWarehouses = business.warehouses?.filter((warehouse) => !branch?.id || warehouse.branchId === branch.id) ?? [];
      const activeAssignment = Boolean(ownerMember && (!branch?.id || !ownerMember.branchId || ownerMember.branchId === branch.id));
      const missingDataCount = [
        !branch?.id,
        !business.storeCode,
        !owner?.email && !owner?.username,
        !business.businessTemplateKey,
        !plan,
        !branchWarehouses.length,
        !activeAssignment,
      ].filter(Boolean).length;
      return {
        activeAssignment,
        address: branch?.address ?? business.settings?.profileAddress ?? "-",
        backOfficeAccess: ownerMember?.allowBackOfficeAccess === false ? c.disabled : c.activeStatus ?? c.active ?? "Active",
        branchId: branch?.id ?? "-",
        business,
        businessName: business.name,
        companyId: business.id,
        createdAt: branch?.createdAt ?? business.createdAt,
        currency: business.settings?.currencyDisplay ?? business.settings?.baseCurrency ?? business.baseCurrency ?? "LAK",
        language: business.defaultLocale ?? "-",
        lastActive,
        missingDataCount,
        owner: owner?.fullName ?? owner?.email ?? owner?.username ?? "-",
        ownerEmail: owner?.email ?? "-",
        ownerPhone: owner?.phone ?? "-",
        ownerUsername: owner?.username ?? "-",
        plan,
        posAccess: ownerMember?.allowPosAccess === false ? c.disabled : c.activeStatus ?? c.active ?? "Active",
        rowId: `${business.id}:${branch?.id ?? "missing-branch"}`,
        setupStatus: missingDataCount > 0 ? c.missingData : c.setupComplete,
        status: businessStatus,
        storeCode: business.storeCode ?? "-",
        storeName: branch?.name ?? business.name,
        subscriptionStatus: subscription?.status ?? (plan.toLowerCase().includes("free") ? c.activeStatus ?? c.active ?? "Active" : c.notConnected),
        template: posTemplateNameFromKey(business.businessTemplateKey, c),
        warehouseStatus: branchWarehouses.length ? `${branchWarehouses.length}` : c.notConnected,
      };
    });
  });
}

function StoresPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const rows = buildStoreDirectoryRows(data, c);
  const templateOptions = [{ label: c.filterAll, value: "all" }, ...templateDefinitions.map((template) => ({ label: posTemplateName(template, c), value: template.key }))];
  const planOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Set(rows.map((row) => row.plan))).map((plan) => ({ label: plan, value: plan }))];
  const statusValues = Array.from(new Set(rows.map((row) => row.status).filter(Boolean)));
  const statusOptions = [
    { label: c.filterAll, value: "all" },
    ...statusValues.map((status) => ({ label: status, value: status })),
    { label: c.missingStoreData, value: "missing-data" },
  ];
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.storeName} ${row.businessName} ${row.owner} ${row.ownerEmail} ${row.storeCode}`.toLowerCase().includes(query);
    const matchesTemplate = templateFilter === "all" || normalizePosTemplateKey(row.business.businessTemplateKey) === templateFilter;
    const matchesPlan = planFilter === "all" || row.plan === planFilter;
    const matchesStatus = statusFilter === "all" || row.status === statusFilter || (statusFilter === "missing-data" && row.missingDataCount > 0);
    return matchesSearch && matchesTemplate && matchesPlan && matchesStatus;
  });
  const activeRows = rows.filter((row) => String(row.status).toLowerCase() === "active");
  const miniMartRows = rows.filter((row) => normalizePosTemplateKey(row.business.businessTemplateKey) === "mini-mart");
  const freePlanRows = rows.filter((row) => row.plan.toLowerCase().includes("free"));
  const missingRows = rows.filter((row) => row.missingDataCount > 0);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.storesPageTitle}
        subtitle={c.storesPageSubtitle}
        controls={
          <>
            <SearchControl onChange={setSearch} placeholder={c.searchStores} value={search} />
            <FilterSelect label={c.template} onChange={setTemplateFilter} options={templateOptions} value={templateFilter} />
            <FilterSelect label={c.plan} onChange={setPlanFilter} options={planOptions} value={planFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <RefreshButton />
            <Link className="inline-flex h-10 items-center rounded-md border border-[#5EEAD4] px-3 text-sm font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores/new">
              {c.addStore}
            </Link>
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.totalStores} value={rows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.activeStores} value={activeRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.miniMartStores} value={miniMartRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.freePlanStores} value={freePlanRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.missingStoreData} value={missingRows.length} />
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.storesPageTitle} subtitle={c.storeDataNotConnected} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[c.storeName, c.business, c.storeCode, c.owner, c.template, c.plan, c.status, c.lastActive, c.createdAt, c.actions].map((header) => (
                      <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.rowId} onClick={() => onAction("business-view", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.storeName}</td>
                      <td className="px-4 py-3">{row.businessName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#CBD5E1]">{row.storeCode}</td>
                      <td className="px-4 py-3">
                        <div>{row.owner}</div>
                        <div className="text-xs text-[#94A3B8]">{row.ownerEmail}</div>
                      </td>
                      <td className="px-4 py-3">{row.template}</td>
                      <td className="px-4 py-3">{row.plan}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3">{row.lastActive ? new Date(row.lastActive).toLocaleString() : "-"}</td>
                      <td className="px-4 py-3">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("business-view", row); }} type="button">
                            {c.viewDetails}
                          </button>
                          <DisabledPillButton label={c.disabledNotConnected} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title={c.storesTableEmpty} description={c.storesTableEmptySubtext} />
        )}
      </section>
    </div>
  );
}

function isStoreDirectoryRow(value: unknown): value is StoreDirectoryRow {
  return Boolean(value && typeof value === "object" && "rowId" in value && "business" in value && "storeCode" in value);
}

function StoreDirectoryDetail({ row }: { row: StoreDirectoryRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.storeOverview} subtitle={row.storeName} />
        <DetailGrid
          rows={[
            [c.storeName, row.storeName],
            [c.storeCode, row.storeCode],
            [c.branchId, row.branchId],
            [c.companyId, row.companyId],
            [c.template, row.template],
            [c.plan, row.plan],
            [c.status, <StatusBadge key="status" value={row.status} />],
            [c.createdAt, row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.ownerAccount} subtitle={row.ownerEmail} />
        <DetailGrid
          rows={[
            [c.owner, row.owner],
            [c.ownerEmail, row.ownerEmail],
            [c.ownerUsername, row.ownerUsername],
            [c.ownerPhone, row.ownerPhone],
            [c.role, c.owner],
            [c.status, <StatusBadge key="owner-status" value={row.activeAssignment ? c.activeStatus ?? c.active ?? "Active" : c.notConnected} />],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessProfile} subtitle={row.businessName} />
        <DetailGrid
          rows={[
            [c.business, row.businessName],
            [c.currency, row.currency],
            [c.language, row.language],
            [c.country, "-"],
            [c.branch, row.storeName],
            ["Address", row.address],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.accessSetup} subtitle={row.setupStatus} />
        <DetailGrid
          rows={[
            [c.backOfficeAccess, <StatusBadge key="back-office" value={row.backOfficeAccess} />],
            [c.posAccess, <StatusBadge key="pos" value={row.posAccess} />],
            [c.activeAssignment, <StatusBadge key="assignment" value={row.activeAssignment ? c.activeStatus ?? c.active ?? "Active" : c.notConnected} />],
            [c.warehouseCreated, <StatusBadge key="warehouse" value={row.warehouseStatus} />],
            [c.subscriptionStatus, <StatusBadge key="subscription" value={row.subscriptionStatus} />],
            [c.missingStoreData, row.missingDataCount],
          ]}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <DisabledPillButton label={c.openDashboard} />
        <DisabledPillButton label={c.resetOwnerPassword} />
        <DisabledPillButton label={c.disableStore} />
        <DisabledPillButton label={c.changePlan} />
        <DisabledPillButton label={c.editStore} />
      </section>

      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              branchId: row.branchId,
              companyId: row.companyId,
              ownerEmail: row.ownerEmail,
              ownerUsername: row.ownerUsername,
              storeCode: row.storeCode,
              warehouseCount: row.business.warehouses?.length ?? 0,
            },
          },
        ]}
      />
    </div>
  );
}

function buildBusinessDirectoryRows(data: CenterData, c: CenterCopy): BusinessDirectoryRow[] {
  return data.businesses.map((business) => {
    const primaryBranch = business.branches?.[0] ?? null;
    const ownerMember = business.members?.find((member) => member.isOwner) ?? business.members?.[0];
    const owner = business.owner ?? ownerMember?.user ?? null;
    const subscription = business.subscriptions?.[0];
    const plan = subscription?.plan?.planName ?? business.plan?.planName ?? c.free;
    const branchCount = business._count?.branches ?? business.branches?.length ?? 0;
    const warehouseCount = business.warehouses?.length ?? 0;
    const auditCreated = data.platformAuditLogs.some((log) => log.businessId === business.id || log.targetId === business.id)
      || data.auditLogs.some((log) => log.company?.name === business.name)
      || data.storeActivityLogs.some((log) => log.businessId === business.id);
    const activeAssignment = Boolean(ownerMember?.isOwner || ownerMember);
    const missingDataCount = [
      !business.id,
      !business.name,
      !primaryBranch?.id,
      !business.storeCode,
      !owner?.email && !owner?.username,
      !business.businessTemplateKey,
      !plan,
      !warehouseCount,
      !activeAssignment,
    ].filter(Boolean).length;
    return {
      activeAssignment,
      address: business.settings?.profileAddress ?? primaryBranch?.address ?? "-",
      auditCreated,
      backOfficeAccess: ownerMember?.allowBackOfficeAccess === false ? c.disabled : c.activeStatus ?? c.active ?? "Active",
      business,
      businessName: business.name,
      companyId: business.id,
      country: "-",
      createdAt: business.createdAt,
      currency: business.settings?.currencyDisplay ?? business.settings?.baseCurrency ?? business.baseCurrency ?? "LAK",
      language: business.defaultLocale ?? "-",
      missingDataCount,
      owner: owner?.fullName ?? owner?.email ?? owner?.username ?? "-",
      ownerEmail: owner?.email ?? "-",
      ownerPhone: owner?.phone ?? "-",
      ownerUsername: owner?.username ?? "-",
      plan,
      posAccess: ownerMember?.allowPosAccess === false ? c.disabled : c.activeStatus ?? c.active ?? "Active",
      primaryBranchId: primaryBranch?.id ?? "-",
      primaryStoreName: primaryBranch?.name ?? business.name,
      setupStatus: missingDataCount > 0 ? c.missingData : c.setupComplete,
      status: business.status ?? c.notConnected,
      storeCode: business.storeCode ?? "-",
      storesCount: branchCount,
      subscriptionStatus: subscription?.status ?? (plan.toLowerCase().includes("free") ? c.activeStatus ?? c.active ?? "Active" : c.notConnected),
      template: posTemplateNameFromKey(business.businessTemplateKey, c),
      warehouseStatus: warehouseCount ? `${warehouseCount}` : c.notConnected,
    };
  });
}

function isBusinessDirectoryRow(value: unknown): value is BusinessDirectoryRow {
  return Boolean(value && typeof value === "object" && "companyId" in value && "primaryStoreName" in value && "storesCount" in value);
}

function BusinessDirectoryPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const rows = buildBusinessDirectoryRows(data, c);
  const templateOptions = [{ label: c.filterAll, value: "all" }, ...templateDefinitions.map((template) => ({ label: posTemplateName(template, c), value: template.key }))];
  const planOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Set(rows.map((row) => row.plan))).map((plan) => ({ label: plan, value: plan }))];
  const statusValues = Array.from(new Set(rows.map((row) => row.status).filter(Boolean)));
  const statusOptions = [
    { label: c.filterAll, value: "all" },
    ...statusValues.map((status) => ({ label: status, value: status })),
    { label: c.businessesMissingData, value: "missing-data" },
  ];
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.businessName} ${row.primaryStoreName} ${row.owner} ${row.ownerEmail} ${row.ownerUsername} ${row.storeCode}`.toLowerCase().includes(query);
    const matchesTemplate = templateFilter === "all" || normalizePosTemplateKey(row.business.businessTemplateKey) === templateFilter;
    const matchesPlan = planFilter === "all" || row.plan === planFilter;
    const matchesStatus = statusFilter === "all" || row.status === statusFilter || (statusFilter === "missing-data" && row.missingDataCount > 0);
    return matchesSearch && matchesTemplate && matchesPlan && matchesStatus;
  });
  const activeRows = rows.filter((row) => String(row.status).toLowerCase() === "active");
  const miniMartRows = rows.filter((row) => normalizePosTemplateKey(row.business.businessTemplateKey) === "mini-mart");
  const freePlanRows = rows.filter((row) => row.plan.toLowerCase().includes("free"));
  const missingRows = rows.filter((row) => row.missingDataCount > 0);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.businesses}
        subtitle={c.manageBusinessesTemplatesPlansUsersAndPlatformControls}
        controls={
          <>
            <SearchControl onChange={setSearch} placeholder={c.searchStores} value={search} />
            <FilterSelect label={c.template} onChange={setTemplateFilter} options={templateOptions} value={templateFilter} />
            <FilterSelect label={c.plan} onChange={setPlanFilter} options={planOptions} value={planFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <RefreshButton />
            <Link className="inline-flex h-10 items-center rounded-md border border-[#5EEAD4] px-3 text-sm font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores/new">
              {c.addStore}
            </Link>
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.totalBusinesses} value={rows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.activeBusinesses} value={activeRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.miniMartBusinesses} value={miniMartRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.freePlanBusinesses} value={freePlanRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.storeDataNotConnected} label={c.businessesMissingData} value={missingRows.length} />
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.businesses} subtitle={rows.length ? c.manageBusinessesTemplatesPlansUsersAndPlatformControls : c.emptyBusinesses} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="sticky top-0 bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[c.business, c.primaryStore, c.storeCode, c.owner, c.template, c.plan, c.status, c.storesCount, c.createdAt, c.actions].map((header) => (
                      <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.companyId} onClick={() => onAction("business-detail", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.businessName}</td>
                      <td className="px-4 py-3">{row.primaryStoreName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#CBD5E1]">{row.storeCode}</td>
                      <td className="px-4 py-3">
                        <div>{row.owner}</div>
                        <div className="text-xs text-[#94A3B8]">{row.ownerEmail}</div>
                      </td>
                      <td className="px-4 py-3">{row.template}</td>
                      <td className="px-4 py-3">{row.plan}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3">{row.storesCount}</td>
                      <td className="px-4 py-3">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("business-detail", row); }} type="button">
                            {c.viewDetails}
                          </button>
                          <DisabledPillButton label={c.disabledNotConnected} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <EmptyPanel title="No businesses connected yet." description="Create a store from EGO POS Center to start managing customer businesses." />
            <Link className="w-fit rounded-md border border-[#5EEAD4] px-4 py-2 text-sm font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores/new">
              {c.addStore}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function BusinessDirectoryDetail({ row }: { row: BusinessDirectoryRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={row.businessName} subtitle={row.primaryStoreName} />
        <DetailGrid
          rows={[
            [c.companyId, row.companyId],
            [c.business, row.businessName],
            [c.status, <StatusBadge key="status" value={row.status} />],
            [c.createdAt, row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"],
            [c.currency, row.currency],
            [c.language, row.language],
            [c.countryRegion, row.country],
            ["Address", row.address],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.ownerAccount} subtitle={row.ownerEmail} />
        <DetailGrid
          rows={[
            [c.owner, row.owner],
            [c.ownerEmail, row.ownerEmail],
            [c.ownerUsername, row.ownerUsername],
            [c.ownerPhone, row.ownerPhone],
            [c.role, c.owner],
            [c.status, <StatusBadge key="owner-status" value={row.activeAssignment ? c.activeStatus ?? c.active ?? "Active" : c.notConnected} />],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.storesBranches} subtitle={row.primaryStoreName} />
        <DetailGrid
          rows={[
            [c.storeName, row.primaryStoreName],
            [c.storeCode, row.storeCode],
            [c.branchId, row.primaryBranchId],
            [c.warehouseCreated, <StatusBadge key="warehouse" value={row.warehouseStatus} />],
            [c.backOfficeAccess, <StatusBadge key="back-office" value={row.backOfficeAccess} />],
            [c.posAccess, <StatusBadge key="pos" value={row.posAccess} />],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.templatePlan} subtitle={row.template} />
        <DetailGrid
          rows={[
            [c.template, row.template],
            [c.posTemplateStatus, normalizePosTemplateKey(row.business.businessTemplateKey) === "mini-mart" ? c.ready : c.draft],
            [c.plan, row.plan],
            [c.subscriptionStatus, <StatusBadge key="subscription" value={row.subscriptionStatus} />],
            [c.billingStatus, row.plan.toLowerCase().includes("pro") ? c.billingNotConnectedForPro : c.disabledNotConnected],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessSetupStatus} subtitle={row.setupStatus} />
        <DetailGrid
          rows={[
            [c.businessCreated, <StatusBadge key="business-created" value={row.companyId !== "-" ? c.connected : c.notConnected} />],
            [c.storeBranchCreated, <StatusBadge key="branch-created" value={row.primaryBranchId !== "-" ? c.connected : c.notConnected} />],
            [c.warehouseCreated, <StatusBadge key="warehouse-created" value={row.warehouseStatus} />],
            [c.ownerAssignmentActive, <StatusBadge key="owner-assignment" value={row.activeAssignment ? c.activeStatus ?? c.active ?? "Active" : c.notConnected} />],
            [c.subscriptionStatus, <StatusBadge key="free-plan" value={row.subscriptionStatus} />],
            [c.auditCreated, <StatusBadge key="audit-created" value={row.auditCreated ? c.connected : c.notConnected} />],
          ]}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
          {c.viewStores}
        </Link>
        <DisabledPillButton label={c.openStoreDashboard} />
        <DisabledPillButton label={c.edit} />
        <DisabledPillButton label={c.disableStore} />
        <DisabledPillButton label={c.resetOwnerPassword} />
        <DisabledPillButton label={c.changePlan} />
      </section>

      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              branchId: row.primaryBranchId,
              companyId: row.companyId,
              ownerEmail: row.ownerEmail,
              ownerUsername: row.ownerUsername,
              storeCode: row.storeCode,
              subscriptionStatus: row.subscriptionStatus,
              warehouseCount: row.business.warehouses?.length ?? 0,
            },
          },
        ]}
      />
    </div>
  );
}

function normalizePlanKey(value?: string | null) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

function planCatalogMatch(plans: CenterPlan[], planName?: string | null) {
  const key = normalizePlanKey(planName);
  return plans.find((plan) => normalizePlanKey(plan.planName) === key) ?? null;
}

function planLimitValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "-";
}

function buildPlanManagementRows(data: CenterData, c: CenterCopy): PlanManagementRow[] {
  return data.businesses.map((business) => {
    const primaryBranch = business.branches?.[0] ?? null;
    const ownerMember = business.members?.find((member) => member.isOwner) ?? business.members?.[0];
    const owner = business.owner ?? ownerMember?.user ?? null;
    const subscription = business.subscriptions?.[0] ?? null;
    const currentPlan = subscription?.plan?.planName ?? business.plan?.planName ?? c.freePlan ?? c.free;
    const currentPlanKey = normalizePlanKey(currentPlan);
    const plan = planCatalogMatch(data.plans, currentPlan) ?? planCatalogMatch(data.plans, business.plan?.planName) ?? null;
    const isFreePlan = currentPlanKey.includes("free");
    const isProPlan = currentPlanKey.includes("pro");
    const planStatus = subscription?.status ?? (isFreePlan ? c.activeStatus ?? c.active ?? "Active" : c.notConnected);
    const billingStatus = isFreePlan ? c.notRequired : isProPlan ? c.billingNotConnectedForPro : c.notConnected;
    const branchCount = business._count?.branches ?? business.branches?.length ?? 0;
    const missingDataCount = [
      !business.id,
      !business.name,
      !primaryBranch?.id,
      !business.storeCode,
      !owner?.email && !owner?.username,
      !currentPlan,
      !subscription?.id && !business.plan?.planName,
    ].filter(Boolean).length;

    return {
      billingStatus,
      business,
      businessName: business.name,
      companyId: business.id,
      createdAt: business.createdAt,
      currentPlan,
      currentPlanKey,
      missingDataCount,
      owner: owner?.fullName ?? owner?.email ?? owner?.username ?? "-",
      ownerEmail: owner?.email ?? "-",
      ownerUsername: owner?.username ?? "-",
      plan,
      planStatus,
      primaryStoreName: primaryBranch?.name ?? business.name,
      setupStatus: missingDataCount > 0 ? c.missingData : c.setupComplete,
      startedAt: subscription?.startDate,
      storeCode: business.storeCode ?? "-",
      storesCount: branchCount,
      subscription,
      subscriptionId: subscription?.id ?? "-",
      template: posTemplateNameFromKey(business.businessTemplateKey, c),
      updatedAt: primaryBranch?.updatedAt,
    };
  });
}

function isPlanManagementRow(value: unknown): value is PlanManagementRow {
  return Boolean(value && typeof value === "object" && "companyId" in value && "currentPlan" in value && "billingStatus" in value);
}

function PlanManagementPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [search, setSearch] = useState("");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [billingFilter, setBillingFilter] = useState("all");
  const rows = buildPlanManagementRows(data, c);
  const templateOptions = [{ label: c.filterAll, value: "all" }, ...templateDefinitions.map((template) => ({ label: posTemplateName(template, c), value: template.key }))];
  const planOptions = [
    { label: c.filterAll, value: "all" },
    { label: c.freePlan, value: "free" },
    { label: c.proPlan, value: "pro" },
    { label: c.notConnected, value: "not-connected" },
    ...Array.from(new Set(rows.map((row) => row.currentPlan).filter((plan) => plan && !["free", "pro"].includes(normalizePlanKey(plan))))).map((plan) => ({ label: plan, value: normalizePlanKey(plan) })),
  ];
  const statusOptions = [
    { label: c.filterAll, value: "all" },
    ...Array.from(new Set(rows.map((row) => row.planStatus).filter(Boolean))).map((status) => ({ label: status, value: status })),
    { label: c.businessesMissingData, value: "missing-data" },
  ];
  const billingOptions = [
    { label: c.filterAll, value: "all" },
    { label: c.notRequired, value: "not-required" },
    { label: c.billingNotConnectedForPro, value: "not-connected" },
  ];
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.businessName} ${row.primaryStoreName} ${row.owner} ${row.ownerEmail} ${row.ownerUsername} ${row.storeCode}`.toLowerCase().includes(query);
    const matchesTemplate = templateFilter === "all" || normalizePosTemplateKey(row.business.businessTemplateKey) === templateFilter;
    const matchesPlan =
      planFilter === "all"
      || (planFilter === "free" && row.currentPlanKey.includes("free"))
      || (planFilter === "pro" && row.currentPlanKey.includes("pro"))
      || (planFilter === "not-connected" && row.planStatus === c.notConnected)
      || row.currentPlanKey === planFilter;
    const matchesStatus = statusFilter === "all" || row.planStatus === statusFilter || (statusFilter === "missing-data" && row.missingDataCount > 0);
    const matchesBilling =
      billingFilter === "all"
      || (billingFilter === "not-required" && row.billingStatus === c.notRequired)
      || (billingFilter === "not-connected" && row.billingStatus !== c.notRequired);
    return matchesSearch && matchesTemplate && matchesPlan && matchesStatus && matchesBilling;
  });
  const activeRows = rows.filter((row) => String(row.planStatus).toLowerCase().includes("active"));
  const freeRows = rows.filter((row) => row.currentPlanKey.includes("free"));
  const proRows = rows.filter((row) => row.currentPlanKey.includes("pro"));
  const missingBillingRows = rows.filter((row) => row.billingStatus !== c.notRequired);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.planManagement}
        subtitle={c.planManagementSubtitle}
        controls={
          <>
            <SearchControl onChange={setSearch} placeholder={c.searchStores} value={search} />
            <FilterSelect label={c.template} onChange={setTemplateFilter} options={templateOptions} value={templateFilter} />
            <FilterSelect label={c.currentPlan} onChange={setPlanFilter} options={planOptions} value={planFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <FilterSelect label={c.billingStatus} onChange={setBillingFilter} options={billingOptions} value={billingFilter} />
            <RefreshButton />
            <DisabledPillButton label={c.exportNotConnected} />
          </>
        }
      />

      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.planRecords} value={rows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.activePlans} value={activeRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.freePlanRecords} value={freeRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.proPlanRecords} value={proRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.plansMissingBilling} value={missingBillingRows.length} />
      </section>

      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.planManagement} subtitle={rows.length ? c.planManagementSubtitle : c.noPlanRecordsConnectedSubtext} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1440px] border-collapse text-sm">
                <thead className="sticky top-0 bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[c.business, c.primaryStore, c.storeCode, c.currentPlan, c.status, c.billingStatus, c.owner, c.template, c.createdAt, c.updatedOrStartedAt, c.actions].map((header) => (
                      <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.companyId} onClick={() => onAction("plan-management-detail", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.businessName}</td>
                      <td className="px-4 py-3">{row.primaryStoreName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#CBD5E1]">{row.storeCode}</td>
                      <td className="px-4 py-3">{row.currentPlan}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.planStatus} /></td>
                      <td className="px-4 py-3"><StatusBadge value={row.billingStatus} /></td>
                      <td className="px-4 py-3">
                        <div>{row.owner}</div>
                        <div className="text-xs text-[#94A3B8]">{row.ownerEmail}</div>
                      </td>
                      <td className="px-4 py-3">{row.template}</td>
                      <td className="px-4 py-3">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">{(row.updatedAt ?? row.startedAt) ? new Date(row.updatedAt ?? row.startedAt ?? "").toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("plan-management-detail", row); }} type="button">
                            {c.viewDetails}
                          </button>
                          <DisabledPillButton label={c.changePlan} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <EmptyPanel title={c.noPlanRecordsConnected} description={c.noPlanRecordsConnectedSubtext} />
            <Link className="w-fit rounded-md border border-[#5EEAD4] px-4 py-2 text-sm font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores/new">
              {c.addStore}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function PlanManagementDetail({ row }: { row: PlanManagementRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={row.businessName} subtitle={row.currentPlan} />
        <DetailGrid
          rows={[
            [c.currentPlan, row.currentPlan],
            [c.status, <StatusBadge key="plan-status" value={row.planStatus} />],
            [c.billingStatus, <StatusBadge key="billing-status" value={row.billingStatus} />],
            [c.startedAt, row.startedAt ? new Date(row.startedAt).toLocaleString() : "-"],
            [c.planCreatedAt, row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessStore} subtitle={row.primaryStoreName} />
        <DetailGrid
          rows={[
            [c.business, row.businessName],
            [c.primaryStore, row.primaryStoreName],
            [c.storeCode, row.storeCode],
            [c.owner, row.owner],
            [c.ownerEmail, row.ownerEmail],
            [c.ownerUsername, row.ownerUsername],
            [c.template, row.template],
            [c.storesCount, row.storesCount],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.planFeaturesLimits} subtitle={row.plan?.planName ?? row.currentPlan} />
        <DetailGrid
          rows={[
            [c.branchCount, planLimitValue(row.plan?.maxBranches)],
            [c.cashiersStaff, planLimitValue(row.plan?.maxCashiers)],
            [c.products, planLimitValue(row.plan?.maxProducts)],
            [c.promotions, planLimitValue(row.plan?.maxPromotions)],
            [c.reports, planLimitValue(row.plan?.maxReports)],
            [c.monthlyPrice, row.plan?.monthlyPrice != null ? `${money(row.plan.monthlyPrice)} LAK` : "-"],
            [c.yearlyPrice, row.plan?.yearlyPrice != null ? `${money(row.plan.yearlyPrice)} LAK` : "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.setupStatus} subtitle={row.setupStatus} />
        <DetailGrid
          rows={[
            [c.businessCreated, <StatusBadge key="business-created" value={row.companyId !== "-" ? c.connected : c.notConnected} />],
            [c.storeBranchCreated, <StatusBadge key="store-created" value={row.primaryStoreName !== "-" ? c.connected : c.notConnected} />],
            [c.subscriptionStatus, <StatusBadge key="subscription-status" value={row.planStatus} />],
            [c.billingStatus, <StatusBadge key="billing-status-setup" value={row.billingStatus} />],
            [c.businessesMissingData, row.missingDataCount],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.billingReadiness} subtitle={c.proBillingNotEnabled} />
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/businesses">
            {c.viewBusiness}
          </Link>
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
            {c.viewStores}
          </Link>
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/users">
            {c.users}
          </Link>
          <DisabledPillButton label={c.changePlan} />
          <DisabledPillButton label={c.upgradeToPro} />
          <DisabledPillButton label={c.cancelSubscription} />
          <DisabledPillButton label={c.billingHistory} />
        </div>
      </section>

      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              businessId: row.companyId,
              businessTemplateKey: row.business.businessTemplateKey,
              currentPlan: row.currentPlan,
              ownerEmail: row.ownerEmail,
              ownerUsername: row.ownerUsername,
              planId: row.plan?.id,
              storeCode: row.storeCode,
              subscriptionId: row.subscriptionId,
              subscriptionStatus: row.planStatus,
            },
          },
        ]}
      />
    </div>
  );
}

function StorePerformancePage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [preset, setPreset] = useState<CommandDatePreset>("today");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState<PerformanceFilter>("all");
  const [search, setSearch] = useState("");
  const rows = buildStorePerformanceRows(data, preset, c);
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || row.business.name.toLowerCase().includes(query);
    const matchesTemplate = templateFilter === "all" || normalizePosTemplateKey(row.business.businessTemplateKey) === templateFilter;
    const matchesPlan = planFilter === "all" || row.planName === planFilter;
    const matchesPerformance =
      performanceFilter === "all"
      || (performanceFilter === "excellent" && row.score !== null && row.score >= 85)
      || (performanceFilter === "good" && row.score !== null && row.score >= 65 && row.score < 85)
      || (performanceFilter === "warning" && row.score !== null && row.score >= 40 && row.score < 65)
      || (performanceFilter === "critical" && row.score !== null && row.score < 40)
      || (performanceFilter === "unknown" && row.score === null);
    return matchesSearch && matchesTemplate && matchesPlan && matchesPerformance;
  });
  const scoredRows = visibleRows.filter((row) => row.score !== null);
  const averageScore = scoredRows.length ? Math.round(scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredRows.length) : c.notEnoughData;
  const topRows = [...visibleRows].filter((row) => row.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 5);
  const attentionRows = [...visibleRows].filter((row) => row.score !== null && row.score < 65).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).slice(0, 5);
  const dateOptions: Array<{ label: string; value: CommandDatePreset }> = [
    { label: c.today, value: "today" },
    { label: c.sevenDays, value: "7d" },
    { label: c.thirtyDays, value: "30d" },
    { label: c.thisMonth, value: "month" },
  ];
  const templateOptions = [{ label: c.filterAll, value: "all" }, ...templateDefinitions.map((template) => ({ label: posTemplateName(template, c), value: template.key }))];
  const planOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Set(data.businesses.map((business) => business.plan?.planName ?? c.free))).map((plan) => ({ label: plan, value: plan }))];
  const performanceOptions: Array<{ label: string; value: PerformanceFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.excellent, value: "excellent" },
    { label: c.good ?? "Good", value: "good" },
    { label: c.warning, value: "warning" },
    { label: c.critical, value: "critical" },
    { label: c.notEnoughData, value: "unknown" },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.storePerformancePageTitle}
        subtitle={c.storePerformanceSubtitle}
        controls={
          <>
            <FilterSelect label={c.dateRange} onChange={setPreset} options={dateOptions} value={preset} />
            <FilterSelect label={c.template} onChange={setTemplateFilter} options={templateOptions} value={templateFilter} />
            <FilterSelect label={c.plan} onChange={setPlanFilter} options={planOptions} value={planFilter} />
            <FilterSelect label={c.performanceFilter} onChange={setPerformanceFilter} options={performanceOptions} value={performanceFilter} />
            <SearchControl onChange={setSearch} placeholder={c.searchStores} value={search} />
            <RefreshButton />
            <ExportDisabledButton />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={c.scoreHelp} label={c.averagePerformanceScore} value={averageScore} />
        <SummaryCard helper={c.scoreHelp} label={c.excellentStores} value={visibleRows.filter((row) => row.score !== null && row.score >= 85).length} />
        <SummaryCard helper={c.scoreHelp} label={c.storesNeedingAttention} value={visibleRows.filter((row) => row.score !== null && row.score < 65).length} />
        <SummaryCard helper={c.storeDataNotConnected} label={c.stockAlertStores} value={visibleRows.filter((row) => (row.stockAlerts ?? 0) > 0).length} />
        <SummaryCard helper={c.storeDataNotConnected} label={c.syncIssueStores} value={0} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.topStoresBySales} subtitle={c.scoreHelp} />
          {topRows.length ? (
            <div className="grid gap-2">
              {topRows.map((row) => (
                <button className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#020617] p-3 text-left transition hover:border-[#5EEAD4]" key={row.business.id} onClick={() => onAction("store-performance-detail", row)} type="button">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#F8FAFC]">{row.business.name}</span>
                    <span className="text-xs text-[#94A3B8]">{row.templateName} | {row.planName}</span>
                  </span>
                  <ScoreBadge score={row.score} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState text={c.storePerformanceNotConnected} />
          )}
        </section>
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.storesNeedingAttention} subtitle={c.scoreHelp} />
          {attentionRows.length ? (
            <div className="grid gap-2">
              {attentionRows.map((row) => (
                <button className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#020617] p-3 text-left transition hover:border-[#5EEAD4]" key={row.business.id} onClick={() => onAction("store-performance-detail", row)} type="button">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#F8FAFC]">{row.business.name}</span>
                    <span className="text-xs text-[#94A3B8]">{row.syncStatus === "synced" ? c.connected : c.noData}</span>
                  </span>
                  <ScoreBadge score={row.score} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState text={c.storePerformanceNotConnected} />
          )}
        </section>
      </section>
      <StorePerformanceTable rows={visibleRows} onOpen={(row) => onAction("store-performance-detail", row)} />
      {!rows.length ? <EmptyPanel title={c.storePerformanceNotConnected} description={c.storePerformanceNotConnectedSubtext} /> : null}
    </div>
  );
}

type PlanAnalyticsFilter = "all" | "free" | "pro" | "trial" | "expiring";
type HealthStatusFilter = "all" | "healthy" | "warning" | "critical" | "not-connected";
type IntegrationCategoryFilter = "all" | "payment" | "messaging" | "accounting" | "backup" | "api" | "automation";
type IntegrationStatusFilter = "all" | "connected" | "not-connected" | "coming-soon";
type BackupFilter = "all" | "successful" | "failed" | "scheduled" | "manual" | "not-connected";

type IntegrationCard = {
  category: IntegrationCategoryFilter;
  description: string;
  icon: LucideIcon;
  id: string;
  name: string;
  requiredBackend: string;
  status: "not-connected" | "coming-soon";
};

type HealthService = {
  action: string;
  description: string;
  id: string;
  name: string;
  status: "not-connected";
};

function PlanAnalyticsPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [planFilter, setPlanFilter] = useState<PlanAnalyticsFilter>("all");
  const [search, setSearch] = useState("");
  const rows = buildPlanManagementRows(data, c);
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesPlan =
      planFilter === "all"
      || (planFilter === "free" && row.currentPlanKey.includes("free"))
      || (planFilter === "pro" && row.currentPlanKey.includes("pro"))
      || (planFilter === "trial" && row.currentPlanKey.includes("trial"))
      || (planFilter === "expiring" && String(row.planStatus).toLowerCase().includes("expir"));
    const matchesSearch = !query || `${row.businessName} ${row.primaryStoreName} ${row.owner} ${row.ownerEmail} ${row.ownerUsername} ${row.storeCode} ${row.currentPlan} ${row.template}`.toLowerCase().includes(query);
    return matchesPlan && matchesSearch;
  });
  const activeRows = rows.filter((row) => String(row.planStatus).toLowerCase().includes("active"));
  const freeRows = rows.filter((row) => row.currentPlanKey.includes("free"));
  const proRows = rows.filter((row) => row.currentPlanKey.includes("pro"));
  const trialRows = rows.filter((row) => row.currentPlanKey.includes("trial"));
  const expiringRows = rows.filter((row) => String(row.planStatus).toLowerCase().includes("expir"));
  const missingBillingRows = rows.filter((row) => row.billingStatus !== c.notRequired);
  const missingDataRows = rows.filter((row) => row.missingDataCount > 0 || row.planStatus === c.notConnected);
  const distribution = [
    { key: "free", label: c.freePlan, value: freeRows.length },
    { key: "pro", label: c.proPlan, value: proRows.length },
    { key: "trial", label: c.trialPlan, value: trialRows.length },
    { key: "missing", label: c.notConnected, value: missingDataRows.length },
  ].filter((item) => item.value > 0 || item.key !== "missing");
  const statusBreakdown = Array.from(new Set(rows.map((row) => row.planStatus || c.notConnected))).map((status) => ({
    label: status,
    value: rows.filter((row) => (row.planStatus || c.notConnected) === status).length,
  }));
  const planOptions: Array<{ label: string; value: PlanAnalyticsFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.freePlan, value: "free" },
    { label: c.proPlan, value: "pro" },
    { label: c.trialPlan, value: "trial" },
    { label: c.expiringSoon, value: "expiring" },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.planAnalytics}
        subtitle={c.planAnalyticsSubtitle}
        controls={
          <>
            <FilterSelect label={c.plan} onChange={setPlanFilter} options={planOptions} value={planFilter} />
            <SearchControl onChange={setSearch} placeholder={c.searchStores} value={search} />
            <RefreshButton />
            <ExportDisabledButton />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={rows.length ? c.planManagementSubtitle : c.planAnalyticsNotConnected} label={c.planRecords} value={rows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.freePlanBusinesses} value={freeRows.length} />
        <SummaryCard helper={rows.length ? c.proBillingNotEnabled : c.planAnalyticsNotConnected} label={c.proPlanBusinesses} value={proRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.trialStores} value={trialRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.activePlans} value={activeRows.length} />
        <SummaryCard helper={rows.length ? undefined : c.planAnalyticsNotConnected} label={c.expiringSoon} value={expiringRows.length} />
        <SummaryCard helper={rows.length ? c.proBillingNotEnabled : c.planAnalyticsNotConnected} label={c.plansMissingBilling} value={missingBillingRows.length} />
        <SummaryCard helper={c.upgradeOpportunitiesEmptySubtext} label={c.upgradeCandidates} value={0} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.planDistribution} subtitle={rows.length ? c.planManagementSubtitle : c.planDistributionNotConnected} />
          {rows.length ? (
            <div className="grid gap-3">
              {distribution.map((item) => (
                <div className="min-w-0" key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-[#F8FAFC]">{item.label}</span>
                    <span className="text-[#94A3B8]">{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#020617]">
                    <div className="h-full rounded-full bg-[#5EEAD4]" style={{ width: `${rows.length ? (item.value / rows.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title={c.planDistributionNotConnected} description={c.planAnalyticsNotConnected} />
          )}
        </section>
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.subscriptionStatus} subtitle={rows.length ? c.billingReadiness : c.planAnalyticsNotConnected} />
          {rows.length ? (
            <div className="grid gap-3">
              {statusBreakdown.map((item) => (
                <div className="min-w-0" key={item.label}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <StatusBadge value={item.label} />
                    <span className="text-[#94A3B8]">{item.value}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#020617]">
                    <div className="h-full rounded-full bg-[#38BDF8]" style={{ width: `${rows.length ? (item.value / rows.length) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title={c.planAnalyticsNotConnected} description={c.planUsageDataEmptySubtext} />
          )}
        </section>
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.upgradeOpportunities} subtitle={c.upgradeOpportunitiesEmptySubtext} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <EmptyPanel title={c.upgradeOpportunitiesEmpty} description={c.upgradeOpportunitiesEmptySubtext} />
          <div className="grid gap-2">
            <DisabledPillButton label={c.upgradeToPro} />
            <DisabledPillButton label={c.changePlan} />
            <DisabledPillButton label={c.billingHistory} />
          </div>
        </div>
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.planUsageTable} subtitle={c.planUsageDataEmptySubtext} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[
                      { key: "business", label: c.business },
                      { key: "store", label: c.primaryStore },
                      { key: "store-code", label: c.storeCode },
                      { key: "plan", label: c.currentPlan },
                      { key: "subscription", label: c.subscriptionStatus },
                      { key: "billing", label: c.billingStatus },
                      { key: "owner", label: c.owner },
                      { key: "template", label: c.template },
                      { key: "started", label: c.startedAt },
                      { key: "action", label: c.action },
                    ].map((column) => (
                      <th className="px-4 py-3 font-semibold" key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.companyId} onClick={() => onAction("plan-analytics-detail", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.businessName}</td>
                      <td className="px-4 py-3">{row.primaryStoreName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#CBD5E1]">{row.storeCode}</td>
                      <td className="px-4 py-3">{row.currentPlan}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.planStatus} /></td>
                      <td className="px-4 py-3"><StatusBadge value={row.billingStatus} /></td>
                      <td className="px-4 py-3">
                        <div>{row.owner}</div>
                        <div className="text-xs text-[#94A3B8]">{row.ownerEmail}</div>
                      </td>
                      <td className="px-4 py-3">{row.template}</td>
                      <td className="px-4 py-3">{row.startedAt ? new Date(row.startedAt).toLocaleDateString() : row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("plan-analytics-detail", row); }} type="button">
                            {c.viewPlan}
                          </button>
                          <Link className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/businesses" onClick={(event) => event.stopPropagation()}>
                            {c.viewBusiness}
                          </Link>
                          <Link className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/stores" onClick={(event) => event.stopPropagation()}>
                            {c.viewStore}
                          </Link>
                          <DisabledPillButton label={c.changePlan} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title={c.planUsageDataEmpty} description={c.planUsageDataEmptySubtext} />
        )}
      </section>
    </div>
  );
}

function PlanAnalyticsDetail({ row }: { row: PlanManagementRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={row.businessName} subtitle={row.currentPlan} />
        <DetailGrid
          rows={[
            [c.business, row.businessName],
            [c.primaryStore, row.primaryStoreName],
            [c.storeCode, row.storeCode],
            [c.currentPlan, row.currentPlan],
            [c.subscriptionStatus, <StatusBadge key="subscription-status" value={row.planStatus} />],
            [c.billingStatus, <StatusBadge key="billing-status" value={row.billingStatus} />],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.ownerAccount} subtitle={row.owner} />
        <DetailGrid
          rows={[
            [c.owner, row.owner],
            [c.ownerEmail, row.ownerEmail],
            [c.ownerUsername, row.ownerUsername],
            [c.template, row.template],
            [c.storesCount, row.storesCount],
            [c.setupStatus, row.setupStatus],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.planFeaturesLimits} subtitle={row.plan?.planName ?? row.currentPlan} />
        <DetailGrid
          rows={[
            [c.branchCount, planLimitValue(row.plan?.maxBranches)],
            [c.cashiersStaff, planLimitValue(row.plan?.maxCashiers)],
            [c.products, planLimitValue(row.plan?.maxProducts)],
            [c.promotions, planLimitValue(row.plan?.maxPromotions)],
            [c.reports, planLimitValue(row.plan?.maxReports)],
            [c.usage, row.plan ? c.connected : c.disabledNotConnected],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.billingReadiness} subtitle={c.proBillingNotEnabled} />
        <DetailGrid
          rows={[
            [c.billingStatus, <StatusBadge key="billing-status-detail" value={row.billingStatus} />],
            [c.monthlyPlatformRevenue, c.disabledNotConnected],
            [c.upgradeCandidates, c.disabledNotConnected],
            [c.expiringSoon, row.currentPlanKey.includes("pro") ? c.disabledNotConnected : c.notRequired],
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/plans">
            {c.viewPlan}
          </Link>
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/businesses">
            {c.viewBusiness}
          </Link>
          <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
            {c.viewStores}
          </Link>
          <DisabledPillButton label={c.changePlan} />
          <DisabledPillButton label={c.upgradeToPro} />
          <DisabledPillButton label={c.billingHistory} />
        </div>
      </section>
      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              businessId: row.companyId,
              branchId: row.business.branches?.[0]?.id,
              businessTemplateKey: row.business.businessTemplateKey,
              planId: row.plan?.id,
              storeCode: row.storeCode,
              subscriptionId: row.subscriptionId,
              subscriptionStatus: row.planStatus,
            },
          },
        ]}
      />
    </div>
  );
}

function SystemHealthPage({ onAction }: { onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [statusFilter, setStatusFilter] = useState<HealthStatusFilter>("all");
  const [search, setSearch] = useState("");
  const services: HealthService[] = [
    { action: c.runChecks, description: c.appHealthDescription, id: "app", name: c.appStatus, status: "not-connected" },
    { action: c.runChecks, description: c.databaseHealthDescription, id: "database", name: c.databaseStatus, status: "not-connected" },
    { action: c.runChecks, description: c.apiHealthDescription, id: "api", name: c.systemApiStatus, status: "not-connected" },
    { action: c.runChecks, description: c.syncWorkerDescription, id: "sync", name: c.syncStatus, status: "not-connected" },
    { action: c.configure, description: c.backupWorkerDescription, id: "backup", name: c.backupStatus, status: "not-connected" },
    { action: c.configure, description: c.storageProviderDescription, id: "storage", name: c.storageStatus, status: "not-connected" },
    { action: c.runChecks, description: c.queueJobsDescription, id: "queue", name: c.queueJobs, status: "not-connected" },
  ];
  const filtered = services.filter((service) => {
    const query = search.trim().toLowerCase();
    const matchesStatus = statusFilter === "all" || statusFilter === "not-connected";
    const matchesSearch = !query || `${service.name} ${service.description}`.toLowerCase().includes(query);
    return matchesStatus && matchesSearch;
  });
  const statusOptions: Array<{ label: string; value: HealthStatusFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.healthy, value: "healthy" },
    { label: c.warning, value: "warning" },
    { label: c.critical, value: "critical" },
    { label: c.notConnected, value: "not-connected" },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.systemHealth}
        subtitle={c.systemHealthSubtitle}
        controls={
          <>
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <SearchControl onChange={setSearch} placeholder={c.searchService} value={search} />
            <RefreshButton />
            <DisabledPillButton label={c.runChecks} />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        {[c.appStatus, c.databaseStatus, c.systemApiStatus, c.syncStatus, c.backupStatus, c.storageStatus].map((label) => (
          <SummaryCard helper={c.systemHealthNotConnected} key={label} label={label} value={c.notConnected} />
        ))}
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.serviceStatus} subtitle={c.systemHealthNotConnected} />
        <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                <tr>
                  {[
                    { key: "service", label: c.service },
                    { key: "status", label: c.status },
                    { key: "last-checked", label: c.lastChecked },
                    { key: "response-time", label: c.responseTime },
                    { key: "details", label: c.auditDetails },
                    { key: "action", label: c.action },
                  ].map((column) => (
                    <th className="px-4 py-3 font-semibold" key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((service) => (
                  <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={service.id} onClick={() => onAction("system-health-detail", service)}>
                    <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{service.name}</td>
                    <td className="px-4 py-3"><StatusBadge value={c.notConnected} /></td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">-</td>
                    <td className="px-4 py-3">{service.description}</td>
                    <td className="px-4 py-3"><DisabledPillButton label={service.action} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.systemChecks} subtitle={c.systemHealthNotConnected} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {services.slice(1).map((service) => (
            <article className="rounded-lg border border-[#334155] bg-[#020617] p-4" key={`check-${service.id}`}>
              <h3 className="font-semibold text-[#F8FAFC]">{service.name}</h3>
              <p className="mt-2 text-sm text-[#94A3B8]">{service.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <StatusBadge value={c.notConnected} />
                <DisabledPillButton label={service.action} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function SystemHealthDetail({ service }: { service: HealthService }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <DetailGrid
        rows={[
          [c.service, service.name],
          [c.status, <StatusBadge key="status" value={c.notConnected} />],
          [c.lastChecked, "-"],
          [c.responseTime, "-"],
          [c.readableSummary, service.description],
        ]}
      />
      <EmptyPanel title={c.systemHealthNotConnected} description={c.systemHealthSubtitle} />
      <AdvancedDetails sections={[{ title: c.metadata, value: { serviceId: service.id, connected: false } }]} />
    </div>
  );
}

function integrationCards(c: CenterCopy): IntegrationCard[] {
  return [
    { category: "payment", description: c.paymentGatewayDescription, icon: CreditCard, id: "payment-gateway", name: c.paymentGateway, requiredBackend: c.paymentGatewayBackend, status: "not-connected" },
    { category: "payment", description: c.qrPaymentDescription, icon: CreditCard, id: "qr-payment", name: c.qrPayment, requiredBackend: c.qrPaymentBackend, status: "not-connected" },
    { category: "messaging", description: c.smsWhatsappDescription, icon: Bell, id: "sms-whatsapp", name: c.smsWhatsapp, requiredBackend: c.smsWhatsappBackend, status: "coming-soon" },
    { category: "messaging", description: c.emailServiceDescription, icon: Bell, id: "email-service", name: c.emailService, requiredBackend: c.emailServiceBackend, status: "not-connected" },
    { category: "accounting", description: c.accountingDescription, icon: ClipboardList, id: "accounting", name: c.accounting, requiredBackend: c.accountingBackend, status: "coming-soon" },
    { category: "backup", description: c.cloudBackupDescription, icon: Download, id: "cloud-backup", name: c.cloudBackup, requiredBackend: c.cloudBackupBackend, status: "not-connected" },
    { category: "api", description: c.apiKeysDescription, icon: Shield, id: "api-keys", name: c.apiKeys, requiredBackend: c.apiKeysBackend, status: "not-connected" },
    { category: "automation", description: c.webhooksDescription, icon: Activity, id: "webhooks", name: c.webhooks, requiredBackend: c.webhooksBackend, status: "coming-soon" },
    { category: "automation", description: c.ecommerceSyncDescription, icon: Store, id: "ecommerce-sync", name: c.ecommerceSync, requiredBackend: c.ecommerceSyncBackend, status: "coming-soon" },
    { category: "messaging", description: c.notificationServiceDescription, icon: Bell, id: "notification-service", name: c.notificationService, requiredBackend: c.notificationServiceBackend, status: "not-connected" },
  ];
}

function IntegrationsPage({ onAction }: { onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [category, setCategory] = useState<IntegrationCategoryFilter>("all");
  const [status, setStatus] = useState<IntegrationStatusFilter>("all");
  const [search, setSearch] = useState("");
  const cards = integrationCards(c);
  const visibleCards = cards.filter((card) => {
    const query = search.trim().toLowerCase();
    const matchesCategory = category === "all" || card.category === category;
    const matchesStatus = status === "all" || card.status === status;
    const matchesSearch = !query || `${card.name} ${card.description}`.toLowerCase().includes(query);
    return matchesCategory && matchesStatus && matchesSearch;
  });
  const categoryOptions: Array<{ label: string; value: IntegrationCategoryFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.payment, value: "payment" },
    { label: c.messaging, value: "messaging" },
    { label: c.accounting, value: "accounting" },
    { label: c.backup, value: "backup" },
    { label: c.api, value: "api" },
    { label: c.automation, value: "automation" },
  ];
  const statusOptions: Array<{ label: string; value: IntegrationStatusFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.connected, value: "connected" },
    { label: c.notConnected, value: "not-connected" },
    { label: c.comingSoon, value: "coming-soon" },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.integrations}
        subtitle={c.integrationsSubtitle}
        controls={
          <>
            <FilterSelect label={c.category} onChange={setCategory} options={categoryOptions} value={category} />
            <FilterSelect label={c.status} onChange={setStatus} options={statusOptions} value={status} />
            <SearchControl onChange={setSearch} placeholder={c.searchIntegrations} value={search} />
            <RefreshButton />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={c.integrationStatusNotConnected} label={c.connected} value={0} />
        <SummaryCard helper={c.integrationStatusNotConnected} label={c.notConnected} value={cards.filter((card) => card.status === "not-connected").length} />
        <SummaryCard helper={c.integrationStatusNotConnected} label={c.comingSoon} value={cards.filter((card) => card.status === "coming-soon").length} />
        <SummaryCard helper={c.integrationStatusNotConnected} label={c.requiresSetup} value={cards.length} />
        <SummaryCard helper={c.integrationStatusNotConnected} label={c.availableIntegrations} value={cards.length} />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4" key={card.id}>
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-md border border-[#5EEAD4]/35 bg-[#5EEAD4]/[0.12] text-[#5EEAD4]">
                  <Icon className="size-4" />
                </span>
                <StatusBadge value={card.status === "coming-soon" ? c.comingSoon : c.notConnected} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-[#F8FAFC]">{card.name}</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{card.category}</p>
              <p className="mt-2 min-h-12 text-sm text-[#94A3B8]">{card.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <DisabledPillButton label={c.configure} />
                <button className="rounded-md border border-[#334155] px-3 py-2 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={() => onAction("integration-detail", card)} type="button">
                  {c.viewDetails}
                </button>
              </div>
            </article>
          );
        })}
      </section>
      {!visibleCards.length ? <EmptyPanel title={c.integrationsEmpty} description={c.integrationsEmptySubtext} /> : null}
    </div>
  );
}

function IntegrationDetail({ integration }: { integration: IntegrationCard }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <DetailGrid
        rows={[
          [c.integrations, integration.name],
          [c.category, integration.category],
          [c.status, <StatusBadge key="status" value={integration.status === "coming-soon" ? c.comingSoon : c.notConnected} />],
          [c.whatThisIntegrationDoes, integration.description],
          [c.requiresSetup, integration.requiredBackend],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <DisabledPillButton label={c.configure} />
        <DisabledPillButton label={c.testConnection} />
      </div>
      <AdvancedDetails sections={[{ title: c.metadata, value: { id: integration.id, category: integration.category, connected: false } }]} />
    </div>
  );
}

function BackupRestorePage() {
  const { c } = useCenterCopy();
  const [filter, setFilter] = useState<BackupFilter>("all");
  const [search, setSearch] = useState("");
  const backupOptions: Array<{ label: string; value: BackupFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.successful, value: "successful" },
    { label: c.failed, value: "failed" },
    { label: c.scheduled, value: "scheduled" },
    { label: c.manual, value: "manual" },
    { label: c.notConnected, value: "not-connected" },
  ];
  const settings = [
    { id: "auto", label: c.autoBackup, value: c.notConnected },
    { id: "frequency", label: c.frequency, value: "-" },
    { id: "destination", label: c.backupDestination, value: c.notConnected },
    { id: "retention", label: c.retentionPeriod, value: "-" },
    { id: "encryption", label: c.encryption, value: c.notConnected },
    { id: "alerts", label: c.notificationAlerts, value: c.notConnected },
  ];

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.backupRestore}
        subtitle={c.backupRestoreSubtitle}
        controls={
          <>
            <FilterSelect label={c.backupFilter} onChange={setFilter} options={backupOptions} value={filter} />
            <SearchControl onChange={setSearch} placeholder={c.searchBackupHistory} value={search} />
            <RefreshButton />
            <DisabledPillButton label={c.createBackup} />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard label={c.lastBackup} value="-" />
        <SummaryCard label={c.backupStatus} value={c.notConnected} />
        <SummaryCard label={c.autoBackup} value={c.notConnected} />
        <SummaryCard label={c.storageUsed} value="-" />
        <SummaryCard label={c.restorePoints} value={0} />
        <SummaryCard label={c.failedBackups} value={0} />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.backupSettings} subtitle={c.backupServiceNotConnected} />
          <div className="grid gap-2">
            {settings.map((item) => (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#020617] p-3" key={item.id}>
                <div className="min-w-0">
                  <div className="font-semibold text-[#F8FAFC]">{item.label}</div>
                  <div className="mt-1 text-sm text-[#94A3B8]">{item.value}</div>
                </div>
                <DisabledPillButton label={c.configure} />
              </div>
            ))}
          </div>
        </section>
        <section className={dashboardPanelClass()}>
          <CommandSectionTitle title={c.manualBackup} subtitle={c.manualBackupDescription} />
          <p className="text-sm text-[#94A3B8]">{c.backupServiceNotConnected}</p>
          <div className="mt-4">
            <DisabledPillButton label={c.createBackup} />
          </div>
        </section>
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.restoreHistory} subtitle={c.restoreHistoryEmptySubtext} />
        <EmptyPanel title={c.restoreHistoryEmpty} description={c.restoreHistoryEmptySubtext} />
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.backupStorage} subtitle={c.backupStorageNotConnected} />
        <DetailGrid
          rows={[
            [c.backupDestination, c.notConnected],
            [c.storageUsed, "-"],
            [c.retentionPeriod, "-"],
            [c.syncedAt, "-"],
            [c.status, <StatusBadge key="status" value={c.notConnected} />],
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <DisabledPillButton label={c.configureStorage} />
          <DisabledPillButton label={c.restore} />
          <DisabledPillButton label={c.downloadBackup} />
        </div>
      </section>
    </div>
  );
}

function DashboardMetricDetail({ data, drawer }: { data: CenterData; drawer: DrawerKind }) {
  const { c } = useCenterCopy();
  const rows = buildStorePerformanceRows(data, "today", c);
  const activeRows = rows.filter((row) => row.todayBillCount > 0 || inDateRange(row.lastActive, "today"));
  const totalSales = rows.reduce((sum, row) => sum + row.todaySalesLak, 0);
  const totalBills = rows.reduce((sum, row) => sum + row.todayBillCount, 0);
  const topRows = [...rows].filter((row) => row.todaySalesLak > 0 || row.todayBillCount > 0).sort((a, b) => b.todaySalesLak - a.todaySalesLak).slice(0, 10);

  if (drawer === "active-stores-today") {
    return (
      <div className="grid gap-4">
        <DetailGrid rows={[[c.activeStoresToday, String(activeRows.length)], [c.totalBusinesses, String(data.businesses.length)]]} />
        {activeRows.length ? (
          <div className="grid gap-2">
            {activeRows.map((row) => (
              <div className="rounded-lg border border-[#334155] bg-[#111827] p-4" key={row.business.id}>
                <div className="font-semibold text-[#F8FAFC]">{row.business.name}</div>
                <div className="mt-1 text-sm text-[#94A3B8]">{row.lastActive ? new Date(row.lastActive).toLocaleString() : c.noData}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={c.emptyNoStorePerformance} />
        )}
      </div>
    );
  }

  if (drawer === "sales-today") {
    return (
      <div className="grid gap-4">
        <DetailGrid rows={[[c.totalSalesToday, formatCompactMoney(totalSales)], [c.totalBillsToday, String(totalBills)], [c.averageBill, formatCompactMoney(totalBills ? totalSales / totalBills : 0)]]} />
        {topRows.length ? <SimpleTemplateList items={topRows.map((row) => `${row.business.name}: ${formatCompactMoney(row.todaySalesLak)} / ${row.todayBillCount} ${c.bills}`)} /> : <EmptyState text={c.emptyNoSalesData} />}
      </div>
    );
  }

  if (drawer === "bills-today") {
    return (
      <div className="grid gap-4">
        <DetailGrid rows={[[c.totalBillsToday, String(totalBills)], [c.totalSalesToday, formatCompactMoney(totalSales)], [c.averageBill, formatCompactMoney(totalBills ? totalSales / totalBills : 0)]]} />
        {topRows.length ? <SimpleTemplateList items={topRows.map((row) => `${row.business.name}: ${row.todayBillCount} ${c.bills}`)} /> : <EmptyState text={c.emptyNoSalesData} />}
      </div>
    );
  }

  return <EmptyState text={c.sectionEmpty} />;
}

function AccessDeniedPanel() {
  const { c } = useCenterCopy();
  return (
    <section className="rounded-lg border border-[#334155] bg-[#111827] p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-[#334155] bg-[#1E293B] text-[#5EEAD4]">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#F8FAFC]">{c.accessDenied}</h2>
          <p className="mt-2 text-sm text-[#94A3B8]">{c.youDoNotHavePermissionToViewThisSection}</p>
        </div>
      </div>
    </section>
  );
}

function BusinessTable({
  businesses,
  onAction,
  role,
}: {
  businesses: CenterBusiness[];
  onAction: (drawer: DrawerKind, selected?: unknown) => void;
  role?: string | null;
}) {
  const { c } = useCenterCopy();
  const canChangePlan = canUsePlatformAction(role, PLATFORM_ACTIONS.PLAN_CHANGE);
  const canManageFeatures = canUsePlatformAction(role, PLATFORM_ACTIONS.FEATURE_TOGGLE);
  const canView = canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW);
  const canDestructivelyManageBusiness =
    canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_ARCHIVE) || canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_DELETE);
  const businessActions = [
    canView ? { drawer: "business-view" as DrawerKind, label: c.view } : null,
    isSuperAdminRole(role) ? { drawer: "business-edit" as DrawerKind, label: c.edit } : null,
    canChangePlan ? { drawer: "business-plan" as DrawerKind, label: c.changePlan } : null,
    canManageFeatures ? { drawer: "business-features" as DrawerKind, label: c.manageFeatures } : null,
    isSuperAdminRole(role) ? { drawer: "business-owner" as DrawerKind, label: c.manageOwner } : null,
    canDestructivelyManageBusiness ? { drawer: "business-suspend" as DrawerKind, label: c.archiveDelete } : null,
  ].filter(Boolean) as Array<{ drawer: DrawerKind; label: string }>;
  if (!businesses.length) {
    return <EmptyState text={c.emptyBusinesses} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="sticky top-0 bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {[c.business, c.owner, c.template, c.plan, c.status, "Users", "Branches", c.lastActive, "Actions"].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.map((business) => (
              <tr className="border-t border-[#334155]" key={business.id}>
                <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{business.name}</td>
                <td className="px-4 py-3">
                  <div>{business.owner?.fullName ?? "-"}</div>
                  <div className="text-xs text-[#94A3B8]">{business.owner?.email ?? business.owner?.username ?? "-"}</div>
                </td>
                <td className="px-4 py-3">{posTemplateNameFromKey(business.businessTemplateKey, c)}</td>
                <td className="px-4 py-3">{business.plan?.planName ?? c.free}</td>
                <td className="px-4 py-3"><StatusBadge value={business.status} /></td>
                <td className="px-4 py-3">{business._count?.members ?? 0}</td>
                <td className="px-4 py-3">{business._count?.branches ?? business.branches?.length ?? 0}</td>
                <td className="px-4 py-3">{business.createdAt ? new Date(business.createdAt).toLocaleDateString() : "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {businessActions.map(({ label, drawer }) => (
                      <button
                        className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]"
                        key={drawer}
                        onClick={() => onAction(drawer, business)}
                        type="button"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsTable({ logs, onOpen }: { logs: CenterLog[]; onOpen: (log: CenterLog) => void }) {
  const { c } = useCenterCopy();
  if (!logs.length) {
    return <EmptyState text={c.emptyLogs} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {["Date / Time", "Actor", "Action", "Target", "Details"].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id} onClick={() => onOpen(log)}>
                <td className="px-4 py-3">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">{log.user?.fullName ?? log.user?.username ?? "-"}</td>
                <td className="px-4 py-3">{log.action ?? "-"}</td>
                <td className="px-4 py-3">{log.company?.name ?? "-"}</td>
                <td className="px-4 py-3">
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(log); }} type="button">
                    {c.view}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-[#94A3B8]">-</span>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span>{String(value)}</span>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-lg border border-[#334155] bg-[#020617] p-3 text-xs leading-relaxed text-[#CBD5E1]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function hasAdvancedValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function formatReadableValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  return "Details available";
}

function AdvancedDetails({ sections }: { sections: Array<{ title: string; value: unknown }> }) {
  const { c } = useCenterCopy();
  const visibleSections = sections.filter((section) => hasAdvancedValue(section.value));
  if (!visibleSections.length) {
    return null;
  }

  return (
    <details className="rounded-lg border border-[#334155] bg-[#111827]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#5EEAD4]">{c.advancedDetails}</summary>
      <div className="grid gap-4 border-t border-[#334155] p-4">
        {visibleSections.map((section) => (
          <section className="min-w-0" key={section.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{section.title}</h3>
            <AuditValue value={section.value} />
          </section>
        ))}
      </div>
    </details>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([label, value]) => (
        <div className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-4" key={label}>
          <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div>
          <div className="mt-2 min-w-0 break-words text-sm text-[#F8FAFC]">{value}</div>
        </div>
      ))}
    </div>
  );
}

function PlatformAuditTable({ logs, onOpen }: { logs: PlatformAuditLog[]; onOpen: (log: PlatformAuditLog) => void }) {
  const { c } = useCenterCopy();
  if (!logs.length) {
    return <EmptyState text={c.noPlatformAuditLogs} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {[c.dateTime, c.actor, c.role, c.action, c.target, c.status, c.severity, c.auditDetails].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id} onClick={() => onOpen(log)}>
                <td className="px-4 py-3 whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">{log.actorName || log.actorEmail || "-"}</td>
                <td className="px-4 py-3">{log.actorRole ?? log.actorType ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-[#F8FAFC]">{log.action}</td>
                <td className="px-4 py-3">{log.targetName ?? log.targetType ?? "-"}</td>
                <td className="px-4 py-3"><StatusBadge value={log.status ?? "success"} /></td>
                <td className="px-4 py-3"><StatusBadge value={log.severity ?? "info"} /></td>
                <td className="px-4 py-3">
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(log); }} type="button">
                    {c.view}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StoreActivityTable({ logs, onOpen }: { logs: StoreActivityLog[]; onOpen: (log: StoreActivityLog) => void }) {
  const { c } = useCenterCopy();
  if (!logs.length) {
    return <EmptyState text={c.noStoreActivityLogs} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {[c.dateTime, c.occurredAt, c.syncedAt, c.storeUser, c.role, c.action, c.target, c.amount, c.currency, c.terminal, c.auditDetails].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id} onClick={() => onOpen(log)}>
                <td className="px-4 py-3 whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{log.occurredAt ? new Date(log.occurredAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap">{log.syncedAt ? new Date(log.syncedAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">{log.actorName}</td>
                <td className="px-4 py-3">{log.actorRole}</td>
                <td className="px-4 py-3 font-medium text-[#F8FAFC]">{log.action}</td>
                <td className="px-4 py-3">{log.targetName ?? log.targetType ?? "-"}</td>
                <td className="px-4 py-3">{log.amount ?? "-"}</td>
                <td className="px-4 py-3">{log.currency ?? "LAK"}</td>
                <td className="px-4 py-3">{log.terminalName ?? log.deviceName ?? "-"}</td>
                <td className="px-4 py-3">
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); onOpen(log); }} type="button">
                    {c.view}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AuditLogsCenter({
  data,
  onAction,
  role,
}: {
  data: CenterData;
  onAction: (drawer: DrawerKind, selected?: unknown) => void;
  role?: string | null;
}) {
  const { c } = useCenterCopy();
  const [preset, setPreset] = useState<CommandDatePreset>("30d");
  const [moduleFilter, setModuleFilter] = useState<AuditModuleFilter>("all");
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<AuditStatusFilter>("all");
  const [search, setSearch] = useState("");
  if (!isSuperAdminRole(role)) {
    return <AccessDeniedPanel />;
  }
  const rows = buildAuditLogRows(data, c);
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesDate = row.date ? inDateRange(row.date, preset) : false;
    const matchesModule = moduleFilter === "all" || row.moduleFilter === moduleFilter;
    const matchesAction = actionFilter === "all" || row.actionFilter === actionFilter;
    const matchesStatus = statusFilter === "all" || row.statusFilter === statusFilter;
    const matchesSearch = !query || `${row.actor} ${row.action} ${row.module} ${row.business} ${row.store} ${row.target} ${row.metadataSearch}`.toLowerCase().includes(query);
    return matchesDate && matchesModule && matchesAction && matchesStatus && matchesSearch;
  });
  const createRows = rows.filter((row) => row.actionFilter === "create");
  const updateRows = rows.filter((row) => row.actionFilter === "update");
  const failedRows = rows.filter((row) => row.statusFilter === "failed");
  const securityRows = rows.filter((row) => row.actionFilter === "permission" || row.statusFilter === "failed" || row.status.toLowerCase().includes("security"));
  const systemRows = rows.filter((row) => row.moduleFilter === "system" || row.moduleFilter === "super-admin");
  const dateOptions: Array<{ label: string; value: CommandDatePreset }> = [
    { label: c.today, value: "today" },
    { label: c.sevenDays, value: "7d" },
    { label: c.thirtyDays, value: "30d" },
    { label: c.thisMonth, value: "month" },
  ];
  const moduleOptions: Array<{ label: string; value: AuditModuleFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: "Super Admin", value: "super-admin" },
    { label: c.business, value: "business" },
    { label: c.store, value: "store" },
    { label: c.plan, value: "plan" },
    { label: c.users, value: "user" },
    { label: c.rolesPermissions, value: "role" },
    { label: "POS", value: "pos" },
    { label: c.inventory, value: "inventory" },
    { label: c.systemVault ?? "System", value: "system" },
  ];
  const actionOptions: Array<{ label: string; value: AuditActionFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.createActions, value: "create" },
    { label: c.updateActions, value: "update" },
    { label: c.archiveDelete, value: "delete" },
    { label: c.login, value: "login" },
    { label: c.requiresPermission, value: "permission" },
    { label: c.error, value: "error" },
    { label: c.other ?? "Other", value: "other" },
  ];
  const statusOptions: Array<{ label: string; value: AuditStatusFilter }> = [
    { label: c.filterAll, value: "all" },
    { label: c.successful, value: "success" },
    { label: c.failed, value: "failed" },
    { label: c.warning, value: "warning" },
    { label: c.info, value: "info" },
    { label: c.unknown ?? "Unknown", value: "unknown" },
  ];
  const helper = rows.length ? undefined : c.noAuditLogsConnectedSubtext;

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.auditLogs}
        subtitle={c.auditLogsSubtitle}
        controls={
          <>
            <FilterSelect label={c.dateRange} onChange={setPreset} options={dateOptions} value={preset} />
            <FilterSelect label={c.moduleFilter} onChange={setModuleFilter} options={moduleOptions} value={moduleFilter} />
            <FilterSelect label={c.action} onChange={setActionFilter} options={actionOptions} value={actionFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <SearchControl onChange={setSearch} placeholder={c.search} value={search} />
            <RefreshButton />
            <ExportDisabledButton />
          </>
        }
      />
      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,12rem),1fr))] gap-3">
        <SummaryCard helper={helper} label={c.totalLogs} value={rows.length} />
        <SummaryCard helper={helper} label={c.createActions} value={createRows.length} />
        <SummaryCard helper={helper} label={c.updateActions} value={updateRows.length} />
        <SummaryCard helper={helper} label={c.failedActions} value={failedRows.length} />
        <SummaryCard helper={helper} label={c.securityPermissionEvents} value={securityRows.length} />
        <SummaryCard helper={helper} label={c.systemEvents} value={systemRows.length} />
      </section>
      <section className={dashboardPanelClass()}>
        <CommandSectionTitle title={c.auditLogs} subtitle={rows.length ? c.auditLogsSubtitle : c.noAuditLogsConnectedSubtext} />
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[
                      { key: "date", label: c.dateTime },
                      { key: "actor", label: c.actor },
                      { key: "action", label: c.action },
                      { key: "module", label: c.module },
                      { key: "business", label: c.businessStore },
                      { key: "target", label: c.target },
                      { key: "status", label: c.status },
                      { key: "details", label: c.auditDetails },
                      { key: "actions", label: c.actions },
                    ].map((column) => (
                      <th className="px-4 py-3 font-semibold" key={column.key}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.id} onClick={() => openAuditLogRow(row, onAction)}>
                      <td className="whitespace-nowrap px-4 py-3">{row.date ? new Date(row.date).toLocaleString() : "-"}</td>
                      <td className="px-4 py-3">{row.actor}</td>
                      <td className="px-4 py-3 font-medium text-[#F8FAFC]">{row.action}</td>
                      <td className="px-4 py-3">{row.module}</td>
                      <td className="px-4 py-3">
                        <div>{row.business}</div>
                        {row.store !== "-" ? <div className="text-xs text-[#94A3B8]">{row.store}</div> : null}
                      </td>
                      <td className="px-4 py-3">{row.target}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3">
                        <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={(event) => { event.stopPropagation(); openAuditLogRow(row, onAction); }} type="button">
                          {c.viewDetails}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Link className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/businesses" onClick={(event) => event.stopPropagation()}>
                            {c.viewBusiness}
                          </Link>
                          <Link className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/super-admin/stores" onClick={(event) => event.stopPropagation()}>
                            {c.viewStore}
                          </Link>
                          <DisabledPillButton label={c.restoreRevert} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title={c.noAuditLogsConnected} description={c.noAuditLogsConnectedSubtext} />
        )}
      </section>
    </div>
  );
}

function PlatformAuditDetail({ log }: { log: PlatformAuditLog }) {
  const { c } = useCenterCopy();
  const summary = `${log.actorName || log.actorEmail || c.platformAudit} ${log.action} ${log.targetName ?? log.targetType ?? ""}`.trim();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.eventOverview} subtitle={log.action} />
        <DetailGrid
          rows={[
            [c.dateTime, log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"],
            [c.action, log.action],
            [c.module, auditModuleLabel(auditModuleFilter(log.action, log.targetType), c)],
            [c.status, <StatusBadge key="status" value={log.status ?? "success"} />],
            [c.severity, <StatusBadge key="severity" value={log.severity ?? "info"} />],
            [c.target, `${log.targetType ?? "-"}${log.targetName ? `: ${log.targetName}` : ""}`],
            [c.readableSummary, summary || "-"],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.actor} subtitle={log.actorName || log.actorEmail || "-"} />
        <DetailGrid
          rows={[
            [c.actor, log.actorName || "-"],
            [c.email, log.actorEmail ?? "-"],
            [c.role, log.actorRole ?? log.actorType ?? "-"],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessStore} subtitle={log.business?.name ?? "-"} />
        <DetailGrid
          rows={[
            [c.business, log.business?.name ?? "-"],
            [c.store, "-"],
            [c.storeCode, "-"],
            [c.template, "-"],
            [c.plan, "-"],
          ]}
        />
      </section>
      <AdvancedDetails
        sections={[
          { title: c.changeSummary, value: { after: sanitizeAuditValue(log.afterValue), before: sanitizeAuditValue(log.beforeValue) } },
          { title: c.metadata, value: sanitizeAuditValue(log.metadata) },
          { title: "IDs", value: { actorId: log.actorId, businessId: log.businessId, requestId: log.requestId, targetId: log.targetId } },
          { title: c.technicalMetadata, value: sanitizeAuditValue({ ipAddress: log.ipAddress, userAgent: log.userAgent }) },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/businesses">
          {c.viewBusiness}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
          {c.viewStore}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/users">
          {c.viewUser}
        </Link>
        <DisabledPillButton label={c.deleteLogs} />
        <DisabledPillButton label={c.restoreRevert} />
      </div>
    </div>
  );
}

function StoreActivityDetail({ log }: { log: StoreActivityLog }) {
  const { c } = useCenterCopy();
  const summary = `${log.actorName} ${log.action} ${log.targetName ?? log.targetType ?? ""}`.trim();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.eventOverview} subtitle={log.action} />
        <DetailGrid
          rows={[
            [c.dateTime, log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"],
            [c.occurredAt, log.occurredAt ? new Date(log.occurredAt).toLocaleString() : "-"],
            [c.action, log.action],
            [c.module, auditModuleLabel(auditModuleFilter(log.action, log.targetType), c)],
            [c.status, <StatusBadge key="status" value={log.status ?? "success"} />],
            [c.target, `${log.targetType ?? "-"}${log.targetName ? `: ${log.targetName}` : ""}`],
            [c.readableSummary, summary || "-"],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.actor} subtitle={log.actorName} />
        <DetailGrid
          rows={[
            [c.storeUser, log.actorName],
            [c.role, log.actorRole],
            [c.terminal, log.terminalName ?? log.deviceName ?? "-"],
            [c.syncedAt, log.syncedAt ? new Date(log.syncedAt).toLocaleString() : "-"],
          ]}
        />
      </section>
      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessStore} subtitle={log.business?.name ?? "-"} />
        <DetailGrid
          rows={[
            [c.business, log.business?.name ?? "-"],
            [c.store, log.branch?.name ?? "-"],
            [c.amount, log.amount ?? "-"],
            [c.currency, log.currency ?? "LAK"],
          ]}
        />
      </section>
      <AdvancedDetails
        sections={[
          { title: c.changeSummary, value: { after: sanitizeAuditValue(log.afterValue), before: sanitizeAuditValue(log.beforeValue) } },
          { title: c.metadata, value: sanitizeAuditValue(log.metadata) },
          { title: "IDs", value: { actorId: log.actorId, branchId: log.branch?.id, businessId: log.businessId, targetId: log.targetId } },
          { title: c.technicalMetadata, value: sanitizeAuditValue({ deviceName: log.deviceName, terminalName: log.terminalName }) },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/businesses">
          {c.viewBusiness}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/stores">
          {c.viewStore}
        </Link>
        <Link className="inline-flex h-9 items-center rounded-md border border-[#5EEAD4] px-3 text-xs font-semibold text-[#5EEAD4] transition hover:bg-[#5EEAD4]/10" href="/super-admin/users">
          {c.viewUser}
        </Link>
        <DisabledPillButton label={c.deleteLogs} />
        <DisabledPillButton label={c.restoreRevert} />
      </div>
    </div>
  );
}

function DashboardNotifications({ onOpen }: { onOpen: () => void }) {
  const { c } = useCenterCopy();
  return (
    <Panel title={c.platformNotifications}>
      <button
        className="w-full rounded-lg border border-dashed border-[#475569] bg-[#111827] p-5 text-left text-sm text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
        onClick={onOpen}
        type="button"
      >
        {c.noPlatformNotifications}
      </button>
    </Panel>
  );
}

function DashboardPosTemplateStatus({ onOpen }: { onOpen: (template: PosTemplateDefinition) => void }) {
  const { c } = useCenterCopy();
  return (
    <Panel title={c.posTemplateStatus}>
      <div className="grid gap-2">
        {templateDefinitions.map((template) => (
          <button
            className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-[#334155] bg-[#111827] px-4 py-3 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
            key={template.key}
            onClick={() => onOpen(template)}
            type="button"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-[#F8FAFC]">{posTemplateName(template, c)}</span>
            <span className="flex shrink-0 items-center gap-3">
              <StatusBadge value={templateStatusLabel(template.status, c)} />
              <ChevronRight className="size-4 text-[#94A3B8]" />
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function DashboardRecentActivity({ logs, onOpen, onViewAll }: { logs: CenterLog[]; onOpen: (log: CenterLog) => void; onViewAll: () => void }) {
  const { c } = useCenterCopy();
  return (
    <Panel title={c.recentActivity}>
      <div className="grid gap-3">
        {logs.length ? <LogsTable logs={logs.slice(0, 5)} onOpen={onOpen} /> : <EmptyState text={c.noRecentActivity} />}
        <button className="w-fit rounded-md border border-[#334155] px-4 py-2 text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]" onClick={onViewAll} type="button">
          {c.viewAll}
        </button>
      </div>
    </Panel>
  );
}

function TemplateList({ businesses, onAction }: { businesses: CenterBusiness[]; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const usedByKey = new Map<string, number>();
  businesses.forEach((business) => {
    const key = normalizePosTemplateKey(business.businessTemplateKey);
    usedByKey.set(key, (usedByKey.get(key) ?? 0) + 1);
  });
  return (
    <div className="grid gap-3">
      {templateDefinitions.map((template) => (
        <div
          className="w-full cursor-pointer rounded-lg border border-[#334155] bg-[#111827] p-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
          key={template.key}
          onClick={() => onAction("pos-template-detail", template)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onAction("pos-template-detail", template);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-[#F8FAFC]">{posTemplateName(template, c)}</h3>
              <p className="mt-1 text-sm text-[#94A3B8]">{template.features.join(" • ")}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={templateStatusLabel(template.status, c)} />
              <span className="rounded-md border border-[#334155] px-2 py-1 text-xs text-[#CBD5E1]">
                {usedByKey.get(template.key) ?? 0} {c.stores}
              </span>
              <ChevronRight className="size-4 text-[#94A3B8]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getPosTemplate(selected: unknown): PosTemplateDefinition | null {
  const value = selected as { template?: PosTemplateDefinition; key?: string } | PosTemplateDefinition | null;
  const key = value && "template" in value ? value.template?.key : value?.key;
  return templateDefinitions.find((template) => template.key === key) ?? null;
}

function storesForTemplate(businesses: CenterBusiness[], template: PosTemplateDefinition) {
  return businesses.filter((business) => normalizePosTemplateKey(business.businessTemplateKey) === template.key);
}

function templateIntegration(template: PosTemplateDefinition) {
  if (template.integration.length) {
    return template.integration;
  }
  return [
    { key: "modules", title: "Modules Integration", status: "Need Setup", checklist: ["Draft module definition exists", "Live routes are not enabled yet"], whatToFix: ["Build and verify module routes before activation"], related: [template.name] },
    { key: "pos", title: "POS Workflow Integration", status: "Not Verified", checklist: ["POS workflow is draft", "Checkout behavior is not verified"], whatToFix: ["Verify checkout workflow before template activation"], related: ["POS"] },
    { key: "inventory", title: "Inventory Integration", status: "Need Review", checklist: ["Inventory requirements are defined", "Stock behavior needs validation"], whatToFix: ["Verify stock behavior for this template"], related: ["Inventory"] },
    { key: "reports", title: "Reports Integration", status: "Need Setup", checklist: ["Report groups are defined", "Report calculations are not connected yet"], whatToFix: ["Connect template report groups to real data"], related: ["Reports"] },
    { key: "plans", title: "Plan Lock Integration", status: "Need Setup", checklist: ["Draft plan locks are listed", "Plan engine mapping is not connected"], whatToFix: ["Map Free/Pro locks for this POS type"], related: ["Plans & Features"] },
    { key: "permissions", title: "Permission Integration", status: "Need Setup", checklist: ["Default role permissions are drafted", "Store role application is not verified"], whatToFix: ["Verify role defaults during store creation"], related: ["Roles"] },
    { key: "settings", title: "Settings Integration", status: "Need Setup", checklist: ["Settings defaults are drafted", "Apply-to-store behavior is not connected"], whatToFix: ["Add safe apply flow before activation"], related: ["Settings"] },
  ];
}

function PosTemplateDetail({ onAction, template }: { onAction: (drawer: DrawerKind, selected?: unknown) => void; template: PosTemplateDefinition }) {
  const { c } = useCenterCopy();
  const rows: Array<{ disabled?: boolean; drawer?: DrawerKind; label: string }> = [
    { disabled: template.key !== "mini-mart", drawer: "pos-template-stores", label: template.key === "mini-mart" ? c.openMiniMartPos : c.openPosDashboard },
    { drawer: "pos-template-stores", label: c.storesUsingTemplate },
    { drawer: "pos-template-modules", label: c.modules },
    { drawer: "pos-template-features", label: c.features },
    { drawer: "pos-template-plan-locks", label: c.planLocks },
    { drawer: "pos-template-permissions", label: c.defaultPermissions },
    { drawer: "pos-template-reports", label: c.reports },
    { drawer: "pos-template-settings", label: c.settingsDefaults },
    { drawer: "pos-template-integration", label: c.integrationMap },
  ];

  return (
    <div className="grid gap-3">
      {rows.map((row, index) => {
        if (index === 0 && template.key === "mini-mart") {
          return (
            <Link
              className="flex items-center justify-between rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
              href="/dashboard"
              key={row.label}
            >
              <span className="font-semibold text-[#F8FAFC]">{row.label}</span>
              <ChevronRight className="size-4 text-[#94A3B8]" />
            </Link>
          );
        }
        if (row.disabled) {
          return null;
        }
        return (
          <button
            className="flex items-center justify-between rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
            key={row.label}
            onClick={() => onAction(row.drawer ?? "pos-template-detail", template)}
            type="button"
          >
            <span className="font-semibold text-[#F8FAFC]">{row.label}</span>
            <ChevronRight className="size-4 text-[#94A3B8]" />
          </button>
        );
      })}
    </div>
  );
}

function PosTemplateStores({ businesses, template }: { businesses: CenterBusiness[]; template: PosTemplateDefinition }) {
  const { c } = useCenterCopy();
  const stores = storesForTemplate(businesses, template);
  if (!stores.length) {
    return <EmptyState text={c.noStoresUsingTemplate} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {["Store", c.plan, c.status, "Users", "Branches", c.lastActive, "Actions"].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stores.map((business) => (
              <tr className="border-t border-[#334155]" key={business.id}>
                <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{business.name}</td>
                <td className="px-4 py-3">{business.plan?.planName ?? c.free}</td>
                <td className="px-4 py-3"><StatusBadge value={business.status} /></td>
                <td className="px-4 py-3">{business._count?.members ?? 0}</td>
                <td className="px-4 py-3">{business._count?.branches ?? business.branches?.length ?? 0}</td>
                <td className="px-4 py-3">{business.createdAt ? new Date(business.createdAt).toLocaleDateString() : "-"}</td>
                <td className="px-4 py-3">
                  <Link className="rounded-md border border-[#334155] px-3 py-2 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" href="/dashboard">
                    {c.openPosDashboard}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimpleTemplateList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div className="rounded-lg border border-[#334155] bg-[#111827] px-4 py-3 text-sm text-[#F8FAFC]" key={item}>
          {item}
        </div>
      ))}
    </div>
  );
}

function TemplatePermissions({ template }: { template: PosTemplateDefinition }) {
  return (
    <div className="grid gap-3">
      {Object.entries(template.defaultPermissions).map(([role, permissions]) => (
        <section className="rounded-lg border border-[#334155] bg-[#111827] p-4" key={role}>
          <h3 className="font-semibold text-[#F8FAFC]">{role}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {permissions.map((permission) => (
              <span className="rounded-md border border-[#334155] px-2 py-1 text-xs text-[#CBD5E1]" key={permission}>{permission}</span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PosTemplateIntegration({ onAction, template }: { onAction: (drawer: DrawerKind, selected?: unknown) => void; template: PosTemplateDefinition }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-3">
      {templateIntegration(template).map((item) => (
        <button
          className="flex items-center justify-between gap-4 rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4] hover:bg-[#5EEAD4]/[0.08]"
          key={item.key}
          onClick={() => onAction("pos-template-integration-detail", { item, template })}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate font-semibold text-[#F8FAFC]">{item.title}</span>
            <span className="mt-1 block text-sm text-[#94A3B8]">{item.checklist.length} {c.checklistItems}</span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <StatusBadge value={integrationStatusLabel(item.status, c)} />
            <ChevronRight className="size-4 text-[#94A3B8]" />
          </span>
        </button>
      ))}
    </div>
  );
}

function PosTemplateIntegrationDetail({ selected }: { selected: unknown }) {
  const { c } = useCenterCopy();
  const detail = selected as { item?: ReturnType<typeof templateIntegration>[number]; template?: PosTemplateDefinition } | null;
  const item = detail?.item;
  if (!item) {
    return <EmptyState text={c.sectionEmpty} />;
  }
  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
        <h3 className="font-semibold text-[#F8FAFC]">{c.overview}</h3>
        <p className="mt-2 text-sm text-[#CBD5E1]">{item.title} for {detail?.template?.name ?? c.posTemplates}.</p>
      </section>
      <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
        <h3 className="font-semibold text-[#F8FAFC]">{c.checklist}</h3>
        <div className="mt-3 grid gap-2">
          {item.checklist.map((check) => (
            <div className="flex items-center gap-2 text-sm text-[#CBD5E1]" key={check}>
              <Check className="size-4 text-[#5EEAD4]" />
              {check}
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
        <h3 className="font-semibold text-[#F8FAFC]">{c.currentStatus}</h3>
        <div className="mt-3"><StatusBadge value={integrationStatusLabel(item.status, c)} /></div>
      </section>
      <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
        <h3 className="font-semibold text-[#F8FAFC]">{c.whatToFix}</h3>
        {item.whatToFix.length ? <SimpleTemplateList items={item.whatToFix} /> : <p className="mt-2 text-sm text-[#94A3B8]">{c.noImmediateFixes}</p>}
      </section>
      <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
        <h3 className="font-semibold text-[#F8FAFC]">{c.relatedModules}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {item.related.map((related) => (
            <span className="rounded-md border border-[#334155] px-2 py-1 text-xs text-[#CBD5E1]" key={related}>{related}</span>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlansMatrix({ onAction, role }: { onAction: (drawer: DrawerKind, selected?: unknown) => void; role?: string | null }) {
  const canEditFeatures = canUsePlatformAction(role, PLATFORM_ACTIONS.FEATURE_TOGGLE);
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {["Feature", "Free Plan", "Pro Plan", "Trial", "Custom", canEditFeatures ? "Actions" : null].filter(Boolean).map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {featureRows.map((row) => (
              <tr className="border-t border-[#334155]" key={row[0]}>
                {row.map((cell, cellIndex) => (
                  <td className="px-4 py-3" key={`${row[0]}-${cellIndex}`}>{cell}</td>
                ))}
                {canEditFeatures ? (
                  <td className="px-4 py-3">
                    <button className="rounded-md border border-[#5EEAD4] px-3 py-1.5 text-xs font-semibold text-[#5EEAD4]" onClick={() => onAction("feature-edit", row)} type="button">
                      Edit feature
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildUserDirectoryRows(data: CenterData, c: CenterCopy): UserDirectoryRow[] {
  return data.users.map((user) => {
    const assignment = user.companies?.[0] ?? null;
    const company = assignment?.company ?? null;
    const store = assignment?.branch ?? company?.branches?.[0] ?? null;
    const role = user.roles?.find((entry) => !assignment?.companyId || entry.companyId === assignment.companyId)?.role ?? user.roles?.[0]?.role ?? null;
    const roleName = assignment?.isOwner ? c.owner : role?.name ?? c.noAccess;
    const backOfficeAccess = Boolean(assignment?.allowBackOfficeAccess);
    const posAccess = Boolean(assignment?.allowPosAccess);
    const access = backOfficeAccess && posAccess
      ? "Back Office / POS"
      : backOfficeAccess
        ? "Back Office"
        : posAccess
          ? "POS"
          : c.noAccess;
    const missingAssignment = !assignment?.companyId || !company?.name || !store?.id;
    return {
      access,
      activeAssignment: String(assignment?.status ?? "").toLowerCase() === "active",
      assignmentId: assignment?.id ?? "-",
      backOfficeAccess,
      branchAssignmentStatus: assignment?.branchId ? c.activeStatus ?? c.active : c.notConnected,
      businessId: company?.id ?? "-",
      businessName: company?.name ?? "-",
      companyAssignmentStatus: assignment?.companyId ? c.activeStatus ?? c.active : c.notConnected,
      createdAt: user.createdAt,
      email: user.email ?? "-",
      fullName: user.fullName ?? user.username ?? user.email ?? "-",
      isOwner: Boolean(assignment?.isOwner),
      lastActive: user.loginHistory?.[0]?.loginTime,
      loginIdentifier: user.email ?? user.username ?? "-",
      missingAssignment,
      permissionSummary: access,
      phone: user.phone ?? "-",
      posAccess,
      requirePasswordChange: Boolean(assignment?.requirePasswordChange),
      roleName,
      roleType: role?.templateKey ?? (assignment?.isOwner ? "owner" : "store_user"),
      status: user.status ?? c.notConnected,
      storeCode: company?.storeCode ?? "-",
      storeName: store?.name ?? "-",
      user,
      userId: user.id,
      username: user.username ?? "-",
    };
  });
}

function isUserDirectoryRow(value: unknown): value is UserDirectoryRow {
  return Boolean(value && typeof value === "object" && "userId" in value && "loginIdentifier" in value && "businessName" in value);
}

function UserDirectoryPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [businessFilter, setBusinessFilter] = useState("all");
  const rows = buildUserDirectoryRows(data, c);
  const roleOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Set(rows.map((row) => row.roleName))).map((role) => ({ label: role, value: role }))];
  const statusOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Set(rows.map((row) => row.status))).map((status) => ({ label: status, value: status }))];
  const businessOptions = [{ label: c.filterAll, value: "all" }, ...Array.from(new Map(rows.filter((row) => row.businessId !== "-").map((row) => [row.businessId, row.businessName])).entries()).map(([value, label]) => ({ label, value }))];
  const accessOptions = [
    { label: c.filterAll, value: "all" },
    { label: "Back Office", value: "back-office" },
    { label: "POS", value: "pos" },
    { label: c.noAccess, value: "none" },
  ];
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.fullName} ${row.email} ${row.username} ${row.businessName} ${row.storeName} ${row.storeCode}`.toLowerCase().includes(query);
    const matchesRole = roleFilter === "all" || row.roleName === roleFilter;
    const matchesStatus = statusFilter === "all" || row.status === statusFilter;
    const matchesBusiness = businessFilter === "all" || row.businessId === businessFilter;
    const matchesAccess = accessFilter === "all"
      || (accessFilter === "back-office" && row.backOfficeAccess)
      || (accessFilter === "pos" && row.posAccess)
      || (accessFilter === "none" && !row.backOfficeAccess && !row.posAccess);
    return matchesSearch && matchesRole && matchesStatus && matchesBusiness && matchesAccess;
  });
  const activeRows = rows.filter((row) => String(row.status).toLowerCase() === "active");
  const ownerRows = rows.filter((row) => row.isOwner || row.roleName.toLowerCase().includes("owner"));
  const managerRows = rows.filter((row) => row.roleName.toLowerCase().includes("manager"));
  const cashierRows = rows.filter((row) => row.roleName.toLowerCase().includes("cashier") || (!row.isOwner && !row.roleName.toLowerCase().includes("manager")));
  const missingRows = rows.filter((row) => row.missingAssignment);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.users}
        subtitle={c.manageBusinessesTemplatesPlansUsersAndPlatformControls}
        controls={
          <>
            <SearchControl onChange={setSearch} placeholder="Search users" value={search} />
            <FilterSelect label={c.role} onChange={setRoleFilter} options={roleOptions} value={roleFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <FilterSelect label={c.access} onChange={setAccessFilter} options={accessOptions} value={accessFilter} />
            <FilterSelect label={c.business} onChange={setBusinessFilter} options={businessOptions} value={businessFilter} />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label={c.totalStoreUsers} value={rows.length} />
        <SummaryCard label={c.activeUsers} value={activeRows.length} />
        <SummaryCard label={c.owners} value={ownerRows.length} />
        <SummaryCard label={c.managers} value={managerRows.length} />
        <SummaryCard label={c.cashiersStaff} value={cashierRows.length} />
        <SummaryCard label={c.usersMissingAssignment} value={missingRows.length} />
      </section>

      <section className={dashboardPanelClass()}>
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1320px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[c.fullName, c.email, "Username", c.role, c.business, c.storeName, c.access, c.status, c.lastActive, c.createdAt, c.actions].map((header) => (
                      <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.userId} onClick={() => onAction("user-detail", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.fullName}</td>
                      <td className="px-4 py-3">{row.email}</td>
                      <td className="px-4 py-3">{row.username}</td>
                      <td className="px-4 py-3">{row.roleName}</td>
                      <td className="px-4 py-3">{row.businessName}</td>
                      <td className="px-4 py-3">{row.storeName}</td>
                      <td className="px-4 py-3">{row.access}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3">{row.lastActive ? new Date(row.lastActive).toLocaleString() : "-"}</td>
                      <td className="px-4 py-3">{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("user-detail", row); }} type="button">
                            {c.viewDetails}
                          </button>
                          <DisabledPillButton label={c.disabledNotConnected} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title={c.noUsersConnected} description={c.usersWillAppearAfterStoresCreated} />
        )}
        <div className="mt-4">
          <Link className="inline-flex rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold text-[#5EEAD4]" href="/super-admin/stores/new">
            {c.createBusiness}
          </Link>
        </div>
      </section>
    </div>
  );
}

function UserDirectoryDetail({ row }: { row: UserDirectoryRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.userOverview} subtitle={row.email} />
        <DetailGrid
          rows={[
            ["User ID", row.userId],
            [c.fullName, row.fullName],
            [c.email, row.email],
            ["Username", row.username],
            ["Phone", row.phone],
            [c.status, <StatusBadge key="user-status" value={row.status} />],
            [c.createdAt, row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.rolesPermissions} subtitle={row.roleName} />
        <DetailGrid
          rows={[
            [c.roleName, row.roleName],
            [c.roleType, row.roleType],
            [c.permissionSummary, row.permissionSummary],
            [c.superAdminAccess, c.noAccess],
            [c.storeBackOfficeAccess, <StatusBadge key="bo" value={row.backOfficeAccess ? c.activeStatus ?? c.active : c.noAccess} />],
            [c.posAccess, <StatusBadge key="pos" value={row.posAccess ? c.activeStatus ?? c.active : c.noAccess} />],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessDetails} subtitle={row.businessName} />
        <DetailGrid
          rows={[
            [c.business, row.businessName],
            [c.storeName, row.storeName],
            [c.storeCode, row.storeCode],
            [c.companyAssignmentStatus, <StatusBadge key="company-assignment" value={row.companyAssignmentStatus} />],
            [c.branchAssignmentStatus, <StatusBadge key="branch-assignment" value={row.branchAssignmentStatus} />],
            [c.activeAssignment, <StatusBadge key="active-assignment" value={row.activeAssignment ? c.activeStatus ?? c.active : c.noAccess} />],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.loginAccess} subtitle={row.loginIdentifier} />
        <DetailGrid
          rows={[
            [c.lastActive, row.lastActive ? new Date(row.lastActive).toLocaleString() : "-"],
            [c.loginIdentifier, row.loginIdentifier],
            [c.accountStatus, <StatusBadge key="account-status" value={row.status} />],
            [c.passwordStatus, c.temporaryPasswordNotShown],
          ]}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <Link className="rounded-md border border-[#5EEAD4] px-3 py-2 text-xs font-semibold text-[#5EEAD4]" href="/super-admin/businesses">
          {c.viewBusiness}
        </Link>
        <Link className="rounded-md border border-[#5EEAD4] px-3 py-2 text-xs font-semibold text-[#5EEAD4]" href="/super-admin/stores">
          {c.viewStore}
        </Link>
        <DisabledPillButton label={c.resetPassword} />
        <DisabledPillButton label={c.disableUser} />
        <DisabledPillButton label={c.editUser} />
        <DisabledPillButton label={c.changeRole} />
      </section>

      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              assignmentId: row.assignmentId,
              businessId: row.businessId,
              roleType: row.roleType,
              storeCode: row.storeCode,
              userId: row.userId,
            },
          },
        ]}
      />
    </div>
  );
}

function roleTypeLabel(role: CenterRole, c: CenterCopy) {
  const template = String(role.templateKey ?? "").toLowerCase();
  const name = role.name.toLowerCase();
  if (template.includes("owner") || name.includes("owner")) return c.owner;
  if (template.includes("manager") || name.includes("manager")) return c.managers;
  if (template.includes("cashier") || name.includes("cashier")) return "Cashier";
  if (template.includes("staff") || name.includes("staff")) return "Staff";
  if (role.isSystem) return c.systemRoles;
  return c.custom;
}

function roleAccessFromPermissions(permissionKeys: string[], modules: string[], assignedUsers: RoleDirectoryRow["assignedUsers"], c: CenterCopy) {
  const normalizedKeys = permissionKeys.map((key) => key.toLowerCase());
  const normalizedModules = modules.map((module) => module.toLowerCase());
  const hasPosPermission = normalizedKeys.some((key) => key.startsWith("sale.") || key.startsWith("payment.") || key.includes("pos"))
    || normalizedModules.some((module) => module.includes("pos") || module.includes("sale") || module.includes("payment"));
  const hasBackOfficePermission = normalizedModules.some((module) => !["pos", "sale", "sales", "payment", "payments"].includes(module))
    || normalizedKeys.some((key) => ["inventory.", "product.", "customer.", "promotion.", "reports.", "settings.", "purchasing.", "supplier."].some((prefix) => key.startsWith(prefix)));
  const hasPosUser = assignedUsers.some((user) => user.access.includes("POS"));
  const hasBackOfficeUser = assignedUsers.some((user) => user.access.includes("Back Office"));
  return {
    backOfficeAccess: hasBackOfficePermission || hasBackOfficeUser ? c.activeStatus ?? c.active : "-",
    posAccess: hasPosPermission || hasPosUser ? c.activeStatus ?? c.active : "-",
  };
}

function buildRoleDirectoryRows(data: CenterData, c: CenterCopy): RoleDirectoryRow[] {
  return data.roles.map((role) => {
    const permissionKeys = (role.permissions ?? []).map((entry) => entry.permission?.key).filter(Boolean) as string[];
    const permissionModules = Array.from(new Set((role.permissions ?? []).map((entry) => entry.permission?.module).filter(Boolean) as string[]));
    const assignedUsers = (role.users ?? []).map((entry) => {
      const user = entry.user;
      const assignment = user?.companies?.find((company) => !entry.companyId || company.companyId === entry.companyId) ?? user?.companies?.[0];
      const backOffice = Boolean(assignment?.allowBackOfficeAccess);
      const pos = Boolean(assignment?.allowPosAccess);
      const access = backOffice && pos ? "Back Office / POS" : backOffice ? "Back Office" : pos ? "POS" : c.noAccess;
      return {
        access,
        businessName: role.company?.name ?? "-",
        email: user?.email ?? "-",
        fullName: user?.fullName ?? user?.username ?? user?.email ?? "-",
        storeName: assignment?.branch?.name ?? "-",
        userId: user?.id ?? "-",
        username: user?.username ?? "-",
      };
    });
    const access = roleAccessFromPermissions(permissionKeys, permissionModules, assignedUsers, c);
    return {
      assignedUsers,
      backOfficeAccess: access.backOfficeAccess,
      businessId: role.company?.id ?? role.companyId ?? "-",
      businessName: role.company?.name ?? (role.companyId ? "-" : "Platform"),
      createdAt: undefined,
      isSystem: Boolean(role.isSystem),
      permissionCount: permissionKeys.length,
      permissionKeys,
      permissionModules,
      posAccess: access.posAccess,
      role,
      roleId: role.id,
      roleName: role.name,
      roleType: roleTypeLabel(role, c),
      status: c.activeStatus ?? c.active,
      storeLevelAccess: role.companyId ? c.activeStatus ?? c.active : "-",
      usersCount: role.users?.length ?? 0,
    };
  });
}

function isRoleDirectoryRow(value: unknown): value is RoleDirectoryRow {
  return Boolean(value && typeof value === "object" && "roleId" in value && "permissionKeys" in value && "roleName" in value);
}

function RoleDirectoryPage({ data, onAction }: { data: CenterData; onAction: (drawer: DrawerKind, selected?: unknown) => void }) {
  const { c } = useCenterCopy();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const rows = buildRoleDirectoryRows(data, c);
  const typeOptions = [
    { label: c.filterAll, value: "all" },
    ...Array.from(new Set(rows.map((row) => row.roleType))).map((type) => ({ label: type, value: type })),
  ];
  const statusOptions = [
    { label: c.filterAll, value: "all" },
    ...Array.from(new Set(rows.map((row) => row.status))).map((status) => ({ label: status, value: status })),
    { label: c.notConnected, value: "not-connected" },
  ];
  const accessOptions = [
    { label: c.filterAll, value: "all" },
    { label: "POS", value: "pos" },
    { label: "Back Office", value: "back-office" },
    { label: "Back Office / POS", value: "both" },
    { label: c.noAccess, value: "none" },
  ];
  const visibleRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || `${row.roleName} ${row.businessName} ${row.permissionKeys.join(" ")}`.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" || row.roleType === typeFilter;
    const matchesStatus = statusFilter === "all" || row.status === statusFilter || (statusFilter === "not-connected" && row.permissionCount === 0);
    const hasPos = row.posAccess !== "-";
    const hasBackOffice = row.backOfficeAccess !== "-";
    const matchesAccess = accessFilter === "all"
      || (accessFilter === "pos" && hasPos)
      || (accessFilter === "back-office" && hasBackOffice)
      || (accessFilter === "both" && hasPos && hasBackOffice)
      || (accessFilter === "none" && !hasPos && !hasBackOffice);
    return matchesSearch && matchesType && matchesStatus && matchesAccess;
  });
  const ownerRows = rows.filter((row) => row.roleType === c.owner);
  const managerRows = rows.filter((row) => row.roleType === c.managers);
  const cashierRows = rows.filter((row) => ["Cashier", "Staff"].includes(row.roleType));
  const customRows = rows.filter((row) => row.roleType === c.custom);
  const missingPermissionRows = rows.filter((row) => row.permissionCount === 0);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <PageHeader
        title={c.rolesPermissions}
        subtitle={c.manageBusinessesTemplatesPlansUsersAndPlatformControls}
        controls={
          <>
            <SearchControl onChange={setSearch} placeholder="Search roles" value={search} />
            <FilterSelect label={c.roleType} onChange={setTypeFilter} options={typeOptions} value={typeFilter} />
            <FilterSelect label={c.status} onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <FilterSelect label={c.access} onChange={setAccessFilter} options={accessOptions} value={accessFilter} />
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label={c.totalRoles} value={rows.length} />
        <SummaryCard label={c.owners} value={ownerRows.length} />
        <SummaryCard label={c.managers} value={managerRows.length} />
        <SummaryCard label={c.cashierStaffRoles} value={cashierRows.length} />
        <SummaryCard label={c.customRoles} value={customRows.length} />
        <SummaryCard label={c.rolesMissingPermissions} value={missingPermissionRows.length} />
      </section>

      <section className={dashboardPanelClass()}>
        {visibleRows.length ? (
          <div className="max-w-full overflow-hidden rounded-lg border border-[#334155]">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1260px] border-collapse text-sm">
                <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
                  <tr>
                    {[c.roleName, c.scopeBusiness, c.roleType, c.users, c.permissionCount, c.posAccess, c.backOfficeAccess, c.status, c.createdAt, c.actions].map((header) => (
                      <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr className="cursor-pointer border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={row.roleId} onClick={() => onAction("role-detail", row)}>
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{row.roleName}</td>
                      <td className="px-4 py-3">{row.businessName}</td>
                      <td className="px-4 py-3">{row.roleType}</td>
                      <td className="px-4 py-3">{row.usersCount}</td>
                      <td className="px-4 py-3">{row.permissionCount}</td>
                      <td className="px-4 py-3"><StatusBadge value={row.posAccess} /></td>
                      <td className="px-4 py-3"><StatusBadge value={row.backOfficeAccess} /></td>
                      <td className="px-4 py-3"><StatusBadge value={row.status} /></td>
                      <td className="px-4 py-3">-</td>
                      <td className="px-4 py-3">
                        <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={(event) => { event.stopPropagation(); onAction("role-detail", row); }} type="button">
                          {c.viewDetails}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <EmptyPanel title="No roles connected yet." description="Roles will appear here after stores and user permissions are created." />
        )}
        <div className="mt-4">
          <Link className="inline-flex rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold text-[#5EEAD4]" href="/super-admin/users">
            {c.viewBusiness === "View Business" ? "View Users" : c.users}
          </Link>
        </div>
      </section>
    </div>
  );
}

function RoleDirectoryDetail({ row }: { row: RoleDirectoryRow }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <CommandSectionTitle title={c.roleOverview} subtitle={row.businessName} />
        <DetailGrid
          rows={[
            ["Role ID", row.roleId],
            [c.roleName, row.roleName],
            [c.roleType, row.roleType],
            [c.scopeBusiness, row.businessName],
            [c.status, <StatusBadge key="role-status" value={row.status} />],
            [c.createdAt, "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.usersAssigned} subtitle={`${row.usersCount}`} />
        {row.assignedUsers.length ? (
          <div className="grid gap-2">
            {row.assignedUsers.map((user) => (
              <div className="rounded-lg border border-[#334155] bg-[#111827] p-4" key={`${row.roleId}-${user.userId}`}>
                <div className="font-semibold text-[#F8FAFC]">{user.fullName}</div>
                <div className="mt-1 text-sm text-[#94A3B8]">{user.email} · {user.username}</div>
                <div className="mt-2 text-xs text-[#CBD5E1]">{user.businessName} / {user.storeName} · {user.access}</div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text="No users assigned to this role yet." />
        )}
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.access} subtitle={row.roleType} />
        <DetailGrid
          rows={[
            [c.backOfficeAccess, <StatusBadge key="back-office" value={row.backOfficeAccess} />],
            [c.posAccess, <StatusBadge key="pos" value={row.posAccess} />],
            [c.superAdminAccess, c.noAccess],
            [c.storeLevelAccess, <StatusBadge key="store-level" value={row.storeLevelAccess} />],
            [c.branchLevelAccess, row.assignedUsers.some((user) => user.storeName !== "-") ? c.activeStatus ?? c.active : "-"],
          ]}
        />
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.permissionSummary} subtitle={`${row.permissionCount}`} />
        <DetailGrid
          rows={[
            [c.permissionCount, row.permissionCount],
            [c.permissionGroups, row.permissionModules.length ? row.permissionModules.join(", ") : "-"],
          ]}
        />
        {row.permissionKeys.length ? (
          <div className="flex flex-wrap gap-2">
            {row.permissionKeys.map((key) => (
              <span className="rounded-md border border-[#334155] bg-[#020617] px-2 py-1 text-xs text-[#CBD5E1]" key={key}>{key}</span>
            ))}
          </div>
        ) : (
          <EmptyState text={c.rolesMissingPermissions} />
        )}
      </section>

      <section className="grid gap-3">
        <CommandSectionTitle title={c.businessSetupStatus} subtitle={row.status} />
        <DetailGrid
          rows={[
            [c.roleCreated, <StatusBadge key="role-created" value={row.status} />],
            [c.permissionsAssigned, <StatusBadge key="permissions-assigned" value={row.permissionCount > 0 ? c.activeStatus ?? c.active : c.notConnected} />],
            [c.usersAssigned, <StatusBadge key="users-assigned" value={row.usersCount > 0 ? c.activeStatus ?? c.active : c.notConnected} />],
            [c.activeAssignment, <StatusBadge key="assignment" value={row.businessId !== "-" ? c.activeStatus ?? c.active : "-" } />],
          ]}
        />
      </section>

      <section className="flex flex-wrap gap-2">
        <Link className="rounded-md border border-[#5EEAD4] px-3 py-2 text-xs font-semibold text-[#5EEAD4]" href="/super-admin/users">
          View Users
        </Link>
        <Link className="rounded-md border border-[#5EEAD4] px-3 py-2 text-xs font-semibold text-[#5EEAD4]" href="/super-admin/businesses">
          {c.viewBusiness}
        </Link>
        <DisabledPillButton label={c.editRole} />
        <DisabledPillButton label={c.changePermissions} />
        <DisabledPillButton label={c.disableRole} />
        <DisabledPillButton label={c.duplicateRole} />
      </section>

      <AdvancedDetails
        sections={[
          {
            title: c.technicalMetadata,
            value: {
              businessId: row.businessId,
              companyId: row.role.companyId,
              isSystem: row.isSystem,
              permissionKeys: row.permissionKeys,
              roleId: row.roleId,
              templateKey: row.role.templateKey,
            },
          },
        ]}
      />
    </div>
  );
}

function CreateBusinessWizard({ onClose }: { onClose: () => void }) {
  const { c } = useCenterCopy();
  const [step, setStep] = useState(0);
  const firstProvisionableTemplate =
    EGO_ADMIN_PROVISIONING_TEMPLATES.find((template) => template.enabled)?.key ?? "mini_mart";
  const [selectedTemplate, setSelectedTemplate] = useState(firstProvisionableTemplate);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const steps = [c.chooseBusinessTemplate, c.businessInformation, c.ownerAccount, c.plan, c.confirmCreateBusiness];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      branchName: String(data.get("branchName") || "Main Branch"),
      businessTemplateKey: selectedTemplate,
      defaultCurrency: String(data.get("defaultCurrency") || "LAK"),
      defaultLocale: String(data.get("defaultLocale") || "th"),
      ownerPhone: String(data.get("ownerPhone") || ""),
      ownerEmail: String(data.get("ownerEmail") || ""),
      ownerFullName: String(data.get("ownerFullName") || ""),
      ownerTemporaryPassword: String(data.get("ownerTemporaryPassword") || ""),
      ownerUsername: String(data.get("ownerUsername") || ""),
      profileAddress: String(data.get("profileAddress") || ""),
      storeCode: String(data.get("storeCode") || ""),
      storeName: String(data.get("storeName") || ""),
      warehouseName: String(data.get("warehouseName") || "Main Warehouse"),
    };
    setMessage(null);
    startTransition(async () => {
      const response = await fetch("/api/super-admin/stores", {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setMessage(result?.error ?? "Create business failed.");
        return;
      }
      setMessage(`Created ${result.store?.name ?? payload.storeName}. Owner login: ${result.owner?.username ?? payload.ownerUsername}`);
    });
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <div className="flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <button
            className={cn("rounded-md border px-3 py-2 text-xs font-semibold", index === step ? "border-[#5EEAD4] bg-[#5EEAD4]/10 text-[#5EEAD4]" : "border-[#334155] text-[#94A3B8]")}
            key={label}
            onClick={() => setStep(index)}
            type="button"
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {EGO_ADMIN_PROVISIONING_TEMPLATES.map((template) => (
            <button
              className={cn("rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60", selectedTemplate === template.key ? "border-[#5EEAD4] bg-[#5EEAD4]/10" : "border-[#334155] bg-[#111827] hover:border-[#5EEAD4]")}
              disabled={!template.enabled}
              key={template.key}
              onClick={() => setSelectedTemplate(template.key)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[#F8FAFC]">{template.label}</span>
                <StatusBadge value={template.status} />
              </div>
              <p className="mt-2 text-sm text-[#94A3B8]">{template.features.join(" • ")}</p>
            </button>
          ))}
        </div>
      ) : null}

      <div className={cn("grid gap-4 md:grid-cols-2", step === 0 ? "hidden" : "")}>
        <label className="grid gap-2 text-sm font-medium">
          Business name
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="storeName" required={step >= 1} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Business code
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="storeCode" required={step >= 1} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {c.country}
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" defaultValue="Laos" name="country" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {c.currency}
          <select className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="defaultCurrency">
            <option value="LAK">LAK</option>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Language
          <select className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="defaultLocale">
            <option value="th">Thai</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Branch name
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" defaultValue="Main Branch" name="branchName" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          Business address
          <textarea className="min-h-20 rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="profileAddress" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          Warehouse name
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" defaultValue="Main Warehouse" name="warehouseName" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Owner name
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="ownerFullName" required={step >= 2} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Owner email
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="ownerEmail" required={step >= 2} type="email" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Owner phone
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="ownerPhone" type="tel" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Owner username
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="ownerUsername" required={step >= 2} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Temporary password
          <input className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" minLength={8} name="ownerTemporaryPassword" required={step >= 2} type="password" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {c.plan}
          <select className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC]" name="plan">
            <option value="Free">Free Plan</option>
            <option disabled value="Pro">Pro Plan - Billing not connected yet</option>
          </select>
        </label>
      </div>

      {message ? <p className="rounded-md border border-[#5EEAD4] bg-[#5EEAD4]/10 px-4 py-3 text-sm text-[#5EEAD4]">{message}</p> : null}
      <div className="flex flex-wrap justify-end gap-3">
        <button className="rounded-md border border-[#334155] px-4 py-2 text-sm font-semibold text-[#CBD5E1]" onClick={onClose} type="button">
          {c.cancel}
        </button>
        {step < steps.length - 1 ? (
          <button className="rounded-md bg-[#5EEAD4] px-4 py-2 text-sm font-semibold text-[#020617]" onClick={() => setStep((value) => Math.min(value + 1, steps.length - 1))} type="button">
            {c.next}
          </button>
        ) : (
          <button className="rounded-md bg-[#5EEAD4] px-4 py-2 text-sm font-semibold text-[#020617] disabled:opacity-60" disabled={isPending} type="submit">
            {isPending ? "Creating..." : c.createBusiness}
          </button>
        )}
      </div>
    </form>
  );
}

function DrawerContent({
  data,
  drawer,
  onAction,
  onClose,
  selected,
}: {
  data: CenterData;
  drawer: DrawerKind;
  onAction: (drawer: DrawerKind, selected?: unknown) => void;
  onClose: () => void;
  selected: unknown;
}) {
  const { c } = useCenterCopy();
  const role = data.currentPlatformUser?.role;

  if (drawer === "create-business") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_CREATE)) return <AccessDeniedPanel />;
    return <CreateBusinessWizard onClose={onClose} />;
  }
  if (drawer?.startsWith("businesses")) {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW)) return <AccessDeniedPanel />;
    const filtered = data.businesses.filter((business) => {
      const plan = business.plan?.planName?.toLowerCase() ?? "free";
      const status = business.status?.toLowerCase() ?? "active";
      if (drawer === "businesses-active") return status === "active";
      if (drawer === "businesses-suspended") return status.includes("suspend");
      if (drawer === "businesses-free") return plan.includes("free");
      if (drawer === "businesses-pro") return plan.includes("pro");
      if (drawer === "businesses-trial") return plan.includes("trial");
      return true;
    });
    return <BusinessTable businesses={filtered} onAction={onAction} role={role} />;
  }
  if (drawer === "business-view") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW)) return <AccessDeniedPanel />;
    if (isStoreDirectoryRow(selected)) {
      return <StoreDirectoryDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "business-detail") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW)) return <AccessDeniedPanel />;
    if (isBusinessDirectoryRow(selected)) {
      return <BusinessDirectoryDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "templates") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.POS_TEMPLATE_VIEW)) return <AccessDeniedPanel />;
    return <TemplateList businesses={data.businesses} onAction={onAction} />;
  }
  if (drawer === "pos-template-detail") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.POS_TEMPLATE_VIEW)) return <AccessDeniedPanel />;
    const template = getPosTemplate(selected);
    return template ? <PosTemplateDetail onAction={onAction} template={template} /> : <TemplateList businesses={data.businesses} onAction={onAction} />;
  }
  if (drawer === "pos-template-stores") {
    const template = getPosTemplate(selected);
    return template ? <PosTemplateStores businesses={data.businesses} template={template} /> : <EmptyState text={c.noStoresUsingTemplate} />;
  }
  if (drawer === "pos-template-modules") {
    const template = getPosTemplate(selected);
    return template ? <SimpleTemplateList items={template.modules} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-features") {
    const template = getPosTemplate(selected);
    return template ? <SimpleTemplateList items={template.features} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-plan-locks") {
    const template = getPosTemplate(selected);
    return template ? <SimpleTemplateList items={template.planLocks} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-permissions") {
    const template = getPosTemplate(selected);
    return template ? <TemplatePermissions template={template} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-reports") {
    const template = getPosTemplate(selected);
    return template ? <SimpleTemplateList items={template.reports} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-settings") {
    const template = getPosTemplate(selected);
    return template ? <SimpleTemplateList items={template.settingsDefaults} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-integration") {
    const template = getPosTemplate(selected);
    return template ? <PosTemplateIntegration onAction={onAction} template={template} /> : <EmptyState text={c.sectionEmpty} />;
  }
  if (drawer === "pos-template-integration-detail") {
    return <PosTemplateIntegrationDetail selected={selected} />;
  }
  if (drawer === "plans") {
    if (!canViewSuperAdminSection(role, "plans")) return <AccessDeniedPanel />;
    return <PlanManagementPage data={data} onAction={onAction} />;
  }
  if (drawer === "plan-management-detail") {
    if (!canViewSuperAdminSection(role, "plans")) return <AccessDeniedPanel />;
    if (isPlanManagementRow(selected)) {
      return <PlanManagementDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "recent-activity") {
    if (!canViewPlatformAudit(role)) return <AccessDeniedPanel />;
    return <LogsTable logs={data.auditLogs} onOpen={(log) => onAction("audit-details", log)} />;
  }
  if (drawer === "recent-activity-detail") {
    if (!canViewPlatformAudit(role)) return <AccessDeniedPanel />;
    return selected ? <RecentActivityDetail row={selected as RecentActivityRow} /> : <EmptyState text={c.noRecentActivityYet} />;
  }
  if (drawer === "audit-details") {
    return <CenterLogDetail log={selected as CenterLog} />;
  }
  if (drawer === "platform-audit-detail") {
    return <PlatformAuditDetail log={selected as PlatformAuditLog} />;
  }
  if (drawer === "store-activity-detail") {
    return <StoreActivityDetail log={selected as StoreActivityLog} />;
  }
  if (drawer === "subscriptions") {
    if (!canViewSuperAdminSection(role, "subscriptions")) return <AccessDeniedPanel />;
    return <SubscriptionsPanel subscriptions={data.subscriptions} onAction={onAction} role={role} />;
  }
  if (drawer === "users") {
    if (!canViewSuperAdminSection(role, "users")) return <AccessDeniedPanel />;
    return <UserDirectoryPage data={data} onAction={onAction} />;
  }
  if (drawer === "user-detail") {
    if (!canViewSuperAdminSection(role, "users")) return <AccessDeniedPanel />;
    if (isUserDirectoryRow(selected)) {
      return <UserDirectoryDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "roles-permissions") {
    if (!canViewSuperAdminSection(role, "roles")) return <AccessDeniedPanel />;
    return <RoleDirectoryPage data={data} onAction={onAction} />;
  }
  if (drawer === "role-detail") {
    if (!canViewSuperAdminSection(role, "roles")) return <AccessDeniedPanel />;
    if (isRoleDirectoryRow(selected)) {
      return <RoleDirectoryDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "platform-settings") {
    if (!canViewSuperAdminSection(role, "settings")) return <AccessDeniedPanel />;
    return (
      <div className="grid gap-3">
        {platformSettings.map((setting) => (
          <button className="flex items-center justify-between rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4]" key={setting} onClick={() => onAction("setting-edit", setting)} type="button">
            <span className="font-semibold text-[#F8FAFC]">{setting}</span>
            <ChevronRight className="size-4 text-[#94A3B8]" />
          </button>
        ))}
      </div>
    );
  }
  if (drawer === "platform-notifications") {
    return <EmptyState text={c.noPlatformNotifications} />;
  }
  if (drawer === "store-users") {
    if (!canViewSuperAdminSection(role, "users")) return <AccessDeniedPanel />;
    return <UserDirectoryPage data={data} onAction={onAction} />;
  }
  if (drawer === "platform-users") {
    if (!canViewSuperAdminSection(role, "users")) return <AccessDeniedPanel />;
    if (data.platformUsersCount <= 0) {
      return <EmptyState text="No active platform admin users were found." />;
    }
    return (
      <div className="grid gap-3">
        {platformRoles.slice(0, data.platformUsersCount).map((role, index) => (
          <div className="flex items-center justify-between rounded-lg border border-[#334155] bg-[#111827] p-4" key={`${role}-${index}`}>
            <div>
              <div className="font-semibold text-[#F8FAFC]">{role}</div>
              <div className="text-sm text-[#94A3B8]">Platform access</div>
            </div>
            <button className="rounded-md border border-[#334155] px-3 py-2 text-xs font-semibold" onClick={() => onAction("user-action", { label: role })} type="button">
              {c.view}
            </button>
          </div>
        ))}
      </div>
    );
  }
  if (drawer === "subscription-revenue" || drawer === "subscription-action") {
    if (!canViewSuperAdminSection(role, "subscriptions")) return <AccessDeniedPanel />;
    return <SubscriptionsPanel subscriptions={data.subscriptions} onAction={onAction} role={role} />;
  }
  if (drawer === "active-stores-today" || drawer === "sales-today" || drawer === "bills-today") {
    if (!canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW)) return <AccessDeniedPanel />;
    return <DashboardMetricDetail data={data} drawer={drawer} />;
  }
  if (drawer === "pending-actions") {
    return selected ? (
      <DetailGrid rows={[[c.action, (selected as { text?: string }).text ?? "-"], [c.severity, (selected as { severity?: string }).severity ?? c.info]]} />
    ) : (
      <EmptyState text="Pending actions will appear here when plan expiry, suspended businesses, failed billing, or platform review items need attention." />
    );
  }
  if (drawer === "store-performance-detail") {
    const row = selected as StorePerformanceRow | null;
    return row ? <StorePerformanceDetail row={row} /> : <EmptyState text={c.emptyNoStorePerformance} />;
  }
  if (drawer === "plan-analytics-detail") {
    if (!canViewSuperAdminSection(role, "plans")) return <AccessDeniedPanel />;
    if (isPlanManagementRow(selected)) {
      return <PlanAnalyticsDetail row={selected} />;
    }
    return <OperationalDrawer selected={selected} />;
  }
  if (drawer === "system-health-detail") {
    return <SystemHealthDetail service={selected as HealthService} />;
  }
  if (drawer === "integration-detail") {
    return <IntegrationDetail integration={selected as IntegrationCard} />;
  }
  if (drawer === "backup-restore-detail") {
    return <EmptyPanel title={c.backupServiceNotConnected} description={c.backupRestoreSubtitle} />;
  }

  return <OperationalDrawer selected={selected} />;
}

function OperationalDrawer({ selected }: { selected: unknown }) {
  const { c } = useCenterCopy();
  const selectedRecord = selected && typeof selected === "object" && !Array.isArray(selected) ? selected as Record<string, unknown> : null;
  const readableRows = selectedRecord
    ? Object.entries(selectedRecord)
        .filter(([, value]) => value === null || ["string", "number", "boolean", "undefined"].includes(typeof value))
        .slice(0, 8)
        .map(([key, value]) => [key, formatReadableValue(value)] as [string, React.ReactNode])
    : [];

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-[#334155] bg-[#111827] p-5">
        <h3 className="text-lg font-semibold text-[#F8FAFC]">{c.featureAccess}</h3>
        <p className="mt-2 text-sm text-[#94A3B8]">{c.manualControl}</p>
      </div>
      {readableRows.length ? <DetailGrid rows={readableRows} /> : <EmptyState text={c.sectionEmpty} />}
      <AdvancedDetails sections={[{ title: c.rawPayload, value: selected ?? {} }]} />
    </div>
  );
}

function SubscriptionsPanel({
  onAction,
  role,
  subscriptions,
}: {
  onAction: (drawer: DrawerKind, selected?: unknown) => void;
  role?: string | null;
  subscriptions: CenterSubscription[];
}) {
  const { c } = useCenterCopy();
  const subscriptionActions = [
    canUsePlatformAction(role, PLATFORM_ACTIONS.SUBSCRIPTION_UPGRADE) ? "Upgrade" : null,
    canUsePlatformAction(role, PLATFORM_ACTIONS.SUBSCRIPTION_DOWNGRADE) ? "Downgrade" : null,
    canUsePlatformAction(role, PLATFORM_ACTIONS.SUBSCRIPTION_EXTEND) ? "Extend plan" : null,
    canUsePlatformAction(role, PLATFORM_ACTIONS.SUBSCRIPTION_MARK_PAID) ? "Mark paid" : null,
    isSuperAdminRole(role) ? "Pause" : null,
    canUsePlatformAction(role, PLATFORM_ACTIONS.SUBSCRIPTION_CANCEL) ? "Cancel" : null,
    c.billingHistory,
  ].filter(Boolean) as string[];
  if (!subscriptions.length) {
    return <EmptyState text="Manual subscription mode is ready. No subscription records exist yet." />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {["Business", "Plan", "Billing cycle", "Start date", "Expiry date", "Status", "Amount", "Payment status", "Actions"].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((subscription) => (
              <tr className="border-t border-[#334155]" key={subscription.id}>
                <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{subscription.company?.name ?? "-"}</td>
                <td className="px-4 py-3">{subscription.plan?.planName ?? "-"}</td>
                <td className="px-4 py-3">{subscription.billingCycle ?? "-"}</td>
                <td className="px-4 py-3">{subscription.startDate ? new Date(subscription.startDate).toLocaleDateString() : "-"}</td>
                <td className="px-4 py-3">{subscription.endDate ? new Date(subscription.endDate).toLocaleDateString() : "-"}</td>
                <td className="px-4 py-3"><StatusBadge value={subscription.status} /></td>
                <td className="px-4 py-3">{money(subscription.plan?.monthlyPrice)}</td>
                <td className="px-4 py-3">Manual</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {subscriptionActions.map((label) => (
                      <button className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold" key={label} onClick={() => onAction("subscription-action", { label, subscription })} type="button">
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function drawerTitle(drawer: DrawerKind, c: CenterCopy) {
  if (drawer?.startsWith("pos-template")) {
    const map: Record<string, string> = {
      "pos-template-features": c.features,
      "pos-template-integration": c.integrationMap,
      "pos-template-integration-detail": c.integrationMap,
      "pos-template-modules": c.modules,
      "pos-template-permissions": c.defaultPermissions,
      "pos-template-plan-locks": c.planLocks,
      "pos-template-reports": c.reports,
      "pos-template-settings": c.settingsDefaults,
      "pos-template-stores": c.storesUsingTemplate,
    };
    return map[drawer] ?? c.posTemplates;
  }
  const map: Record<string, string> = {
    "business-edit": "Edit Business",
    "business-detail": c.businessDetails,
    "business-features": c.manageFeatures,
    "business-owner": c.manageOwner,
    "business-plan": c.changePlan,
    "business-suspend": c.archiveDelete,
    "business-view": c.storeDetails,
    "audit-details": c.auditDetails,
    "active-stores-today": c.activeStoresToday,
    "bills-today": c.totalBillsToday,
    "businesses-active": c.activeBusinesses,
    "businesses-all": c.totalBusinesses,
    "businesses-free": c.freePlanBusinesses,
    "businesses-pro": c.proPlanBusinesses,
    "businesses-suspended": c.suspendedBusinesses,
    "businesses-trial": c.expiringSoon,
    "create-business": c.createBusiness,
    "feature-edit": "Edit Feature",
    "pending-actions": c.pendingActions,
    "plan-analytics-detail": c.planAnalytics,
    "plan-management-detail": c.planDetails,
    "system-health-detail": c.systemHealth,
    "integration-detail": c.integrations,
    "backup-restore-detail": c.backupRestore,
    "sales-today": c.totalSalesToday,
    "platform-audit-detail": c.platformAuditDetail,
    "plans": c.plansFeatures,
    "platform-users": c.platformAdminUsers,
    "platform-settings": c.platformSettings,
    "platform-notifications": c.platformNotifications,
    "recent-activity": c.recentActivity,
    "recent-activity-detail": c.recentActivity,
    "role-detail": c.roleDetail,
    "roles-permissions": c.rolesPermissions,
    "setting-edit": c.platformSettings,
    "store-performance-detail": c.storePerformance,
    "store-users": c.totalStoreUsers,
    "store-activity-detail": c.storeActivityDetail,
    subscriptions: c.subscriptions,
    "subscription-action": c.subscriptions,
    "subscription-revenue": c.monthlySubscriptionRevenue,
    "template-builder": c.templateBuilderComingSoon,
    "template-view": c.posTemplates,
    templates: c.posTemplates,
    users: c.users,
    "user-detail": c.userDetails,
    "user-action": c.users,
  };
  return drawer ? map[drawer] ?? c.sidebarBrand : c.sidebarBrand;
}

function drawerTitleForSelected(drawer: DrawerKind, c: CenterCopy, selected: unknown) {
  if (drawer === "pos-template-detail") {
    const template = getPosTemplate(selected);
    return template ? posTemplateName(template, c) : c.posTemplates;
  }
  if (drawer?.startsWith("pos-template")) {
    return drawerTitle(drawer, c);
  }
  if (drawer === "plan-management-detail") {
    const row = selected as PlanManagementRow | null;
    return row?.businessName ?? c.planDetails;
  }
  if (drawer === "plan-analytics-detail") {
    const row = selected as PlanManagementRow | null;
    return row?.businessName ?? c.planAnalytics;
  }
  if (drawer === "store-performance-detail") {
    const row = selected as StorePerformanceRow | null;
    return row?.business.name ?? c.storePerformance;
  }
  return drawerTitle(drawer, c);
}

function drawerParent(drawer: DrawerKind, selected: unknown): { drawer: DrawerKind; selected?: unknown } | null {
  if (drawer === "pos-template-integration-detail") {
    const template = getPosTemplate(selected);
    return template ? { drawer: "pos-template-integration", selected: template } : null;
  }
  if (drawer?.startsWith("pos-template") && drawer !== "pos-template-detail") {
    const template = getPosTemplate(selected);
    return template ? { drawer: "pos-template-detail", selected: template } : null;
  }
  return null;
}

function drawerBackLabel(drawer: DrawerKind, c: CenterCopy, selected: unknown) {
  if (drawer === "pos-template-integration-detail") {
    return c.integrationMap;
  }
  if (drawer?.startsWith("pos-template") && drawer !== "pos-template-detail") {
    const template = getPosTemplate(selected);
    return template ? posTemplateName(template, c) : c.posTemplates;
  }
  if (drawer === "pos-template-detail") {
    return c.backToPosTemplates;
  }
  if (drawer === "platform-audit-detail") {
    return c.backToPlatformAudit;
  }
  if (drawer === "store-activity-detail") {
    return c.backToStoreActivity;
  }
  return c.backToCenter;
}

export function EgoPosCenterShell({ children, role }: { children: React.ReactNode; role?: string | null; username: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { c, locale, setLocale } = useCenterCopy();
  const [isPending, startTransition] = useTransition();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    accessControl: false,
    businessControl: false,
    command: true,
    planEngine: false,
    systemVault: false,
  });
  const navGroupsRaw: Array<{
    key: string;
    items: Array<{ href: string; icon: LucideIcon; label: string }>;
    label: string;
  }> = [
    {
      key: "command",
      label: c.command,
      items: [
        { href: "/super-admin", icon: LayoutDashboard, label: c.dashboard },
        { href: "/super-admin/action-center", icon: ClipboardList, label: c.actionCenter },
        { href: "/super-admin/recent-activity", icon: Activity, label: c.recentActivity },
      ],
    },
    {
      key: "businessControl",
      label: c.businessControl,
      items: [
        { href: "/super-admin/businesses", icon: Building2, label: c.businesses },
        { href: "/super-admin/stores", icon: Store, label: c.storesNav },
        { href: "/super-admin/store-performance", icon: Gauge, label: c.storePerformance },
      ],
    },
    {
      key: "planEngine",
      label: c.planEngine,
      items: [
        { href: "/super-admin/plans", icon: BarChart3, label: c.planManagement },
        { href: "/super-admin/templates", icon: Sparkles, label: c.templates },
        { href: "/super-admin/plan-analytics", icon: CreditCard, label: c.planAnalytics },
      ],
    },
    {
      key: "accessControl",
      label: c.rolesAccessControl,
      items: [
        { href: "/super-admin/users", icon: Users, label: c.users },
        { href: "/super-admin/roles", icon: Shield, label: c.rolesPermissions },
        { href: "/super-admin/audit-logs", icon: Activity, label: c.auditLogs },
      ],
    },
    {
      key: "systemVault",
      label: c.systemVault,
      items: [
        { href: "/super-admin/system-health", icon: Gauge, label: c.systemHealth },
        { href: "/super-admin/integrations", icon: ClipboardList, label: c.integrations },
        { href: "/super-admin/settings", icon: Settings, label: c.settingsMenu },
        { href: "/super-admin/backup-restore", icon: Download, label: c.backupRestore },
      ],
    },
  ];
  const navGroups = navGroupsRaw
    .map((group) => ({ ...group, items: group.items.filter((item) => canViewNavHref(role, item.href)) }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const activeGroup = navGroups.find((group) => group.items.some((item) => pathname === item.href || (item.href !== "/super-admin" && pathname.startsWith(item.href))));
    if (!activeGroup) {
      return;
    }
    setOpenGroups((current) => ({ ...current, [activeGroup.key]: true }));
  }, [pathname]);

  useEffect(() => {
    const handler = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    handler();
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
  }

  function logout() {
    startTransition(async () => {
      await fetch("/api/super-admin/logout", { method: "POST" });
      router.push("/super-admin/login");
      router.refresh();
    });
  }

  return (
    <div
      className="ego-center-theme min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#0F172A] text-[#F8FAFC]"
      style={
        {
          "--center-bg-deep": "#020617",
          "--center-bg-main": "#0F172A",
          "--center-border": "#334155",
          "--center-border-soft": "#475569",
          "--center-card-bg": "#111827",
          "--center-danger": "#EF4444",
          "--center-info": "#38BDF8",
          "--center-panel-bg": "#1E293B",
          "--center-primary": "#5EEAD4",
          "--center-primary-active": "#14B8A6",
          "--center-primary-hover": "#2DD4BF",
          "--center-success": "#22C55E",
          "--center-text-muted": "#94A3B8",
          "--center-text-primary": "#F8FAFC",
          "--center-text-secondary": "#CBD5E1",
          "--center-warning": "#F59E0B",
          "--center-sidebar-width": isSidebarCollapsed ? "5.5rem" : "18rem",
        } as CSSProperties
      }
    >
      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-[#334155] bg-[#111827] transition-[width] duration-200 lg:flex lg:flex-col",
          isSidebarCollapsed ? "w-[5.5rem]" : "w-72",
        )}
      >
        <div className={cn("border-b border-[#334155]", isSidebarCollapsed ? "p-4" : "p-6")}>
          <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center" : "gap-4")}>
            <div className="grid size-14 place-items-center rounded-lg border border-[#5EEAD4] bg-[#1E293B] text-2xl font-black text-[#5EEAD4]">
              E
            </div>
            <div className={cn("min-w-0", isSidebarCollapsed && "hidden")}>
              <div className="truncate text-xl font-semibold">{c.sidebarBrand}</div>
            </div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          {navGroups.map((group) => (
            <div key={group.key}>
              <button
                className={cn(
                  "mb-2 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[16px] font-black uppercase tracking-wider text-[#94A3B8] transition hover:bg-[#5EEAD4]/[0.08] hover:text-[#F8FAFC]",
                  isSidebarCollapsed && "justify-center px-2 text-[0px]",
                )}
                onClick={() => setOpenGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
                title={group.label}
                type="button"
              >
                <span className={cn(isSidebarCollapsed && "sr-only")}>{group.label}</span>
                <ChevronDown className={cn("size-4 text-[#5EEAD4] transition", !openGroups[group.key] && "-rotate-90", isSidebarCollapsed && "hidden")} />
              </button>
              {openGroups[group.key] || isSidebarCollapsed ? (
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    const itemLabel = item.label || item.href.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || c.sidebarBrand;
                    return (
                      <Link
                        className={cn(
                          "flex items-center rounded-md px-3 py-3 text-sm transition",
                          isSidebarCollapsed ? "justify-center" : "gap-3",
                          active
                            ? "border border-[#5EEAD4] bg-[#5EEAD4]/10 text-[#F8FAFC]"
                            : "text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]",
                        )}
                        href={item.href}
                        key={item.href}
                        title={itemLabel}
                      >
                        <Icon className={cn("size-5", active && "text-[#5EEAD4]")} />
                        <span className={cn("min-w-0 truncate", isSidebarCollapsed && "sr-only")}>{itemLabel}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </nav>
        <div className="border-t border-[#334155] p-3">
          <button
            className="grid h-11 w-full place-items-center rounded-md border border-[#334155] text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]"
            onClick={() => setIsSidebarCollapsed((value) => !value)}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            {isSidebarCollapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          </button>
        </div>
      </aside>
      <div className={cn("min-w-0 max-w-full overflow-x-hidden transition-[padding] duration-200", isSidebarCollapsed ? "lg:pl-[5.5rem]" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 border-b border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
              <div className="inline-flex h-10 items-center rounded-md border border-[#334155] px-2 text-xs font-semibold">
                <button className={cn("px-1.5", locale === "th" ? "text-[#5EEAD4]" : "text-[#94A3B8]")} onClick={() => setLocale("th")} type="button">
                  TH
                </button>
                <span className="text-[#94A3B8]">|</span>
                <button className={cn("px-1.5", locale === "en" ? "text-[#5EEAD4]" : "text-[#94A3B8]")} onClick={() => setLocale("en")} type="button">
                  EN
                </button>
              </div>
              <button
                aria-label={c.notifications}
                className="grid size-10 place-items-center rounded-md border border-[#334155] text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]"
                onClick={() => setIsNotificationsOpen(true)}
                title={c.notifications}
                type="button"
              >
                <Bell className="size-4" />
              </button>
              <button
                aria-label={c.fullscreen}
                className="grid size-10 place-items-center rounded-md border border-[#334155] text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC]"
                onClick={toggleFullscreen}
                title={c.fullscreen}
                type="button"
              >
                {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
              </button>
              <button className="h-10 rounded-md border border-[#334155] px-4 text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4] hover:text-[#F8FAFC] disabled:opacity-60" disabled={isPending} onClick={logout} type="button">
                {isPending ? c.signingOut : c.signOut}
              </button>
            </div>
          </div>
          <nav className="mt-4 flex max-w-full gap-2 overflow-x-auto lg:hidden">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              const itemLabel = item.label || item.href.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || c.sidebarBrand;
              return (
                <Link className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#334155] px-3 text-sm text-[#CBD5E1]" href={item.href} key={item.href}>
                  <Icon className="size-4" />
                  {itemLabel}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-full px-4 py-6 md:px-8 2xl:max-w-[1500px]">{children}</main>
      </div>
      {isNotificationsOpen ? (
        <CenterDrawer onClose={() => setIsNotificationsOpen(false)} title={c.platformNotifications}>
          <EmptyState text={c.noPlatformNotifications} />
        </CenterDrawer>
      ) : null}
    </div>
  );
}

export function EgoPosCenterDashboard({ data }: { data: CenterData }) {
  const { c } = useCenterCopy();
  const router = useRouter();
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [datePreset, setDatePreset] = useState<CommandDatePreset>("today");
  const [currency, setCurrency] = useState("LAK");
  const [activityFilter, setActivityFilter] = useState<CommandActivityFilter>("all");
  const [selected, setSelected] = useState<unknown>(null);
  const role = data.currentPlatformUser?.role;
  const proCount = data.businesses.filter((business) => business.plan?.planName?.toLowerCase().includes("pro")).length;
  const freeCount = data.businesses.filter((business) => !business.plan?.planName || business.plan.planName.toLowerCase().includes("free")).length;
  const suspendedCount = data.businesses.filter((business) => business.status?.toLowerCase().includes("suspend")).length;
  const monthlyRevenue = data.subscriptions.reduce((sum, subscription) => sum + Number(subscription.plan?.monthlyPrice ?? 0), 0);
  const canViewBilling = canViewSuperAdminSection(role, "subscriptions");
  const canViewTemplates = canUsePlatformAction(role, PLATFORM_ACTIONS.POS_TEMPLATE_VIEW);
  const canViewRecentActivity = isSuperAdminRole(role);
  const storeRows = buildStorePerformanceRows(data, datePreset, c);
  const todaySales = storeRows.reduce((sum, row) => sum + row.todaySalesLak, 0);
  const todayBills = storeRows.reduce((sum, row) => sum + row.todayBillCount, 0);
  const activeToday = storeRows.filter((row) => row.todayBillCount > 0 || inDateRange(row.lastActive, "today")).length;
  const actionCount = suspendedCount + storeRows.filter((row) => row.score !== null && row.score < 40).length;
  const dashboardKpis: Array<{ drawer: DrawerKind; label: string; trend: "up" | "down" | "neutral"; value: string }> = [
    { drawer: "businesses-all", label: c.totalBusinesses, trend: "neutral", value: String(data.businesses.length) },
    { drawer: "active-stores-today", label: c.activeStoresToday, trend: activeToday > 0 ? "up" : "neutral", value: String(activeToday) },
    { drawer: "sales-today", label: c.totalSalesToday, trend: todaySales > 0 ? "up" : "neutral", value: formatCompactMoney(todaySales) },
    { drawer: "bills-today", label: c.totalBillsToday, trend: todayBills > 0 ? "up" : "neutral", value: String(todayBills) },
    { drawer: "subscription-revenue", label: c.monthlyPlatformRevenue, trend: monthlyRevenue > 0 ? "up" : "neutral", value: money(monthlyRevenue) },
    { drawer: "businesses-free", label: c.freePlan, trend: "neutral", value: String(freeCount) },
    { drawer: "businesses-pro", label: c.proPlan, trend: "neutral", value: String(proCount) },
    { drawer: "pending-actions", label: c.pendingActions, trend: actionCount > 0 ? "down" : "neutral", value: String(actionCount) },
  ];
  const dateOptions: Array<{ label: string; value: CommandDatePreset }> = [
    { label: c.today, value: "today" },
    { label: c.sevenDays, value: "7d" },
    { label: c.thirtyDays, value: "30d" },
    { label: c.thisMonth, value: "month" },
  ];

  const open = (next: DrawerKind, nextSelected?: unknown) => {
    setSelected(nextSelected ?? null);
    setDrawer(next);
  };
  const parentDrawer = drawerParent(drawer, selected);

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <header className="flex min-w-0 max-w-full flex-col gap-4 rounded-lg border border-[#334155] bg-[#111827] p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-[#5EEAD4]/30 bg-[#5EEAD4]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-[#5EEAD4]">
            <Gauge className="size-3.5" />
            {c.sidebarBrand}
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-[#F8FAFC] md:text-4xl">{c.commandDashboardTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#94A3B8]">{c.manageBusinessesTemplatesPlansUsersAndPlatformControls}</p>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-[#334155] bg-[#020617] px-3 text-sm text-[#CBD5E1]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{c.dateRange}</span>
            <select className="bg-transparent text-[#F8FAFC] outline-none" onChange={(event) => setDatePreset(event.target.value as CommandDatePreset)} value={datePreset}>
              {dateOptions.map((option) => <option className="bg-[#111827]" key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-[#334155] bg-[#020617] px-3 text-sm text-[#CBD5E1]">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{c.currency}</span>
            <select className="bg-transparent text-[#F8FAFC] outline-none" onChange={(event) => setCurrency(event.target.value)} value={currency}>
              {["LAK", "THB", "USD"].map((item) => <option className="bg-[#111827]" key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <button className="inline-flex h-10 items-center gap-2 rounded-md border border-[#334155] px-3 text-sm font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]" onClick={() => router.refresh()} type="button">
            <RefreshCw className="size-4" />
            {c.refresh}
          </button>
          <button className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border border-[#334155] px-3 text-sm font-semibold text-[#64748B]" disabled title={c.exportNotReady} type="button">
            <Download className="size-4" />
            {c.export}
          </button>
        </div>
      </header>

      <section className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3">
        {dashboardKpis.map((kpi) => (
          <CommandKpiCard key={kpi.label} label={kpi.label} onOpen={() => open(kpi.drawer)} trend={kpi.trend} value={kpi.value} />
        ))}
      </section>

      <section className="grid w-full min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]">
        <div className="grid min-w-0 gap-6">
          <PlatformSalesOverview data={data} onOpen={() => open("sales-today")} preset={datePreset} />
          <TopStoresBySales rows={storeRows} onOpen={(row) => open("store-performance-detail", row)} />
        </div>
        <div className="grid min-w-0 content-start gap-6">
          <ActionCenter data={data} onOpen={(item) => open("pending-actions", item)} rows={storeRows} />
          {canViewBilling ? <PlanEngineSummary businesses={data.businesses} onOpen={(next) => open(next)} /> : null}
          <SystemHealthSummary />
        </div>
      </section>

      <StorePerformanceTable rows={storeRows} onOpen={(row) => open("store-performance-detail", row)} />

      <section className="grid w-full min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        {canViewRecentActivity ? (
          <RecentActivityCommand
            filter={activityFilter}
            logs={data.auditLogs}
            onFilter={setActivityFilter}
            onOpen={(log) => open("audit-details", log)}
            onViewAll={() => router.push("/super-admin/audit-logs")}
          />
        ) : null}
        {canViewTemplates ? <TemplateUsageSummary businesses={data.businesses} onOpen={(template) => open("pos-template-detail", template)} /> : null}
      </section>

      {drawer ? (
        <CenterDrawer
          backLabel={drawerBackLabel(drawer, c, selected)}
          onClose={() => open(null)}
          onBack={parentDrawer ? () => open(parentDrawer.drawer, parentDrawer.selected) : undefined}
          title={drawerTitleForSelected(drawer, c, selected)}
          footer={
            <button className="rounded-md border border-[#334155] px-4 py-2 text-sm font-semibold text-[#CBD5E1]" onClick={() => open(null)} type="button">
              {c.close}
            </button>
          }
        >
          <DrawerContent data={data} drawer={drawer} onAction={open} onClose={() => open(null)} selected={selected} />
        </CenterDrawer>
      ) : null}
    </div>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#334155] bg-[#111827] p-4">
      <h2 className="mb-3 text-lg font-semibold text-[#F8FAFC]">{title}</h2>
      {children}
    </section>
  );
}

export function EgoPosCenterSectionPage({ data, section }: { data: CenterData; section: SectionKind }) {
  const { c } = useCenterCopy();
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [selected, setSelected] = useState<unknown>(null);
  const role = data.currentPlatformUser?.role;
  const open = (next: DrawerKind, nextSelected?: unknown) => {
    setSelected(nextSelected ?? null);
    setDrawer(next);
  };
  const parentDrawer = drawerParent(drawer, selected);
  const titleMap: Record<SectionKind, string> = {
    audit: c.auditLogs,
    businesses: c.storesBusinesses,
    plans: c.plansFeatures,
    roles: c.roles,
    settings: c.platformSettings,
    subscriptions: c.subscriptions,
    templates: c.posTemplates,
    users: c.users,
  };

  const body = useMemo(() => {
    if (!canViewSuperAdminSection(role, section)) return <AccessDeniedPanel />;
    if (section === "businesses") return <BusinessDirectoryPage data={data} onAction={open} />;
    if (section === "templates") {
      return <TemplateList businesses={data.businesses} onAction={open} />;
    }
    if (section === "plans") return <PlanManagementPage data={data} onAction={open} />;
    if (section === "subscriptions") return <SubscriptionsPanel subscriptions={data.subscriptions} onAction={open} role={role} />;
    if (section === "users") {
      return <UserDirectoryPage data={data} onAction={open} />;
    }
    if (section === "roles") {
      return <RoleDirectoryPage data={data} onAction={open} />;
    }
    if (section === "audit") return <AuditLogsCenter data={data} onAction={open} role={role} />;
    return (
      <div className="grid gap-3">
        {platformSettings.map((setting) => (
          <button className="flex items-center justify-between rounded-lg border border-[#334155] bg-[#111827] px-4 py-4 text-left transition hover:border-[#5EEAD4]" key={setting} onClick={() => open("setting-edit", setting)} type="button">
            <span className="font-semibold text-[#F8FAFC]">{setting}</span>
            <ChevronRight className="size-4 text-[#94A3B8]" />
          </button>
        ))}
      </div>
    );
  }, [data, data.businesses, data.subscriptions, data.users, role, section]);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">{titleMap[section]}</h1>
        <p className="mt-2 text-sm text-[#94A3B8]">{c.manageBusinessesTemplatesPlansUsersAndPlatformControls}</p>
      </header>
      {body}
      {drawer ? (
        <CenterDrawer
          backLabel={drawerBackLabel(drawer, c, selected)}
          onBack={parentDrawer ? () => open(parentDrawer.drawer, parentDrawer.selected) : undefined}
          onClose={() => open(null)}
          title={drawerTitleForSelected(drawer, c, selected)}
        >
          <DrawerContent data={data} drawer={drawer} onAction={open} onClose={() => open(null)} selected={selected} />
        </CenterDrawer>
      ) : null}
    </div>
  );
}

export function EgoPosCenterOperationalPage({
  data,
  section,
}: {
  data: CenterData;
  section: PlaceholderSectionKind;
}) {
  const { c } = useCenterCopy();
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [selected, setSelected] = useState<unknown>(null);
  const role = data.currentPlatformUser?.role;
  const open = (next: DrawerKind, nextSelected?: unknown) => {
    setSelected(nextSelected ?? null);
    setDrawer(next);
  };
  const parentDrawer = drawerParent(drawer, selected);

  let body: React.ReactNode;
  if (section === "actionCenter") {
    body = <ActionCenterPage data={data} onAction={open} />;
  } else if (section === "recentActivity") {
    body = canViewPlatformAudit(role) ? <RecentActivityPage data={data} onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "stores") {
    body = canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW) ? <StoresPage data={data} onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "storePerformance") {
    body = canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW) ? <StorePerformancePage data={data} onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "planAnalytics") {
    body = canViewSuperAdminSection(role, "plans") ? <PlanAnalyticsPage data={data} onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "systemHealth") {
    body = canViewSuperAdminSection(role, "settings") ? <SystemHealthPage onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "integrations") {
    body = canViewSuperAdminSection(role, "settings") ? <IntegrationsPage onAction={open} /> : <AccessDeniedPanel />;
  } else if (section === "backupRestore") {
    body = canViewSuperAdminSection(role, "settings") ? <BackupRestorePage /> : <AccessDeniedPanel />;
  } else {
    body = <EgoPosCenterPlaceholderPage section={section} />;
  }

  return (
    <>
      {body}
      {drawer ? (
        <CenterDrawer
          backLabel={drawerBackLabel(drawer, c, selected)}
          onBack={parentDrawer ? () => open(parentDrawer.drawer, parentDrawer.selected) : undefined}
          onClose={() => open(null)}
          title={drawerTitleForSelected(drawer, c, selected)}
        >
          <DrawerContent data={data} drawer={drawer} onAction={open} onClose={() => open(null)} selected={selected} />
        </CenterDrawer>
      ) : null}
    </>
  );
}

export function EgoPosCenterPlaceholderPage({ section }: { section: PlaceholderSectionKind }) {
  const { c } = useCenterCopy();
  const titleMap: Record<PlaceholderSectionKind, string> = {
    actionCenter: c.actionCenter,
    backupRestore: c.backupRestore,
    integrations: c.integrations,
    planAnalytics: c.planAnalytics,
    recentActivity: c.recentActivity,
    storePerformance: c.storePerformance,
    stores: c.storesNav,
    systemHealth: c.systemHealth,
  };

  return (
    <div className="grid w-full min-w-0 max-w-full gap-6 overflow-x-hidden">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">{titleMap[section]}</h1>
        <p className="mt-2 text-sm text-[#94A3B8]">{c.sectionNotConnectedYet}</p>
      </header>
      <section className="min-w-0 rounded-lg border border-[#334155] bg-[#111827] p-6">
        <EmptyState text={c.sectionNotConnectedYet} />
      </section>
    </div>
  );
}

function RoleList({ onOpen, roles, title }: { onOpen: (role: string) => void; roles: string[]; title: string }) {
  return (
    <Panel title={title}>
      <div className="grid gap-2">
        {roles.map((role) => (
          <button className="flex items-center justify-between rounded-md border border-[#334155] px-3 py-3 text-left transition hover:border-[#5EEAD4]" key={role} onClick={() => onOpen(role)} type="button">
            <span className="font-semibold">{role}</span>
            <ChevronRight className="size-4 text-[#94A3B8]" />
          </button>
        ))}
      </div>
    </Panel>
  );
}
