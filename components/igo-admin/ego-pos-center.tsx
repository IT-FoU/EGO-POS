"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Gauge,
  LayoutDashboard,
  Lock,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Shield,
  Sparkles,
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
import { LOCALE_CHANGE_EVENT, persistClientLocale, readClientLocale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

type CenterBusiness = {
  _count?: { branches?: number; members?: number };
  branches?: Array<{ name?: string | null }>;
  createdAt?: string;
  id: string;
  name: string;
  owner?: { email?: string | null; fullName?: string | null; phone?: string | null; username?: string | null } | null;
  plan?: { monthlyPrice?: string | number | null; planName?: string | null } | null;
  status?: string | null;
  businessTemplateKey?: string | null;
};

type CenterUser = {
  companies?: Array<{ company?: { id?: string; name?: string } }>;
  createdAt?: string;
  email?: string | null;
  fullName?: string | null;
  id: string;
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
  id: string;
  isActive?: boolean;
  maxBranches?: number | null;
  maxCashiers?: number | null;
  maxProducts?: number | null;
  maxPromotions?: number | null;
  maxReports?: number | null;
  monthlyPrice?: string | number | null;
  planName: string;
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

type CenterData = {
  auditLogs: CenterLog[];
  businesses: CenterBusiness[];
  currentPlatformUser?: { email: string; id: string; name: string; role: string } | null;
  platformAuditLogs: PlatformAuditLog[];
  platformUsersCount: number;
  plans: CenterPlan[];
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
  | "store-users"
  | "platform-users"
  | "users"
  | "roles-permissions"
  | "platform-settings"
  | "platform-notifications"
  | "subscription-revenue"
  | "subscriptions"
  | "pending-actions"
  | "create-business"
  | "templates"
  | "plans"
  | "recent-activity"
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
    "/super-admin/audit-logs": "audit",
    "/super-admin/businesses": "businesses",
    "/super-admin/plans": "plans",
    "/super-admin/roles": "roles",
    "/super-admin/settings": "settings",
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
  dateTime: "Date / Time",
  ipAddress: "IP Address",
  metadata: "Metadata",
  noPlatformAuditLogs: "No platform audit logs found.",
  noStoreActivityLogs: "No store activity logs found for this selection.",
  occurredAt: "Occurred At",
  platformAudit: "Platform Audit",
  platformAuditDetail: "Platform Audit Detail",
  requestId: "Request ID",
  requiresBillingAdmin: "Requires Billing Admin",
  requiresPermission: "Requires permission",
  requiresSuperAdmin: "Requires Super Admin",
  requiresTemplateManager: "Requires Template Manager",
  scopedAuditView: "Scoped audit view",
  selectBusinessForStoreActivity: "Select a business to view store activity.",
  severity: "Severity",
  storeActivity: "Store Activity",
  storeActivityDetail: "Store Activity Detail",
  storeUser: "Store User",
  syncedAt: "Synced At",
  target: "Target",
  terminal: "Terminal",
  youDoNotHavePermissionToViewThisSection: "You do not have permission to view this section.",
  userAgent: "User Agent",
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
    <div className="fixed inset-y-0 right-0 z-50 flex overflow-hidden bg-[#020617] text-[#F8FAFC] shadow-2xl lg:left-[var(--center-sidebar-width)]">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden border-l border-[#334155] bg-[#0F172A]">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
          <div className="min-w-0">
            <button
              className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-[#5EEAD4] transition hover:text-[#F8FAFC]"
              onClick={onBack ?? onClose}
              type="button"
            >
              <ArrowLeft className="size-4" />
              {backLabel ?? c.backToCenter}
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
        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
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
                <td className="px-4 py-3">{business.businessTemplateKey ?? "Mini Mart"}</td>
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
              <tr className="border-t border-[#334155]" key={log.id}>
                <td className="px-4 py-3">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">{log.user?.fullName ?? log.user?.username ?? "-"}</td>
                <td className="px-4 py-3">{log.action ?? "-"}</td>
                <td className="px-4 py-3">{log.company?.name ?? "-"}</td>
                <td className="px-4 py-3">
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={() => onOpen(log)} type="button">
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
              <tr className="border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id}>
                <td className="px-4 py-3 whitespace-nowrap">{log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"}</td>
                <td className="px-4 py-3">{log.actorName || log.actorEmail || "-"}</td>
                <td className="px-4 py-3">{log.actorRole ?? log.actorType ?? "-"}</td>
                <td className="px-4 py-3 font-medium text-[#F8FAFC]">{log.action}</td>
                <td className="px-4 py-3">{log.targetName ?? log.targetType ?? "-"}</td>
                <td className="px-4 py-3"><StatusBadge value={log.status ?? "success"} /></td>
                <td className="px-4 py-3"><StatusBadge value={log.severity ?? "info"} /></td>
                <td className="px-4 py-3">
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={() => onOpen(log)} type="button">
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
              <tr className="border-t border-[#334155] transition hover:bg-[#5EEAD4]/[0.06]" key={log.id}>
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
                  <button className="text-[#5EEAD4] underline-offset-4 hover:underline" onClick={() => onOpen(log)} type="button">
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
  const [tab, setTab] = useState<"platform" | "store">("platform");
  const [businessId, setBusinessId] = useState("");
  const canSeePlatformAudit = canViewPlatformAudit(role);
  const canSeeStoreActivity = isSuperAdminRole(role) || canViewStoreActivityLogs(role, { businessId });
  const tabs = [
    canSeePlatformAudit ? { label: c.platformAudit, value: "platform" as const } : null,
    canSeeStoreActivity ? { label: c.storeActivity, value: "store" as const } : null,
  ].filter(Boolean) as Array<{ label: string; value: "platform" | "store" }>;
  const storeLogs = businessId ? data.storeActivityLogs.filter((log) => log.businessId === businessId) : [];

  useEffect(() => {
    if (!tabs.some((item) => item.value === tab)) {
      setTab(tabs[0]?.value ?? "platform");
    }
  }, [tab, tabs]);

  if (!tabs.length) {
    return <AccessDeniedPanel />;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ label, value }) => (
          <button
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-semibold transition",
              tab === value ? "border-[#5EEAD4] bg-[#5EEAD4]/10 text-[#F8FAFC]" : "border-[#334155] text-[#CBD5E1] hover:border-[#5EEAD4]",
            )}
            key={value}
            onClick={() => setTab(value)}
            type="button"
          >
            {label}
            {value === "platform" && getPlatformAuditActionScope(role).type === "scoped" ? (
              <span className="ml-2 rounded-full border border-[#334155] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#94A3B8]">
                {c.scopedAuditView}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "platform" ? (
        <PlatformAuditTable logs={data.platformAuditLogs} onOpen={(log) => onAction("platform-audit-detail", log)} />
      ) : (
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-[#CBD5E1] md:max-w-md">
            <span className="font-semibold text-[#F8FAFC]">{c.business}</span>
            <select
              className="rounded-md border border-[#334155] bg-[#1E293B] px-3 py-2 text-[#F8FAFC] outline-none focus:border-[#5EEAD4]"
              onChange={(event) => setBusinessId(event.target.value)}
              value={businessId}
            >
              <option value="">{c.selectBusinessForStoreActivity}</option>
              {data.businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </label>
          {businessId ? (
            <StoreActivityTable logs={storeLogs} onOpen={(log) => onAction("store-activity-detail", log)} />
          ) : (
            <EmptyState text={c.selectBusinessForStoreActivity} />
          )}
        </div>
      )}
    </div>
  );
}

function PlatformAuditDetail({ log }: { log: PlatformAuditLog }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <DetailGrid
        rows={[
          [c.actor, `${log.actorName}${log.actorEmail ? ` (${log.actorEmail})` : ""}`],
          [c.role, log.actorRole ?? log.actorType ?? "-"],
          [c.action, log.action],
          [c.status, <StatusBadge key="status" value={log.status ?? "success"} />],
          [c.severity, <StatusBadge key="severity" value={log.severity ?? "info"} />],
          [c.target, `${log.targetType ?? "-"}${log.targetName ? `: ${log.targetName}` : ""}`],
          [c.business, log.business?.name ?? log.businessId ?? "-"],
          [c.requestId, log.requestId ?? "-"],
          [c.ipAddress, log.ipAddress ?? "-"],
          [c.userAgent, log.userAgent ?? "-"],
        ]}
      />
      <Panel title={c.before}><AuditValue value={log.beforeValue} /></Panel>
      <Panel title={c.after}><AuditValue value={log.afterValue} /></Panel>
      <Panel title={c.metadata}><AuditValue value={log.metadata} /></Panel>
    </div>
  );
}

function StoreActivityDetail({ log }: { log: StoreActivityLog }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <DetailGrid
        rows={[
          [c.business, log.business?.name ?? log.businessId],
          [c.branch, log.branch?.name ?? "-"],
          [c.terminal, log.terminalName ?? log.deviceName ?? "-"],
          [c.storeUser, log.actorName],
          [c.role, log.actorRole],
          [c.action, log.action],
          [c.target, `${log.targetType ?? "-"}${log.targetName ? `: ${log.targetName}` : ""}`],
          [c.amount, log.amount ?? "-"],
          [c.currency, log.currency ?? "LAK"],
          [c.occurredAt, log.occurredAt ? new Date(log.occurredAt).toLocaleString() : "-"],
          [c.dateTime, log.createdAt ? new Date(log.createdAt).toLocaleString() : "-"],
          [c.syncedAt, log.syncedAt ? new Date(log.syncedAt).toLocaleString() : "-"],
        ]}
      />
      <Panel title={c.before}><AuditValue value={log.beforeValue} /></Panel>
      <Panel title={c.after}><AuditValue value={log.afterValue} /></Panel>
      <Panel title={c.metadata}><AuditValue value={log.metadata} /></Panel>
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
    const key = business.businessTemplateKey ?? "mini-mart";
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
  return businesses.filter((business) => (business.businessTemplateKey ?? "mini-mart") === template.key);
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

function UsersTable({ onAction, role, users }: { onAction: (drawer: DrawerKind, selected?: unknown) => void; role?: string | null; users: CenterUser[] }) {
  const { c } = useCenterCopy();
  const userActions = [
    { label: "View user" },
    isSuperAdminRole(role) ? { label: "Edit user" } : null,
    canUsePlatformAction(role, PLATFORM_ACTIONS.USER_ROLE_CHANGE) ? { label: "Change role" } : null,
    isSuperAdminRole(role) ? { label: "Reset password" } : null,
    isSuperAdminRole(role) ? { label: "Disable user" } : null,
    { label: "View activity" },
  ].filter(Boolean) as Array<{ label: string }>;
  if (!users.length) {
    return <EmptyState text={c.sectionEmpty} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[#334155]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead className="bg-[#1E293B] text-left text-[#94A3B8]">
            <tr>
              {["Name", "Email / Username", "Role", "Business", "Status", "Last login", "Actions"].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-[#334155]" key={user.id}>
                <td className="px-4 py-3 font-semibold text-[#F8FAFC]">{user.fullName ?? "-"}</td>
                <td className="px-4 py-3">{user.email ?? user.username ?? "-"}</td>
                <td className="px-4 py-3">Store user</td>
                <td className="px-4 py-3">{user.companies?.map((entry) => entry.company?.name).filter(Boolean).join(", ") || "-"}</td>
                <td className="px-4 py-3"><StatusBadge value={user.status} /></td>
                <td className="px-4 py-3">-</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {userActions.map(({ label }) => (
                      <button
                        className="rounded-md border border-[#334155] px-2 py-1 text-xs font-semibold text-[#CBD5E1] transition hover:border-[#5EEAD4]"
                        key={label}
                        onClick={() => onAction("user-action", { label, user })}
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

function CreateBusinessWizard({ onClose }: { onClose: () => void }) {
  const { c } = useCenterCopy();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState(templateDefinitions[0]?.key ?? "mini-mart");
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
      ownerEmail: String(data.get("ownerEmail") || ""),
      ownerFullName: String(data.get("ownerFullName") || ""),
      ownerTemporaryPassword: String(data.get("ownerTemporaryPassword") || ""),
      ownerUsername: String(data.get("ownerUsername") || ""),
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
          {templateDefinitions.map((template) => (
            <button
              className={cn("rounded-lg border p-4 text-left transition", selectedTemplate === template.key ? "border-[#5EEAD4] bg-[#5EEAD4]/10" : "border-[#334155] bg-[#111827] hover:border-[#5EEAD4]")}
              key={template.key}
              onClick={() => setSelectedTemplate(template.key)}
              type="button"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[#F8FAFC]">{template.name}</span>
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
            <option value="Pro">Pro Plan</option>
            <option value="Trial">Trial</option>
            <option value="Custom">Custom</option>
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
    return <PlansMatrix onAction={onAction} role={role} />;
  }
  if (drawer === "recent-activity") {
    if (!canViewPlatformAudit(role)) return <AccessDeniedPanel />;
    return <LogsTable logs={data.auditLogs} onOpen={(log) => onAction("audit-details", log)} />;
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
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <button className="rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold" onClick={() => onAction("platform-users")} type="button">Platform Users</button>
          <button className="rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold" onClick={() => onAction("store-users")} type="button">Store Users</button>
        </div>
        <UsersTable users={data.users} onAction={onAction} role={role} />
      </div>
    );
  }
  if (drawer === "roles-permissions") {
    if (!canViewSuperAdminSection(role, "roles")) return <AccessDeniedPanel />;
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <RoleList title="Platform roles" roles={platformRoles} onOpen={(role) => onAction("role-edit", { role, scope: "platform" })} />
        <RoleList title="Store roles" roles={storeRoles} onOpen={(role) => onAction("role-edit", { role, scope: "store" })} />
      </div>
    );
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
    return <UsersTable users={data.users} onAction={onAction} role={role} />;
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
  if (drawer === "pending-actions") {
    return <EmptyState text="Pending actions will appear here when plan expiry, suspended businesses, failed billing, or platform review items need attention." />;
  }

  return <OperationalDrawer selected={selected} />;
}

function OperationalDrawer({ selected }: { selected: unknown }) {
  const { c } = useCenterCopy();
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-[#334155] bg-[#111827] p-5">
        <h3 className="text-lg font-semibold text-[#F8FAFC]">{c.featureAccess}</h3>
        <p className="mt-2 text-sm text-[#94A3B8]">{c.manualControl}</p>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg border border-[#334155] bg-[#020617] p-4 text-xs text-[#CBD5E1]">
        {JSON.stringify(selected ?? {}, null, 2)}
      </pre>
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
    "business-features": c.manageFeatures,
    "business-owner": c.manageOwner,
    "business-plan": c.changePlan,
    "business-suspend": c.archiveDelete,
    "business-view": c.businessDetails,
    "businesses-active": c.activeBusinesses,
    "businesses-all": c.totalBusinesses,
    "businesses-free": c.freePlanBusinesses,
    "businesses-pro": c.proPlanBusinesses,
    "businesses-suspended": c.suspendedBusinesses,
    "businesses-trial": c.expiringSoon,
    "create-business": c.createBusiness,
    "feature-edit": "Edit Feature",
    "pending-actions": c.pendingActions,
    "platform-audit-detail": c.platformAuditDetail,
    "plans": c.plansFeatures,
    "platform-users": c.platformAdminUsers,
    "platform-settings": c.platformSettings,
    "platform-notifications": c.platformNotifications,
    "recent-activity": c.recentActivity,
    "roles-permissions": c.rolesPermissions,
    "setting-edit": c.platformSettings,
    "store-users": c.totalStoreUsers,
    "store-activity-detail": c.storeActivityDetail,
    subscriptions: c.subscriptions,
    "subscription-action": c.subscriptions,
    "subscription-revenue": c.monthlySubscriptionRevenue,
    "template-builder": c.templateBuilderComingSoon,
    "template-view": c.posTemplates,
    templates: c.posTemplates,
    users: c.users,
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
    { key: "command", label: c.command, items: [{ href: "/super-admin", icon: LayoutDashboard, label: c.dashboard }] },
    {
      key: "businessControl",
      label: c.businessControl,
      items: [
        { href: "/super-admin/businesses", icon: Building2, label: c.businesses },
        { href: "/super-admin/templates", icon: Sparkles, label: c.businessTemplates },
      ],
    },
    {
      key: "planEngine",
      label: c.planEngine,
      items: [
        { href: "/super-admin/plans", icon: BarChart3, label: c.plansFeatures },
        { href: "/super-admin/subscriptions", icon: CreditCard, label: c.subscriptions },
      ],
    },
    {
      key: "accessControl",
      label: c.rolesAccessControl,
      items: [
        { href: "/super-admin/users", icon: Users, label: c.users },
        { href: "/super-admin/roles", icon: Shield, label: c.roles },
      ],
    },
    {
      key: "systemVault",
      label: c.systemVault,
      items: [
        { href: "/super-admin/settings", icon: Settings, label: c.platformSettings },
        { href: "/super-admin/audit-logs", icon: Activity, label: c.auditLogs },
      ],
    },
  ];
  const navGroups = navGroupsRaw
    .map((group) => ({ ...group, items: group.items.filter((item) => canViewNavHref(role, item.href)) }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const activeGroup = navGroups.find((group) => group.items.some((item) => pathname === item.href));
    if (!activeGroup || pathname === "/super-admin") {
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
      className="ego-center-theme min-h-screen bg-[#0F172A] text-[#F8FAFC]"
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
                        title={item.label}
                      >
                        <Icon className={cn("size-5", active && "text-[#5EEAD4]")} />
                        <span className={cn(isSidebarCollapsed && "sr-only")}>{item.label}</span>
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
      <div className={cn("transition-[padding] duration-200", isSidebarCollapsed ? "lg:pl-[5.5rem]" : "lg:pl-72")}>
        <header className="sticky top-0 z-30 border-b border-[#334155] bg-[#111827] px-4 py-4 md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0" aria-hidden="true" />
            <div className="flex items-center gap-3">
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
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
            {navGroups.flatMap((group) => group.items).map((item) => {
              const Icon = item.icon;
              return (
                <Link className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-[#334155] px-3 text-sm text-[#CBD5E1]" href={item.href} key={item.href}>
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 md:px-8">{children}</main>
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
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [selected, setSelected] = useState<unknown>(null);
  const role = data.currentPlatformUser?.role;
  const proCount = data.businesses.filter((business) => business.plan?.planName?.toLowerCase().includes("pro")).length;
  const freeCount = data.businesses.filter((business) => !business.plan?.planName || business.plan.planName.toLowerCase().includes("free")).length;
  const suspendedCount = data.businesses.filter((business) => business.status?.toLowerCase().includes("suspend")).length;
  const monthlyRevenue = data.subscriptions.reduce((sum, subscription) => sum + Number(subscription.plan?.monthlyPrice ?? 0), 0);
  const canViewBusinesses = canUsePlatformAction(role, PLATFORM_ACTIONS.BUSINESS_VIEW);
  const canViewBilling = canViewSuperAdminSection(role, "subscriptions");
  const canViewTemplates = canUsePlatformAction(role, PLATFORM_ACTIONS.POS_TEMPLATE_VIEW);
  const canViewRecentActivity = isSuperAdminRole(role);
  const normalizedRole = normalizeUiPlatformRole(role);
  const dashboardKpis = [
    canViewBusinesses && normalizedRole !== PLATFORM_ROLES.TEMPLATE_MANAGER
      ? { drawer: "businesses-all" as DrawerKind, label: c.totalBusinesses, value: data.businesses.length }
      : null,
    canViewBusinesses && normalizedRole !== PLATFORM_ROLES.TEMPLATE_MANAGER
      ? {
          drawer: "businesses-active" as DrawerKind,
          label: c.activeBusinesses,
          value: data.businesses.filter((b) => (b.status ?? "active") === "active").length,
        }
      : null,
    canViewBilling ? { drawer: "businesses-free" as DrawerKind, label: c.freePlan, value: freeCount } : null,
    canViewBilling ? { drawer: "businesses-pro" as DrawerKind, label: c.proPlan, value: proCount } : null,
    canViewBilling ? { drawer: "subscription-revenue" as DrawerKind, label: c.monthlyRevenue, value: money(monthlyRevenue) } : null,
    isSuperAdminRole(role) || normalizedRole === PLATFORM_ROLES.SUPPORT_ADMIN
      ? { drawer: "pending-actions" as DrawerKind, label: c.pendingActions, value: suspendedCount }
      : null,
  ].filter(Boolean) as Array<{ drawer: DrawerKind; label: string; value: string | number }>;

  const open = (next: DrawerKind, nextSelected?: unknown) => {
    setSelected(nextSelected ?? null);
    setDrawer(next);
  };
  const parentDrawer = drawerParent(drawer, selected);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-normal">{c.dashboard}</h1>
      </header>

      {dashboardKpis.length ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {dashboardKpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} onClick={() => open(kpi.drawer)} />
          ))}
        </section>
      ) : null}

      <DashboardNotifications onOpen={() => open("platform-notifications")} />

      {canViewTemplates ? <DashboardPosTemplateStatus onOpen={(template) => open("pos-template-detail", template)} /> : null}

      {canViewRecentActivity ? <DashboardRecentActivity logs={data.auditLogs} onOpen={(log) => open("audit-details", log)} onViewAll={() => open("recent-activity")} /> : null}

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
    businesses: c.businesses,
    plans: c.plansFeatures,
    roles: c.roles,
    settings: c.platformSettings,
    subscriptions: c.subscriptions,
    templates: c.posTemplates,
    users: c.users,
  };

  const body = useMemo(() => {
    if (!canViewSuperAdminSection(role, section)) return <AccessDeniedPanel />;
    if (section === "businesses") return <BusinessTable businesses={data.businesses} onAction={open} role={role} />;
    if (section === "templates") {
      return <TemplateList businesses={data.businesses} onAction={open} />;
    }
    if (section === "plans") return <PlansMatrix onAction={open} role={role} />;
    if (section === "subscriptions") return <SubscriptionsPanel subscriptions={data.subscriptions} onAction={open} role={role} />;
    if (section === "users") {
      return (
        <div className="grid gap-4">
          {isSuperAdminRole(role) ? (
            <div className="flex flex-wrap gap-2">
              <button className="rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold" onClick={() => open("platform-users")} type="button">Platform Users</button>
              <button className="rounded-md border border-[#5EEAD4] px-3 py-2 text-sm font-semibold" onClick={() => open("store-users")} type="button">Store Users</button>
            </div>
          ) : null}
          <UsersTable users={data.users} onAction={open} role={role} />
        </div>
      );
    }
    if (section === "roles") {
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <RoleList title="Platform roles" roles={platformRoles} onOpen={(role) => open("role-edit", { role, scope: "platform" })} />
          <RoleList title="Store roles" roles={storeRoles} onOpen={(role) => open("role-edit", { role, scope: "store" })} />
        </div>
      );
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
