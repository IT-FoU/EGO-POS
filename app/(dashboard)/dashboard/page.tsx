import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { DashboardAlertsLoader } from "@/features/dashboard/components/dashboard-alerts-loader";
import {
  DashboardAlertsFallback,
  DashboardInteractionsClient,
} from "@/features/dashboard/components/dashboard-interactions-client";
import {
  getMiniMartDashboardCriticalSnapshot,
  shouldRouteToPos,
  type DashboardDateRange,
  type DashboardRangeKey,
} from "@/features/dashboard/dashboard-service";
import { requireSession } from "@/lib/auth/session";
import { getDashboardCopy } from "@/lib/i18n/dashboard-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

const rangeKeys = new Set<DashboardRangeKey>(["custom", "month", "today", "week", "year"]);

function dateInputValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseLocalDateParam(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function parseDateRange(params: Record<string, string | string[] | undefined>): DashboardDateRange {
  const requestedRange = typeof params.range === "string" ? params.range : "today";
  const key = rangeKeys.has(requestedRange as DashboardRangeKey)
    ? (requestedRange as DashboardRangeKey)
    : "today";
  const start = typeof params.start === "string" ? parseLocalDateParam(params.start) : undefined;
  const end = typeof params.end === "string" ? parseLocalDateParam(params.end) : undefined;

  return {
    end: end && Number.isFinite(end.getTime()) ? end : undefined,
    key,
    start: start && Number.isFinite(start.getTime()) ? start : undefined,
  };
}

function canSessionViewProfit(roles: string[] = []) {
  const normalized = roles.map((role) => role.toLowerCase());
  return !normalized.some((role) => ["cashier", "staff"].includes(role));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  if (shouldRouteToPos(session.user.roles ?? [])) {
    redirect("/pos");
  }

  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value, session.user.locale);
  const copy = getDashboardCopy(locale);
  const params = await searchParams;
  const dateRange = parseDateRange(params);
  const snapshot = await getMiniMartDashboardCriticalSnapshot(dateRange);
  const periodStart = new Date(snapshot.period.start);
  const periodEnd = new Date(snapshot.period.end);
  const customStart = dateRange.start ? dateInputValue(dateRange.start) : dateInputValue(periodStart);
  const customEnd = dateRange.end ? dateInputValue(dateRange.end) : dateInputValue(new Date(periodEnd.getTime() - 1));

  return (
    <DashboardInteractionsClient
      alertsSlot={
        <Suspense fallback={<DashboardAlertsFallback copy={copy} />}>
          <DashboardAlertsLoader
            copy={copy}
            dateRange={dateRange}
            salesTodayLak={snapshot.cards.salesTodayLak}
            shiftSummaries={snapshot.closeDay.shiftSummaries}
          />
        </Suspense>
      }
      canViewProfit={canSessionViewProfit(session.user.roles ?? [])}
      copy={copy}
      customEnd={customEnd}
      customStart={customStart}
      snapshot={snapshot}
      storeName={session.user.activeCompanyName ?? copy.businessFallback}
    />
  );
}
