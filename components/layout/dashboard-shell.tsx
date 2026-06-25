"use client";

import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BadgePercent,
  Boxes,
  Building2,
  Gift,
  LayoutDashboard,
  Lock,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Users,
} from "lucide-react";
import { NotificationCenter } from "@/components/layout/notification-center";
import { CustomerDisplayToggle } from "@/components/layout/customer-display-toggle";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { FullScreenToggle } from "@/components/layout/full-screen-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { LogoContainer } from "@/components/brand/logo-container";
import { APP_NAME, DEFAULT_LOCALE, SLOGAN } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants";
import { LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";

const navigation = [
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, locked: false },
  { key: "pos", href: "/pos", icon: ShoppingCart, locked: false },
  { key: "products", href: "/products", icon: Package, locked: false },
  { key: "inventory", href: "/inventory", icon: Boxes, locked: false },
  { key: "purchasing", href: "/purchasing", icon: Truck, locked: true },
  { key: "customers", href: "/customers", icon: Users, locked: false },
  { key: "membership", href: "/membership-levels", icon: BadgePercent, locked: true },
  { key: "suppliers", href: "/suppliers", icon: Building2, locked: true },
  { key: "promotions", href: "/promotions", icon: Gift, locked: true },
  { key: "reports", href: "/reports", icon: BarChart3, locked: false },
  { key: "settings", href: "/settings", icon: Settings, locked: true },
];

type NavigationKey = (typeof navigation)[number]["key"];

const shellCopy: Record<"lo" | "en", {
  daysLeft: string;
  freePlan: string;
  lockedFeature: string;
  nav: Record<NavigationKey, string>;
}> = {
  en: {
    daysLeft: "Days Left",
    freePlan: "Free Plan",
    lockedFeature: "Paid feature locked",
    nav: {
      customers: "Customers",
      dashboard: "Dashboard",
      inventory: "Inventory",
      membership: "Membership",
      pos: "POS",
      products: "Products",
      promotions: "Promotions",
      purchasing: "Purchasing",
      reports: "Reports",
      settings: "Settings",
      suppliers: "Suppliers",
    },
  },
  lo: {
    daysLeft: "ມື້ທີ່ເຫຼືອ",
    freePlan: "ແຜນຟຣີ",
    lockedFeature: "ຟີເຈີແຜນຈ່າຍເງິນຖືກລັອກ",
    nav: {
      customers: "ລູກຄ້າ",
      dashboard: "Dashboard",
      inventory: "ສາງສິນຄ້າ",
      membership: "Membership",
      pos: "POS",
      products: "ສິນຄ້າ",
      promotions: "Promotion",
      purchasing: "ຈັດຊື້",
      reports: "Report",
      settings: "ຕັ້ງຄ່າ",
      suppliers: "ຜູ້ສະໜອງ",
    },
  },
};

export function DashboardShell({
  children,
  demoMode: _demoMode,
  session,
}: {
  children: React.ReactNode;
  demoMode: boolean;
  session: Session;
}) {
  const pathname = usePathname();
  const [storeName, setStoreName] = useState(
    normalizeStoreName(session.user.activeCompanyName ?? "Business"),
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [planName, setPlanName] = useState("Free Plan");
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [locale, setLocale] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocale(readClientLocale(session.user.locale));
  }, [session.user.locale]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
      if (detail?.locale === "en" || detail?.locale === "lo") {
        setLocale(detail.locale);
      }
    }

    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  useEffect(() => {
    if (session.user.activeCompanyName) {
      setStoreName(normalizeStoreName(session.user.activeCompanyName));
    }
    setLogoUrl(null);
    setPlanName("Free Plan");
    setDaysLeft(null);
  }, [session.user.activeCompanyName]);

  const showDaysLeft = planName.toLowerCase() !== "free plan" && daysLeft !== null;
  const copy = shellCopy[locale];
  const displayPlanName = planName.toLowerCase() === "free plan" ? copy.freePlan : planName;

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-3">
            <LogoContainer logoUrl={logoUrl} size={56} />
            <div>
              <div className="text-lg font-semibold">{APP_NAME}</div>
              <div className="text-xs text-muted-foreground">{SLOGAN}</div>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href !== "#" && pathname.startsWith(item.href);

            return (
              <Link
                className={
                  isActive
                    ? "flex items-center gap-3 rounded-md bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground"
                    : "flex items-center gap-3 rounded-md px-3 py-3 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground"
                }
                href={item.href}
                key={item.key}
              >
                <Icon aria-hidden="true" />
                <span className="min-w-0 flex-1">{copy.nav[item.key]}</span>
                {item.locked ? <Lock className="size-4" aria-label={copy.lockedFeature} /> : null}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0 lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-base font-semibold">
                <span className="min-w-0 truncate">{storeName}</span>
                <span className="text-muted-foreground">|</span>
                <span>{displayPlanName}</span>
                {showDaysLeft ? (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span className="text-muted-foreground">{daysLeft} {copy.daysLeft}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <NotificationCenter locale={locale} />
              <CustomerDisplayToggle />
              <FullScreenToggle locale={locale} />
              <LanguageToggle locale={locale} onLocaleChange={setLocale} />
              <ThemeToggle />
              <SignOutButton />
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
            {navigation
              .filter((item) => item.href !== "#")
              .map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    className={
                      isActive
                        ? "inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
                        : "inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground"
                    }
                    href={item.href}
                    key={item.key}
                  >
                    <Icon aria-hidden="true" />
                    {copy.nav[item.key]}
                    {item.locked ? <Lock className="size-3.5" aria-label={copy.lockedFeature} /> : null}
                  </Link>
                );
              })}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-none overflow-x-hidden px-4 py-6 md:px-6 2xl:max-w-7xl 2xl:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function normalizeStoreName(name: string) {
  return name.replace(/\s+(Mini Mart|Pharmacy|Restaurant|Coffee Shop|Beauty Salon|Clothing)\s*$/i, "").trim();
}
