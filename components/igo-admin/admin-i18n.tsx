"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage, runDemoStorageMigrations, writeStringToStorage } from "@/lib/demo/storage";

const LANGUAGE_KEY = DemoStorageKeys.locale;

export const adminCopy = {
  en: {
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
    egoSuperAdmin: "EGO Super Admin",
    adminPassword: "Admin password",
    adminUsername: "Admin username",
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
    signIn: "Sign in to EGO Admin",
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
  },
  lo: {
    activeBusinesses: "ທຸລະກິດທີ່ໃຊ້ງານ",
    action: "ການກະທຳ",
    activate: "ເປີດໃຊ້ງານ",
    auditLogs: "ບັນທຶກການກວດສອບ",
    block: "ບລັອກ",
    business: "ທຸລະກິດ",
    businessManagement: "ຈັດການທຸລະກິດ",
    businesses: "ທຸລະກິດ",
    company: "ບໍລິສັດ",
    controls: "ການຄວບຄຸມ",
    created: "ສ້າງເມື່ອ",
    currentPlan: "ແຜນປັດຈຸບັນ",
    dashboard: "ໜ້າຫຼັກ",
    delete: "ລຶບ",
    downgrade: "ຫຼຸດແຜນ",
    egoAdmin: "EGO Admin",
    egoSuperAdmin: "EGO Super Admin",
    adminPassword: "Password Admin",
    adminUsername: "Username Admin",
    headerRole: "Super Admin",
    freePlan: "ຟຣີ",
    loginSubtitle: "ສຳລັບເຈົ້າຂອງແພລດຟອມເທົ່ານັ້ນ.",
    mainBranch: "ສາຂາຫຼັກ",
    miniMart: "ມິນິມາດ",
    module: "ໂມດູນ",
    newRegistrations: "ການລົງທະບຽນໃໝ່",
    owner: "ເຈົ້າຂອງ",
    plan: "ແຜນ",
    platformDashboard: "ໜ້າຫຼັກແພລດຟອມ",
    platformManagement: "ຈັດການແພລດຟອມ",
    platformOverview: "ພາບລວມທຸລະກິດ, ຜູ້ໃຊ້, ແຜນສະມາຊິກ ແລະ ກິດຈະກຳຂອງແພລດຟອມ.",
    platformUserControls: "ເບິ່ງຜູ້ໃຊ້ແພລດຟອມ ແລະ ກຽມການຄວບຄຸມບລັອກ, ປົດບລັອກ ແລະ ຣີເຊັດ Password.",
    platformActionsHistory: "ພື້ນຖານປະຫວັດການກະທຳສຳຄັນ ແລະ ກິດຈະກຳ Admin.",
    resetPassword: "ຣີເຊັດ Password",
    restore: "ກູ້ຄືນ",
    signIn: "Login ເຂົ້າ EGO Admin",
    signingIn: "ກຳລັງ Login...",
    signOut: "ອອກຈາກລະບົບ",
    signingOut: "ກຳລັງອອກຈາກລະບົບ...",
    status: "ສະຖານະ",
    suspend: "ລະງັບ",
    subscriptions: "ແຜນສະມາຊິກ",
    subscriptionManagement: "ຈັດການແຜນສະມາຊິກ",
    subscriptionOverview: "ເບິ່ງແຜນ ແລະ ກຽມການອັບເກຣດ, ຫຼຸດແຜນ ແລະ ປົດລັອກຟີເຈີພຣີມຽມ.",
    suspendedBusinesses: "ທຸລະກິດທີ່ຖືກລະງັບ",
    template: "ແມ່ແບບ",
    time: "ເວລາ",
    totalBusinesses: "ທຸລະກິດທັງໝົດ",
    totalUsers: "ຜູ້ໃຊ້ທັງໝົດ",
    unblock: "ປົດບລັອກ",
    unassigned: "ຍັງບໍ່ກຳນົດ",
    unlockPremium: "ປົດລັອກຟີເຈີພຣີມຽມ",
    upgrade: "ອັບເກຣດ",
    user: "ຜູ້ໃຊ້",
    userManagement: "ຈັດການຜູ້ໃຊ້",
    users: "ຜູ້ໃຊ້",
    viewBusinessControls: "ເບິ່ງຮ້ານ, ເຈົ້າຂອງ, ແມ່ແບບທຸລະກິດ, ແຜນ, ສະຖານະ ແລະ ການຄວບຄຸມແພລດຟອມ.",
  },
};

export type AdminCopyKey = keyof typeof adminCopy.en;

export function useAdminLocale() {
  const [locale, setLocale] = useState<"lo" | "en">("en");

  useEffect(() => {
    runDemoStorageMigrations();
    const stored = readStringFromStorage(LANGUAGE_KEY);
    const nextLocale = stored === "lo" || stored === "en" ? stored : "en";
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    setLocale(nextLocale);
  }, []);

  const updateLocale = useCallback((nextLocale: "lo" | "en") => {
    writeStringToStorage(LANGUAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    setLocale(nextLocale);
  }, []);

  return { copy: adminCopy[locale], locale, updateLocale };
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
        className={cn("px-1.5 transition", locale === "lo" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("lo")}
      >
        LAO
      </button>
      <span className="text-muted-foreground">|</span>
      <button
        className={cn("px-1.5 transition", locale === "en" ? "text-primary" : "text-muted-foreground hover:text-foreground")}
        type="button"
        onClick={() => updateLocale("en")}
      >
        ENG
      </button>
    </div>
  );
}
