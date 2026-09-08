"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Cake, CreditCard, Download, Eye, Gem, Gift, Plus, Search, Star, Tags, TrendingUp, Upload, Users, WalletCards } from "lucide-react";
import type { Customer, CustomerPayment, CustomerPurchase, CustomerStatus } from "@/features/customers/types";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import { MembershipBadge } from "@/features/customers/components/membership-badge";
import { calculateAvailablePoints, formatLak } from "@/features/customers/format";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { canUseStoreAction } from "@/features/permissions/store-ui-permissions";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import {
  customerSegmentLabel,
  customerStatusLabel,
  fillCustomersCopy,
  formatCustomerDisplayDate,
  tCustomers,
} from "@/lib/i18n/customers-copy";
import { cn } from "@/lib/utils";

const statusOptions: Array<CustomerStatus | "all"> = ["all", "active", "inactive"];
type Segment = "all" | "new" | "regular" | "vip" | "inactive" | "lost";
type CustomerInsightKey = "active" | "birthday" | "debt" | "lost" | "new" | "outstanding" | "points" | "top" | "vip";
type CustomerModal = {
  type: "customers";
  key: CustomerInsightKey;
  title: string;
} | {
  type: "import";
} | {
  type: "export";
} | null;
type CustomerInsight = Customer & {
  availablePoints: number;
  creditBalanceLak: number;
  favoriteCategories: string[];
  favoriteProducts: string[];
  lastPurchaseDate?: string;
  lifetimeSpendingLak: number;
  segment: Segment;
  totalVisits: number;
};
const segmentOptions: Segment[] = ["all", "new", "regular", "vip", "inactive", "lost"];
const currentMonth = "2026-06";

const insightTitleKeys: Record<CustomerInsightKey, string> = {
  active: "activeCustomers",
  birthday: "birthdayThisMonthTitle",
  debt: "customersWithDebt",
  lost: "lostCustomers",
  new: "newCustomersThisMonth",
  outstanding: "outstandingBalanceCustomers",
  points: "customersWithPoints",
  top: "topCustomers",
  vip: "vipCustomers",
};

const categoryLabelKeys: Record<string, string> = {
  Drinks: "categoryDrinks",
  Household: "categoryHousehold",
  Snacks: "categorySnacks",
};

