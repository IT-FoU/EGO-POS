"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, UserRoundSearch, UsersRound } from "lucide-react";
import type {
  CustomerInsightRow,
  CustomerInsightSummary,
  MembershipInsightSummary,
} from "@/features/dashboard/dashboard-member-customer-analytics";
import type {
  DashboardMemberCustomerSnapshot,
  InsightDataStatus,
} from "@/features/dashboard/dashboard-member-customer-service";
import { formatBusinessDateLabel } from "@/lib/datetime/business-timezone";
import { getDashboardCopy, type DashboardCopy } from "@/lib/i18n/dashboard-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

const dashboardDisplayClass =
  "transition duration-150 hover:border-primary hover:shadow-sm";
const dashboardLinkClass =
  "cursor-pointer transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function InsightError({ copy }: { copy: DashboardCopy }) {
  return (
    <div className={`${dashboardDisplayClass} mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive`}>
      {copy.dashboardUnavailable}
    </div>
  );
}

function Metric({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`${dashboardDisplayClass} min-w-0 rounded-md border border-border bg-muted/20 p-3`}>
      <p className="text-xs font-medium leading-5 text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</p>
      {helper ? <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function SectionHeading({
  copy,
  href,
  icon: Icon,
  note,
  title,
}: {
  copy: DashboardCopy;
  href?: string;
  icon: typeof UsersRound;
  note: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
      </div>
      {href ? (
        <Link
          className={`${dashboardLinkClass} inline-flex min-h-10 items-center gap-1 rounded-md px-3 text-sm font-medium text-primary outline-none hover:bg-primary/10 hover:text-foreground`}
          href={href}
        >
          {copy.viewDetails}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

function MembershipSection({
  copy,
  dataStatus,
  linkMembership,
  summary,
}: {
  copy: DashboardCopy;
  dataStatus: InsightDataStatus;
  linkMembership: boolean;
  summary: MembershipInsightSummary;
}) {
  return (
    <section className={`${dashboardDisplayClass} min-w-0 rounded-lg border border-primary/30 bg-card p-5`}>
      <SectionHeading
        copy={copy}
        href={linkMembership ? "/membership-levels" : undefined}
        icon={UsersRound}
        note={copy.membershipScopeNote}
        title={copy.membershipInsights}
      />
      {dataStatus.hasError ? (
        <InsightError copy={copy} />
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Metric label={copy.activePaidMembers} value={formatNumber(summary.activePaidMembers)} />
            <Metric
              helper={copy.newPaidMembersDeferred}
              label={copy.newPaidMembersToday}
              value={copy.unavailable}
            />
            <Metric
              helper={copy.membershipRevenueDeferred}
              label={copy.membershipRevenue}
              value={copy.unavailable}
            />
            <Metric label={copy.expiringSoon} value={formatNumber(summary.expiringSoon)} />
            <Metric label={copy.age18AndUnder} value={formatNumber(summary.age18AndUnder)} />
            <Metric label={copy.age19Plus} value={formatNumber(summary.age19Plus)} />
            <Metric label={copy.unknownAge} value={formatNumber(summary.unknownAge)} />
          </div>
          {summary.activePaidMembers === 0 ? (
            <p className={`${dashboardDisplayClass} mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground`}>
              {copy.noActiveMembers}
            </p>
          ) : null}
          <div className="mt-5">
            <div className="flex items-center gap-2">
              <CalendarClock aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{copy.membershipExpiringList}</h3>
            </div>
            {summary.expiringMembers.length === 0 ? (
              <p className={`${dashboardDisplayClass} mt-3 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground`}>
                {copy.noMembershipsExpiring}
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-md border border-border">
                {summary.expiringMembers.map((member) => (
                  <li
                    className="grid min-w-0 gap-1 p-3 transition duration-150 hover:bg-primary/5 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] sm:items-center sm:gap-3"
                    key={member.customerId}
                  >
                    <span className="truncate text-sm font-medium">{member.customerName}</span>
                    <span className="truncate text-xs text-muted-foreground">{member.planName}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatBusinessDateLabel(member.endDate)} · {member.daysRemaining} {copy.daysRemaining}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function behaviorLabel(row: CustomerInsightRow, copy: DashboardCopy) {
  if (row.frequent && row.highValue) return copy.frequentAndHighValue;
  if (row.frequent) return copy.frequent;
  return copy.highValue;
}

function CustomerList({
  copy,
  emptyLabel,
  rows,
  title,
}: {
  copy: DashboardCopy;
  emptyLabel: string;
  rows: CustomerInsightRow[];
  title: string;
}) {
  return (
    <div className={`${dashboardDisplayClass} min-w-0 rounded-md border border-border`}>
      <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ol className="divide-y divide-border">
          {rows.map((row, index) => (
            <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 transition duration-150 hover:bg-primary/5" key={row.customerId}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{row.customerName}</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {behaviorLabel(row, copy)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{copy.visitsBills}: {formatNumber(row.billCount)}</span>
                  <span>{copy.netSpend}: {formatNumber(row.netSpendLak)} LAK</span>
                  <span>{copy.lastPurchase}: {formatBusinessDateLabel(row.lastPurchase)}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function CustomerSection({
  copy,
  dataStatus,
  linkCustomers,
  summary,
}: {
  copy: DashboardCopy;
  dataStatus: InsightDataStatus;
  linkCustomers: boolean;
  summary: CustomerInsightSummary;
}) {
  return (
    <section className={`${dashboardDisplayClass} min-w-0 rounded-lg border border-border bg-card p-5`}>
      <SectionHeading
        copy={copy}
        href={linkCustomers ? "/customers" : undefined}
        icon={UserRoundSearch}
        note={copy.trailing90Days}
        title={copy.customerInsights}
      />
      {dataStatus.hasError ? (
        <InsightError copy={copy} />
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label={copy.totalCustomers} value={formatNumber(summary.totalCustomers)} />
            <Metric label={copy.newCustomersToday} value={formatNumber(summary.newCustomersToday)} />
            <Metric label={copy.frequentCustomers} value={formatNumber(summary.frequentCount)} />
            <Metric label={copy.highValueCustomers} value={formatNumber(summary.highValueCount)} />
          </div>
          {summary.totalCustomers === 0 ? (
            <p className={`${dashboardDisplayClass} mt-4 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground`}>
              {copy.noCustomers}
            </p>
          ) : null}
          <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
            <CustomerList
              copy={copy}
              emptyLabel={copy.noFrequentCustomers}
              rows={summary.frequentCustomers}
              title={copy.frequentCustomers}
            />
            <CustomerList
              copy={copy}
              emptyLabel={copy.noHighValueCustomers}
              rows={summary.highValueCustomers}
              title={copy.highValueCustomers}
            />
          </div>
        </>
      )}
    </section>
  );
}

export function DashboardMemberCustomerPanel({
  linkCustomers = true,
  linkMembership = true,
  snapshot,
}: {
  linkCustomers?: boolean;
  linkMembership?: boolean;
  snapshot: DashboardMemberCustomerSnapshot;
}) {
  const copy = getDashboardCopy(useAppLocale());
  return (
    <div className="grid min-w-0 gap-5">
      <MembershipSection
        copy={copy}
        dataStatus={snapshot.membershipDataStatus}
        linkMembership={linkMembership}
        summary={snapshot.membership}
      />
      <CustomerSection copy={copy} dataStatus={snapshot.customerDataStatus} linkCustomers={linkCustomers} summary={snapshot.customer} />
    </div>
  );
}
