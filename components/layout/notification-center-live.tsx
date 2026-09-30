"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CalendarClock, CreditCard, PackageCheck, PackageX, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillPosCopy, tPos } from "@/lib/i18n/pos-copy";
import type { NotificationCategory, NotificationItem } from "@/features/notifications/notification-types";

const iconByCategory = {
  low_stock: PackageCheck,
  near_expiry: CalendarClock,
  out_of_stock: PackageX,
  membership_expiring: CreditCard,
  promotion_starting: Percent,
  promotion_ending: Percent,
} satisfies Record<NotificationCategory, typeof PackageCheck>;

const itemClass = "border-warning/40 bg-warning/10 text-warning";

export function NotificationCenterLive({ locale: localeProp }: { locale?: string }) {
  const locale = useAppLocale(localeProp);
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/notifications", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload: { items?: NotificationItem[] }) => {
        setNotifications(Array.isArray(payload.items) ? payload.items : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setNotifications([]);
      });
    return () => controller.abort();
  }, []);

  const title = tPos("ui.notifications", locale);
  const count = notifications.length;

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label={title}
        className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <Bell className="size-5" aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-xs font-bold text-white">
            {count}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-12 z-50 w-[min(92vw,420px)] overflow-hidden rounded-md border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="font-semibold">{title}</div>
            <div className="rounded-md bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{count}</div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {notifications.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">{tPos("ui.notification.empty", locale)}</div>
            ) : (
              notifications.map((notification) => {
                const Icon = iconByCategory[notification.category];
                const content = (
                  <div className="flex gap-3 rounded-md p-3 transition hover:bg-background">
                    <div className={cn("grid size-10 shrink-0 place-items-center rounded-md border", itemClass)}>
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {tPos(`ui.notification.category.${notification.category}`, locale)}
                      </div>
                      <div className="mt-1 font-semibold">
                        {tPos(`ui.notification.title.${notification.category}`, locale)}
                      </div>
                      <p className="mt-1 text-sm leading-5 text-muted-foreground">
                        {fillPosCopy(tPos(`ui.notification.message.${notification.category}`, locale), {
                          days: notification.daysRemaining ?? 0,
                          name: notification.entityName ?? "",
                        })}
                      </p>
                    </div>
                  </div>
                );
                return (
                  <Link href={notification.href} key={notification.id} onClick={() => setIsOpen(false)}>
                    {content}
                  </Link>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