export function CustomersListClient({
  customers,
  locale: localeProp,
  payments,
  purchases,
  storeRoles,
}: {
  customers: Customer[];
  locale?: SupportedLocale;
  payments: CustomerPayment[];
  purchases: CustomerPurchase[];
  storeRoles?: string[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "all">("all");
  const [segment, setSegment] = useState<Segment>("all");
  const [message, setMessage] = useState<string | null>(null);
  const [modal, setModal] = useState<CustomerModal>(null);
  const locale = useAppLocale(localeProp);
  const t = (key: string) => tCustomers(key, locale);
  const canManageCredit = canUseStoreAction(storeRoles, STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE);

  const customerInsights = useMemo(() => {
    return customers.map((customer) => {
      const customerPurchases = purchases.filter((purchase) => purchase.customerId === customer.id);
      const lastPurchase = [...customerPurchases].sort((left, right) => right.saleDate.localeCompare(left.saleDate))[0];
      const availablePoints = calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints);
      const totalVisits = customerPurchases.length || Math.max(1, Math.round(customer.totalPurchasesLak / 2500000));
      const segmentName = getCustomerSegment(customer, lastPurchase?.saleDate);
      return {
        ...customer,
        availablePoints,
        creditBalanceLak: customer.outstandingBalanceLak,
        favoriteCategories: getFavoriteCategories(customer),
        favoriteProducts: getFavoriteProducts(customer),
        lastPurchaseDate: lastPurchase?.saleDate,
        lifetimeSpendingLak: customer.totalPurchasesLak,
        segment: segmentName,
        totalVisits,
      };
    });
  }, [customers, purchases]);

  const filteredCustomers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return customerInsights.filter((customer) => {
      const matchesQuery = normalizedQuery.length === 0 ||
        [
          customer.customerCode,
          customer.fullName,
          customer.phone,
          customer.email,
          customer.membershipLevel,
          customer.segment,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesStatus = status === "all" || customer.status === status;
      const matchesSegment = segment === "all" || customer.segment === segment;
      return matchesQuery && matchesStatus && matchesSegment;
    });
  }, [customerInsights, query, segment, status]);

  const activeCustomers = customers.filter((customer) => customer.status === "active").length;
  const totalOutstanding = customers.reduce((total, customer) => total + customer.outstandingBalanceLak, 0);
  const totalPoints = customers.reduce((total, customer) => total + calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints), 0);
  const newCustomersThisMonth = customers.filter((customer) => customer.customerCode.endsWith("1") || customer.customerCode.endsWith("2")).length;
  const vipCustomers = customerInsights.filter((customer) => customer.segment === "vip").length;
  const customersWithDebt = customers.filter((customer) => customer.outstandingBalanceLak > 0).length;
  const lostCustomers = customerInsights.filter((customer) => customer.segment === "lost").length;
  const birthdayThisMonth = customers.filter((customer) => customer.birthday.slice(5, 7) === currentMonth.slice(5, 7)).length;
  const topCustomers = [...customerInsights].sort((left, right) => right.lifetimeSpendingLak - left.lifetimeSpendingLak).slice(0, 5);
  const birthdayCustomers = customerInsights.filter((customer) => customer.birthday.slice(5, 7) === currentMonth.slice(5, 7));
  const totalPayments = payments.reduce((total, payment) => total + payment.amountLak, 0);
  const overdueBalance = customers.reduce((total, customer) => total + getOverdueBalance(customer), 0);
  const categoryBreakdown = [
    { label: "Drinks", value: 45 },
    { label: "Snacks", value: 35 },
    { label: "Household", value: 20 },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {modal ? (
        <CustomerPopup
          canManageCredit={canManageCredit}
          customers={getInsightCustomers(modal, customerInsights)}
          locale={locale}
          modal={modal}
          onClose={() => setModal(null)}
        />
      ) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">{t("customerManagement")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("customers")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("customersSubtitle")}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setModal({ type: "import" })}>
              <Upload aria-hidden="true" />
              {t("importCustomers")}
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setModal({ type: "export" })}>
              <Download aria-hidden="true" />
              {t("exportCustomers")}
            </button>
            <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/customers/new">
              <Plus aria-hidden="true" />
              {t("createCustomer")}
            </Link>
          </div>
        </div>
      </section>

      {message ? (
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          {message}
          <button className="ml-3 underline" type="button" onClick={() => setMessage(null)}>
            {t("dismiss")}
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Users} label={t("activeCustomers")} locale={locale} value={String(activeCustomers)} accent="blue" onClick={() => setModal({ key: "active", title: t("activeCustomers"), type: "customers" })} />
        <Metric icon={Gift} label={t("availablePoints")} locale={locale} value={formatLak(totalPoints)} accent="purple" onClick={() => setModal({ key: "points", title: t("customersWithPoints"), type: "customers" })} />
        {canManageCredit ? <Metric icon={WalletCards} label={t("outstandingBalance")} locale={locale} value={`${formatLak(totalOutstanding)} LAK`} accent="red" onClick={() => setModal({ key: "outstanding", title: t("outstandingBalanceCustomers"), type: "customers" })} /> : null}
        <Metric icon={Plus} label={t("newCustomersThisMonth")} locale={locale} value={String(newCustomersThisMonth)} accent="green" onClick={() => setModal({ key: "new", title: t("newCustomersThisMonth"), type: "customers" })} />
        <Metric icon={Gem} label={t("vipCustomers")} locale={locale} value={String(vipCustomers)} accent="yellow" onClick={() => setModal({ key: "vip", title: t("vipCustomers"), type: "customers" })} />
        {canManageCredit ? <Metric icon={CreditCard} label={t("customersWithDebt")} locale={locale} value={String(customersWithDebt)} accent="orange" onClick={() => setModal({ key: "debt", title: t("customersWithDebt"), type: "customers" })} /> : null}
        <Metric icon={Cake} label={t("birthdayThisMonth")} locale={locale} value={String(birthdayThisMonth)} accent="cyan" onClick={() => setModal({ key: "birthday", title: t("birthdayThisMonthTitle"), type: "customers" })} />
        <Metric icon={TrendingUp} label={t("topCustomers")} locale={locale} value={String(topCustomers.length)} accent="blue" onClick={() => setModal({ key: "top", title: t("topCustomers"), type: "customers" })} />
        <Metric icon={Users} label={t("lostCustomers")} locale={locale} value={String(lostCustomers)} accent="gray" onClick={() => setModal({ key: "lost", title: t("lostCustomers"), type: "customers" })} />
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row">
                <label className="relative flex-1">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input aria-label={t("searchCustomers")} className="field-input pl-10" placeholder={t("searchCustomers")} value={query} onChange={(event) => setQuery(event.target.value)} />
                </label>
                <select className="field-input md:w-44" value={status} onChange={(event) => setStatus(event.target.value as CustomerStatus | "all")} aria-label={t("filterByStatus")}>
                  {statusOptions.map((option) => (
                    <option value={option} key={option}>
                      {option === "all" ? t("allStatuses") : customerStatusLabel(option, locale)}
                    </option>
                  ))}
                </select>
                <select className="field-input md:w-44" value={segment} onChange={(event) => setSegment(event.target.value as Segment)} aria-label={t("filterBySegment")}>
                  {segmentOptions.map((option) => (
                    <option value={option} key={option}>
                      {option === "all" ? t("allSegments") : customerSegmentLabel(option, locale)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[1240px] border-collapse text-left text-sm">
                <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">{t("customerCode")}</th>
                    <th className="px-4 py-3 font-semibold">{t("name")}</th>
                    <th className="px-4 py-3 font-semibold">{t("phone")}</th>
                    <th className="px-4 py-3 font-semibold">{t("membership")}</th>
                    <th className="px-4 py-3 font-semibold">{t("segment")}</th>
                    <th className="px-4 py-3 font-semibold">{t("lastPurchaseDate")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("lifetimeSpending")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("totalVisits")}</th>
                    {canManageCredit ? <th className="px-4 py-3 text-right font-semibold">{t("creditBalance")}</th> : null}
                    <th className="px-4 py-3 text-right font-semibold">{t("points")}</th>
                    <th className="px-4 py-3 font-semibold">{t("status")}</th>
                    <th className="px-4 py-3 text-right font-semibold">{t("action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr className="border-b border-border last:border-b-0" key={customer.id}>
                      <td className="px-4 py-4 font-mono text-xs">{customer.customerCode}</td>
                      <td className="px-4 py-4">
                        <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={`/customers/${customer.id}`}>
                          {customer.fullName}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">{customer.email}</div>
                      </td>
                      <td className="px-4 py-4">{customer.phone}</td>
                      <td className="px-4 py-4">
                        <MembershipBadge level={customer.membershipLevel} locale={locale} />
                      </td>
                      <td className="px-4 py-4">
                        <SegmentBadge locale={locale} segment={customer.segment} />
                      </td>
                      <td className="px-4 py-4">{formatCustomerDisplayDate(customer.lastPurchaseDate, locale)}</td>
                      <td className="px-4 py-4 text-right font-semibold">{formatLak(customer.lifetimeSpendingLak)} LAK</td>
                      <td className="px-4 py-4 text-right font-semibold">{formatLak(customer.totalVisits)}</td>
                      {canManageCredit ? <td className="px-4 py-4 text-right font-semibold">{formatLak(customer.creditBalanceLak)} LAK</td> : null}
                      <td className="px-4 py-4 text-right font-semibold">{formatLak(customer.availablePoints)}</td>
                      <td className="px-4 py-4">
                        <CustomerStatusBadge locale={locale} status={customer.status} />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" href={`/customers/${customer.id}`}>
                          <Eye aria-hidden="true" />
                          {t("view")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">{t("noCustomersMatch")}</div>
            ) : null}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Panel title={t("topCustomers")} icon={Star}>
            <div className="flex flex-col gap-3">
              {topCustomers.map((customer, index) => (
                <Link className="rounded-md border border-border bg-background p-3 transition hover:border-primary" href={`/customers/${customer.id}`} key={customer.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{index + 1}. {customer.fullName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{fillCustomersCopy(t("visitsCount"), { count: customer.totalVisits })}</div>
                    </div>
                    <div className="text-right text-sm font-semibold">{formatLak(customer.lifetimeSpendingLak)} LAK</div>
                  </div>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title={t("birthdayCustomers")} icon={Cake}>
            <div className="flex flex-col gap-3">
              {birthdayCustomers.length === 0 ? (
                <p className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">{t("noBirthdaysThisMonth")}</p>
              ) : (
                birthdayCustomers.map((customer) => (
                  <Link className="rounded-md border border-border bg-background p-3 transition hover:border-primary" href={`/customers/${customer.id}`} key={customer.id}>
                    <div className="font-semibold">{customer.fullName}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{formatCustomerDisplayDate(customer.birthday, locale)}</div>
                  </Link>
                ))
              )}
            </div>
          </Panel>
        </aside>

        <Panel title={t("customerAnalytics")} icon={Tags} className="h-full">
          <div className="grid h-full gap-4 text-sm md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="text-xs font-semibold text-muted-foreground">{t("categoryBreakdown")}</div>
              <div className="mt-4 grid gap-4">
                {categoryBreakdown.map((item) => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold">{t(categoryLabelKeys[item.label] ?? item.label)}</span>
                      <span className="text-muted-foreground">{item.value}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              <Summary label={t("favoriteProducts")} value={t("favoriteProductsSample")} />
              <p className="rounded-md border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">{t("analyticsHint")}</p>
            </div>
          </div>
        </Panel>

        {canManageCredit ? (
          <Panel title={t("customerCreditDetail")} icon={CreditCard} className="h-full">
            <dl className="grid h-full gap-3 text-sm">
              <Summary label={t("outstanding")} value={`${formatLak(totalOutstanding)} LAK`} tone="warning" />
              <Summary label={t("overdue")} value={`${formatLak(overdueBalance)} LAK`} tone="danger" />
              <Summary label={t("paymentsRecorded")} value={`${formatLak(totalPayments)} LAK`} />
              <Summary label={t("customersWithDebt")} value={String(customersWithDebt)} tone="warning" />
            </dl>
          </Panel>
        ) : null}
      </section>
    </div>
  );
}

function CustomerPopup({
  canManageCredit,
  customers,
  locale,
  modal,
  onClose,
}: {
  canManageCredit: boolean;
  customers: CustomerInsight[];
  locale: SupportedLocale;
  modal: NonNullable<CustomerModal>;
  onClose: () => void;
}) {
  const t = (key: string) => tCustomers(key, locale);
  const title = modal.type === "customers"
    ? t(insightTitleKeys[modal.key])
    : modal.type === "import"
      ? t("importCustomers")
      : t("exportCustomers");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {modal.type === "customers"
                ? fillCustomersCopy(t("customersFound"), { count: customers.length })
                : t("csvExcelPlaceholder")}
            </p>
          </div>
          <button aria-label={t("close")} className="h-9 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>

        {modal.type === "import" ? (
          <div className="grid gap-4 p-5">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="font-semibold">{t("importWorkflow")}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("importHint")}</p>
            </div>
            <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">
              {t("selectCsvExcel")}
            </button>
          </div>
        ) : null}

        {modal.type === "export" ? (
          <div className="grid gap-4 p-5">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="font-semibold">{t("exportWorkflow")}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("exportHint")}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">
                {t("exportCsv")}
              </button>
              <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button">
                {t("exportExcel")}
              </button>
            </div>
          </div>
        ) : null}

        {modal.type === "customers" ? (
          <div className="max-h-[62vh] overflow-y-auto p-5">
            {customers.length === 0 ? (
              <div className="rounded-md border border-border bg-background p-6 text-center text-sm text-muted-foreground">{t("noCustomersForCard")}</div>
            ) : (
              <div className="grid gap-3">
                {customers.map((customer) => (
                  <Link className="rounded-md border border-border bg-background p-4 transition hover:border-primary" href={`/customers/${customer.id}`} key={customer.id} onClick={onClose}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold text-primary">{customer.fullName}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{customer.customerCode}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{customer.phone}</div>
                      </div>
                      <div className="grid gap-1 text-sm sm:text-right">
                        <span>{fillCustomersCopy(t("lakSpent"), { amount: formatLak(customer.lifetimeSpendingLak) })}</span>
                        <span>{fillCustomersCopy(t("pointsAmount"), { amount: formatLak(customer.availablePoints) })}</span>
                        {canManageCredit ? <span>{fillCustomersCopy(t("lakCredit"), { amount: formatLak(customer.creditBalanceLak) })}</span> : null}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getInsightCustomers(modal: CustomerModal, customers: CustomerInsight[]) {
  if (!modal || modal.type !== "customers")
    return [];
  if (modal.key === "active")
    return customers.filter((customer) => customer.status === "active");
  if (modal.key === "birthday")
    return customers.filter((customer) => customer.birthday.slice(5, 7) === currentMonth.slice(5, 7));
  if (modal.key === "debt")
    return customers.filter((customer) => customer.outstandingBalanceLak > 0);
  if (modal.key === "lost")
    return customers.filter((customer) => customer.segment === "lost");
  if (modal.key === "new")
    return customers.filter((customer) => customer.customerCode.endsWith("1") || customer.customerCode.endsWith("2"));
  if (modal.key === "outstanding")
    return customers.filter((customer) => customer.outstandingBalanceLak > 0);
  if (modal.key === "points")
    return customers.filter((customer) => customer.availablePoints > 0);
  if (modal.key === "top")
    return [...customers].sort((left, right) => right.lifetimeSpendingLak - left.lifetimeSpendingLak).slice(0, 10);
  if (modal.key === "vip")
    return customers.filter((customer) => customer.segment === "vip");
  return customers;
}

function Metric({
  accent,
  icon: Icon,
  label,
  locale,
  onClick,
  value,
}: {
  accent: "blue" | "cyan" | "gray" | "green" | "orange" | "purple" | "red" | "yellow";
  icon: typeof Users;
  label: string;
  locale: SupportedLocale;
  onClick?: () => void;
  value: string;
}) {
  const styles = {
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    cyan: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
    gray: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    orange: "border-orange-500/30 bg-orange-500/10 text-orange-300",
    purple: "border-purple-500/30 bg-purple-500/10 text-purple-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    yellow: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  }[accent];
  return (
    <button className="min-w-0 rounded-lg border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={onClick}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
          <div className="mt-2 text-xs font-semibold text-primary">{tCustomers("viewList", locale)}</div>
        </div>
        <div className={cn("grid size-11 shrink-0 place-items-center rounded-md border", styles)}>
          <Icon aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

function Panel({
  children,
  className,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  icon: typeof Users;
  title: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-border bg-card p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Summary({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "danger" | "warning";
  value: string;
}) {
  const toneClass = tone === "danger" ? "text-red-300" : tone === "warning" ? "text-orange-300" : "";
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 break-words font-semibold", toneClass)}>{value}</dd>
    </div>
  );
}

function SegmentBadge({
  locale,
  segment,
}: {
  locale: SupportedLocale;
  segment: Segment;
}) {
  const className = segment === "vip"
    ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-300"
    : segment === "inactive" || segment === "lost"
      ? "border-muted-foreground/30 bg-muted text-muted-foreground"
      : segment === "new"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span className={cn("inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold", className)}>
      {customerSegmentLabel(segment, locale)}
    </span>
  );
}

function getCustomerSegment(customer: Customer, lastPurchaseDate?: string): Segment {
  if (customer.status === "inactive")
    return "inactive";
  if (customer.membershipLevel === "Platinum" || customer.totalPurchasesLak >= 15000000)
    return "vip";
  if (!lastPurchaseDate)
    return "new";
  if (lastPurchaseDate < "2026-03-21")
    return "lost";
  if (lastPurchaseDate < "2026-05-01")
    return "inactive";
  return customer.totalPurchasesLak >= 1000000 ? "regular" : "new";
}

function getOverdueBalance(customer: Customer) {
  if (customer.outstandingBalanceLak <= 0)
    return 0;
  return Math.round(customer.outstandingBalanceLak * 0.25);
}

function getFavoriteCategories(customer: Customer) {
  if (customer.membershipLevel === "Platinum")
    return ["Wholesale", "Drinks", "Household"];
  if (customer.membershipLevel === "Gold")
    return ["Drinks", "Snacks", "Personal Care"];
  if (customer.membershipLevel === "Silver")
    return ["Food", "Drinks", "Bakery"];
  return ["General", "Services", "Snacks"];
}

function getFavoriteProducts(customer: Customer) {
  if (customer.membershipLevel === "Platinum")
    return ["Water Carton", "Pepsi Carton", "Dishwashing Liquid"];
  if (customer.membershipLevel === "Gold")
    return ["Water 500ml", "Pepsi Can", "Snack Pack"];
  if (customer.membershipLevel === "Silver")
    return ["Coffee", "Bakery", "Milk"];
  return ["Water 500ml", "Instant Noodles", "Snack Bag"];
}

