"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { readStringFromStorage, runDemoStorageMigrations, writeStringToStorage } from "@/lib/demo/storage";

const LANGUAGE_KEY = "ego-pos:admin-locale";

const adminCopyEn = {
    activeBusinesses: "Active Businesses",
    action: "Action",
    activate: "Activate",
    auditLogs: "Audit Logs",
    block: "Block",
    business: "Business",
    businessManagement: "Business Management",
    businesses: "Businesses",
    company: "Company",
    controls: "Controls",
    created: "Created",
    currentPlan: "Current plan",
    dashboard: "Dashboard",
    delete: "Delete",
    downgrade: "Downgrade",
    egoAdmin: "EGO Admin",
    egoSuperAdmin: "Super Admin",
    superAdminBrand: "Super Admin",
    adminPassword: "Super Admin password",
    adminUsername: "Super Admin email",
    headerRole: "Super Admin",
    freePlan: "Free",
    loginSubtitle: "Platform owner access only.",
    mainBranch: "Main Branch",
    miniMart: "Mini Mart",
    module: "Module",
    newRegistrations: "New Registrations",
    owner: "Owner",
    plan: "Plan",
    platformDashboard: "Platform Dashboard",
    platformManagement: "Platform management",
    platformOverview: "Platform-wide business, user, subscription, and activity overview.",
    platformUserControls: "View platform users and prepare block, unblock, and password reset controls.",
    platformActionsHistory: "Important platform actions and admin activity history foundation.",
    resetPassword: "Reset Password",
    restore: "Restore",
    signIn: "Sign in to Super Admin",
    signingIn: "Signing in...",
    signOut: "Sign out",
    signingOut: "Signing out...",
    status: "Status",
    suspend: "Suspend",
    subscriptions: "Subscriptions",
    subscriptionManagement: "Subscription Management",
    subscriptionOverview: "View plans and prepare upgrade, downgrade, and premium feature unlocks.",
    suspendedBusinesses: "Suspended Businesses",
    template: "Template",
    time: "Time",
    totalBusinesses: "Total Businesses",
    totalUsers: "Total Users",
    unblock: "Unblock",
    unassigned: "Unassigned",
    unlockPremium: "Unlock premium features",
    upgrade: "Upgrade",
    user: "User",
    userManagement: "User Management",
    users: "Users",
    viewBusinessControls: "View stores, owners, business template, plan, status, and platform controls.",
  };

export const adminCopy = {
  en: adminCopyEn,
  th: adminCopyEn,
} as const;

export type AdminCopyKey = keyof typeof adminCopy.en;

export function useAdminLocale() {
  const [locale, setLocale] = useState<"th" | "en">("en");

  useEffect(() => {
    runDemoStorageMigrations();
    const stored = readStringFromStorage(LANGUAGE_KEY);
    const nextLocale = stored === "th" || stored === "en" ? stored : "en";
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    setLocale(nextLocale);
  }, []);

  const updateLocale = useCallback((nextLocale: "th" | "en") => {
    writeStringToStorage(LANGUAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    setLocale(nextLocale);
  }, []);

  return { copy: adminCopy.en, locale, updateLocale };
}

export function AdminText({ k }: { k: AdminCopyKey }) {
  const { copy } = useAdminLocale();
  return <>{copy[k]}</>;
}

export function AdminLanguageToggle() {
  const { locale, updateLocale } = useAdminLocale();
  return (
    <div className="inline-flex h-10 shrink-0 items-center rounded-md border border-border px-2 text-xs font-semibold">
      <button
        className={cn("px-1.5 transition", locale === "th" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("th")}
      >
        TH
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        className={cn("px-1.5 transition", locale === "en" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("en")}
      >
        EN
      </button>
    </div>
  );
}
