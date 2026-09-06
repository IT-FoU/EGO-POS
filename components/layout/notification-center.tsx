"use client";

import { tPos } from "@/lib/i18n/pos-copy";
import { t } from "@/lib/i18n/ui";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, CreditCard, Info, PackageX, TrendingDown, Truck, } from "lucide-react";
import { cn } from "@/lib/utils";
type NotificationSeverity = "info" | "warning" | "critical";
type NotificationItem = {
    href?: string;
    message: string;
    severity: NotificationSeverity;
    title: string;
    type: string;
};
const labels = {
    en: {
        empty: "No urgent alerts",
        title: "Notifications",
    },
    lo: {
        empty: tPos("ui.no.urgent.alerts", "lo"),
        title: tPos("ui.notifications", "lo"),
    },
};
const severityClass: Record<NotificationSeverity, string> = {
    critical: "border-danger/40 bg-danger/10 text-danger",
    info: "border-primary/40 bg-primary/10 text-primary",
    warning: "border-warning/40 bg-warning/10 text-warning",
};
const iconByType = {
    cashDifference: AlertTriangle,
    credit: CreditCard,
    deadStock: PackageX,
    due: Truck,
    expired: PackageX,
    expiry: CalendarClock,
    lowStock: AlertTriangle,
    lowSales: TrendingDown,
    membershipExpired: CreditCard,
    subscriptionExpired: CalendarClock,
    system: Info,
};
export function NotificationCenter({ locale }: {
    locale?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const copy = locale === "lo" ? labels.lo : labels.en;
    const notifications = useMemo<NotificationItem[]>(() => [
        {
            href: "/inventory",
            message: t("ui.several.demo.items.are.below.minimum.stock.l"),
            severity: "warning",
            title: "Low Stock",
            type: "lowStock",
        },
        {
            href: "/inventory",
            message: t("ui.check.expiry.dates.for.products.due.soon"),
            severity: "warning",
            title: "Near Expiry",
            type: "expiry",
        },
        {
            href: "/inventory",
            message: t("ui.products.with.no.sales.activity.for.more.tha"),
            severity: "warning",
            title: "Dead Stock",
            type: "deadStock",
        },
        {
            href: "/dashboard",
            message: t("ui.cash.count.does.not.match.the.expected.drawe"),
            severity: "critical",
            title: "Cash Difference",
            type: "cashDifference",
        },
        {
            href: "/dashboard",
            message: t("ui.today.sales.are.lower.than.the.historical.av"),
            severity: "warning",
            title: "Low Sales",
            type: "lowSales",
        },
        {
            href: "/membership-levels",
            message: t("ui.some.customer.memberships.have.expired.and.n"),
            severity: "info",
            title: "Membership Expired",
            type: "membershipExpired",
        },
        {
            href: "/settings",
            message: t("ui.subscription.renewal.should.be.reviewed.befo"),
            severity: "warning",
            title: "Subscription Expired",
            type: "subscriptionExpired",
        },
        {
            href: "/inventory",
            message: t("ui.expired.stock.should.be.adjusted.out.before."),
            severity: "critical",
            title: "Expired products",
            type: "expired",
        },
        {
            href: "/purchasing/payables",
            message: t("ui.supplier.credit.reminders.are.ready.for.revi"),
            severity: "warning",
            title: "Supplier due reminder",
            type: "due",
        },
        {
            href: "/customers",
            message: t("ui.customer.credit.due.reminders.are.available"),
            severity: "info",
            title: "Customer credit due",
            type: "credit",
        },
        {
            href: "/settings",
            message: t("ui.demo.alerts.are.structured.for.future.databa"),
            severity: "info",
            title: "System alerts",
            type: "system",
        },
    ], []);
    const count = notifications.length;
    return (<div className="relative">
      <button aria-expanded={isOpen} aria-label={copy.title} className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground" type="button" onClick={() => setIsOpen((current) => !current)}>
        <Bell className="size-5" aria-hidden="true"/>
        {count > 0 ? (<span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white">
            {count}
          </span>) : null}
      </button>

      {isOpen ? (<div className="absolute right-0 top-12 z-50 w-[min(92vw,420px)] overflow-hidden rounded-md border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="font-semibold">{copy.title}</div>
            <div className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">
              {count}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {notifications.length === 0 ? (<div className="p-4 text-sm text-muted-foreground">{copy.empty}</div>) : (notifications.map((notification) => {
                const Icon = iconByType[notification.type as keyof typeof iconByType] ?? Info;
                const content = (<div className="flex gap-3 rounded-md p-3 transition hover:bg-background">
                    <div className={cn("grid size-10 shrink-0 place-items-center rounded-md border", severityClass[notification.severity])}>
                      <Icon className="size-5" aria-hidden="true"/>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {notification.type}
                        </span>
                        <span className={cn("rounded-md border px-2 py-0.5 text-xs font-semibold", severityClass[notification.severity])}>
                          {notification.severity}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold">{notification.title}</div>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                  </div>);
                return notification.href ? (<Link href={notification.href} key={notification.title} onClick={() => setIsOpen(false)}>
                    {content}
                  </Link>) : (<div key={notification.title}>{content}</div>);
            }))}
          </div>
        </div>) : null}
    </div>);
}
