"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleDollarSign, CreditCard, Gift, Barcode, Phone, QrCode, ReceiptText, Star, Tags, User, } from "lucide-react";
import { membershipDisplayLabel } from "@/features/customers/membership-display";
import type { Customer, CustomerPayment, CustomerPurchase, } from "@/features/customers/types";
import { CustomerStatusBadge } from "@/features/customers/components/customer-status-badge";
import { MembershipBadge } from "@/features/customers/components/membership-badge";
import { calculateAvailablePoints, formatLak } from "@/features/customers/format";
import { createCustomerPaymentAction, updateCustomerAction } from "@/features/customers/actions";
type CustomerTab = "profile" | "purchases" | "points" | "credit" | "notes";
const customerTabs: Array<{
    id: CustomerTab;
    label: string;
}> = [
    { id: "profile", label: "Profile" },
    { id: "purchases", label: "Purchase History" },
    { id: "points", label: "Points History" },
    { id: "credit", label: "Credit History" },
    { id: "notes", label: "Notes" },
];
export function CustomerDetailClient({ customer, payments, purchases, }: {
    customer: Customer;
    payments: CustomerPayment[];
    purchases: CustomerPurchase[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [paymentAmount, setPaymentAmount] = useState(0);
    const [paymentNote, setPaymentNote] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<CustomerTab>("profile");
    const availablePoints = calculateAvailablePoints(customer.earnedPoints, customer.redeemedPoints);
    const remainingCredit = Math.max(customer.creditLimitLak - customer.outstandingBalanceLak, 0);
    const totalVisits = purchases.length || Math.max(1, Math.round(customer.totalPurchasesLak / 2500000));
    const averageSpend = totalVisits > 0 ? Math.round(customer.totalPurchasesLak / totalVisits) : 0;
    const tags = useMemo(() => getCustomerTags(customer), [customer]);
    const favoriteCategories = useMemo(() => getFavoriteCategories(customer), [customer]);
    const favoriteProducts = useMemo(() => getFavoriteProducts(customer), [customer]);
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {message ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/customers">
          <ArrowLeft aria-hidden="true"/>
          Back to customers
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <User aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-3xl font-semibold">{customer.fullName}</h1>
                <MembershipBadge level={customer.membershipLevel}/>
                <CustomerStatusBadge status={customer.status}/>
              </div>
              <p className="mt-2 font-mono text-sm text-muted-foreground">{customer.customerCode}</p>
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <span className="inline-flex min-w-0 items-center gap-2">
                  <Phone aria-hidden="true" className="shrink-0"/>
                  <span className="truncate">{customer.phone}</span>
                </span>
                <span className="truncate">{customer.email}</span>
                <span className="break-words md:col-span-2">{customer.address}</span>
              </div>
            </div>
          </div>
          <MembershipQrCard customer={customer} availablePoints={availablePoints}/>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label="Total purchases" value={`${formatLak(customer.totalPurchasesLak)} LAK`}/>
        <Metric icon={Gift} label="Current points" value={formatLak(availablePoints)}/>
        <Metric icon={CircleDollarSign} label="Outstanding balance" value={`${formatLak(customer.outstandingBalanceLak)} LAK`}/>
        <Metric icon={CreditCard} label="Remaining credit" value={`${formatLak(remainingCredit)} LAK`}/>
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2">
        {customerTabs.map((tab) => (<button className={activeTab === tab.id
                ? "h-10 shrink-0 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
                : "h-10 shrink-0 rounded-md px-4 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>))}
      </nav>

      {activeTab === "profile" ? (<section className="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-6">
          <InfoCard title="General Information" icon={User}>
            <Summary label="Customer code" value={customer.customerCode}/>
            <Summary label="Name" value={customer.fullName}/>
            <Summary label="Phone" value={customer.phone}/>
            <Summary label="Email" value={customer.email}/>
            <Summary label="Address" value={customer.address}/>
            <Summary label="Birthday" value={formatDisplayDate(customer.birthday)}/>
            <Summary label="Member Reference" value={customer.customerCode}/>
            <Summary label="Current Points" value={formatLak(availablePoints)}/>
            <Summary label="Credit Balance" value={`${formatLak(customer.outstandingBalanceLak)} LAK`}/>
            <Summary label="Lifetime Spending" value={`${formatLak(customer.totalPurchasesLak)} LAK`}/>
            <Summary label="Last Purchase" value={formatDisplayDate(purchases[0]?.saleDate)}/>
          </InfoCard>

          <InfoCard title="Membership" icon={Star}>
            <Summary label="Level" value={membershipDisplayLabel(customer.membershipLevel)}/>
            <Summary label="Earned points" value={formatLak(customer.earnedPoints)}/>
            <Summary label="Redeemed points" value={formatLak(customer.redeemedPoints)}/>
            <Summary label="Available points" value={formatLak(availablePoints)}/>
          </InfoCard>

          <InfoCard title="Credit Detail" icon={CreditCard}>
            <Summary label="Credit limit" value={`${formatLak(customer.creditLimitLak)} LAK`}/>
            <Summary label="Outstanding balance" value={`${formatLak(customer.outstandingBalanceLak)} LAK`}/>
            <Summary label="Remaining credit" value={`${formatLak(remainingCredit)} LAK`}/>
            <Summary label="Opening balance" value={`${formatLak(customer.openingBalanceLak)} LAK`}/>
          </InfoCard>

          <InfoCard title={t("ui.notes.tags")} icon={Tags}>
            <p className="rounded-md border border-border bg-background p-3 text-sm leading-6 text-muted-foreground">
              {customer.notes || t("ui.no.notes.recorded")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (<span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" key={tag}>
                  {tag}
                </span>))}
            </div>
          </InfoCard>

          <form className="rounded-lg border border-border bg-card p-5" onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                startTransition(async () => {
                    const result = await updateCustomerAction(customer.id, {
                        email: String(formData.get("email") ?? "").trim() || null,
                        fullName: String(formData.get("fullName") ?? "").trim(),
                        notes: String(formData.get("notes") ?? "").trim() || null,
                        phone: String(formData.get("phone") ?? "").trim() || null,
                        status: String(formData.get("status") ?? "active") as "active" | "inactive",
                    });
                    if (!result.ok) {
                        setMessage(result.error ?? t("ui.customer.update.failed"));
                        return;
                    }
                    setMessage(t("ui.customer.updated.successfully"));
                    router.refresh();
                });
            }}>
            <h2 className="text-lg font-semibold">Edit profile</h2>
            <div className="mt-5 flex flex-col gap-3">
              <input className="field-input" name="fullName" defaultValue={customer.fullName} required/>
              <input className="field-input" name="phone" defaultValue={customer.phone}/>
              <input className="field-input" name="email" defaultValue={customer.email} type="email"/>
              <select className="field-input" name="status" defaultValue={customer.status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <textarea className="min-h-20 rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="notes" defaultValue={customer.notes}/>
              <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={isPending}>
                {isPending ? t("ui.saving") : "Save profile"}
              </button>
            </div>
          </form>

          <form className="rounded-lg border border-border bg-card p-5" onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                    const result = await createCustomerPaymentAction({
                        amountLak: paymentAmount,
                        customerId: customer.id,
                        note: paymentNote || undefined,
                        paymentMethod: "cash",
                        paymentNo: `CP-${Date.now()}`,
                    });
                    if (!result.ok) {
                        setMessage(result.error ?? t("ui.customer.payment.failed"));
                        return;
                    }
                    setMessage(t("ui.customer.payment.saved.successfully"));
                    setPaymentAmount(0);
                    setPaymentNote("");
                    router.refresh();
                });
            }}>
            <h2 className="text-lg font-semibold">Record payment</h2>
            <div className="mt-5 flex flex-col gap-3">
              <input className="field-input" min="0" type="number" value={paymentAmount} onChange={(event) => setPaymentAmount(Number(event.target.value))} placeholder="Amount LAK" required/>
              <textarea className="min-h-20 rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Payment note"/>
              <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={isPending || paymentAmount <= 0}>
                {isPending ? t("ui.saving") : "Save payment"}
              </button>
            </div>
          </form>
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-3">
            <StatisticCard label="Total Visits" value={formatLak(totalVisits)}/>
            <StatisticCard label="Average Spend" value={`${formatLak(averageSpend)} LAK`}/>
            <StatisticCard label="Last Purchase" value={formatDisplayDate(purchases[0]?.saleDate)}/>
          </section>

          <InfoCard title="Customer Analytics" icon={Tags}>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Favorite Categories</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {favoriteCategories.map((category) => (<span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold" key={category}>
                      {category}
                    </span>))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Favorite Products</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {favoriteProducts.map((product) => (<span className="rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold" key={product}>
                      {product}
                    </span>))}
                </div>
              </div>
            </div>
          </InfoCard>

        </div>
      </section>) : null}

      {activeTab === "purchases" ? <HistoryTable purchases={purchases}/> : null}
      {activeTab === "points" ? (<PointsHistory availablePoints={availablePoints} customer={customer} purchases={purchases}/>) : null}
      {activeTab === "credit" ? (<section className="grid min-w-0 gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <InfoCard title="Credit History" icon={CreditCard}>
            <Summary label="Credit Balance" value={`${formatLak(customer.outstandingBalanceLak)} LAK`}/>
            <Summary label="Credit Limit" value={`${formatLak(customer.creditLimitLak)} LAK`}/>
            <Summary label="Remaining Credit" value={`${formatLak(remainingCredit)} LAK`}/>
            <Summary label="Opening Balance" value={`${formatLak(customer.openingBalanceLak)} LAK`}/>
          </InfoCard>
          <PaymentHistory payments={payments}/>
        </section>) : null}
      {activeTab === "notes" ? (<InfoCard title="Internal Notes" icon={Tags}>
          <p className="rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
            {customer.notes || t("ui.no.internal.notes.recorded")}
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (<span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary" key={tag}>
                {tag}
              </span>))}
          </div>
        </InfoCard>) : null}
    </div>);
}
function MembershipQrCard({ availablePoints, customer }: {
    availablePoints: number;
    customer: Customer;
}) {
    return (<div className="w-full rounded-lg border border-border bg-background p-4 lg:w-80">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Membership QR Card</div>
          <div className="mt-1 text-xs text-muted-foreground">{customer.customerCode}</div>
        </div>
        <MembershipBadge level={customer.membershipLevel}/>
      </div>
      <div className="mt-4 grid aspect-square max-h-44 place-items-center rounded-md border border-border bg-card">
        <div className="text-center">
          <QrCode className="mx-auto size-20 text-primary" aria-hidden="true"/>
          <div className="mt-2 font-mono text-xs text-muted-foreground">{customer.customerCode}</div>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Phone className="size-4" aria-hidden="true"/>
          Phone lookup
        </div>
        <div className="mt-1 font-mono text-sm font-semibold">{customer.phone.replaceAll(" ", "")}</div>
      </div>
      <div className="mt-3 rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Barcode className="size-4" aria-hidden="true"/>
          Membership Barcode
        </div>
        <div className="mt-2 flex h-10 items-end gap-1 overflow-hidden">
          {customer.customerCode.split("").map((char, index) => (<span className="block bg-foreground" key={`${char}-${index}`} style={{ height: `${18 + (index % 4) * 5}px`, width: index % 3 === 0 ? 3 : 2 }}/>))}
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{customer.customerCode}</div>
      </div>
      <div className="mt-3 text-sm">
        <div className="font-semibold">{customer.fullName}</div>
        <div className="text-muted-foreground">{formatLak(availablePoints)} points available</div>
      </div>
    </div>);
}
function PointsHistory({ availablePoints, customer, purchases, }: {
    availablePoints: number;
    customer: Customer;
    purchases: CustomerPurchase[];
}) {
    return (<InfoCard title="Points History" icon={Gift}>
      <div className="grid gap-3 md:grid-cols-4">
        <Summary label="Member Reference" value={customer.customerCode}/>
        <Summary label="Membership Status" value={customer.status === "active" ? "Active" : "Inactive"}/>
        <Summary label="Membership Level" value={membershipDisplayLabel(customer.membershipLevel)}/>
        <Summary label="Current Points" value={formatLak(availablePoints)}/>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3 text-right">Earned</th>
              <th className="px-3 py-3 text-right">Redeemed</th>
              <th className="px-3 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (<tr className="border-b border-border last:border-b-0" key={purchase.id}>
                <td className="px-3 py-3">{formatDisplayDate(purchase.saleDate)}</td>
                <td className="px-3 py-3 font-mono">{purchase.saleNo}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatLak(purchase.pointsEarned)}</td>
                <td className="px-3 py-3 text-right">0</td>
                <td className="px-3 py-3 text-right">{formatLak(availablePoints)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </InfoCard>);
}
function HistoryTable({ purchases }: {
    purchases: CustomerPurchase[];
}) {
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Purchase History</h2>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Sale no</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Payment</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-3 py-3 text-right">Points earned</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (<tr className="border-b border-border last:border-b-0" key={purchase.id}>
                <td className="px-3 py-3 font-mono">{purchase.saleNo}</td>
                <td className="px-3 py-3">{formatDisplayDate(purchase.saleDate)}</td>
                <td className="px-3 py-3 capitalize">{purchase.paymentType}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatLak(purchase.totalLak)} LAK</td>
                <td className="px-3 py-3 text-right">{formatLak(purchase.pointsEarned)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {purchases.length === 0 ? (<p className="mt-4 text-sm text-muted-foreground">{t("ui.no.purchases.for.this.customer")}</p>) : null}
    </section>);
}
function PaymentHistory({ payments }: {
    payments: CustomerPayment[];
}) {
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Payment history</h2>
      <div className="mt-5 max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Payment no</th>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Method</th>
              <th className="px-3 py-3">Note</th>
              <th className="px-3 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (<tr className="border-b border-border last:border-b-0" key={payment.id}>
                <td className="px-3 py-3 font-mono">{payment.paymentNo}</td>
                <td className="px-3 py-3">{formatDisplayDate(payment.paymentDate)}</td>
                <td className="px-3 py-3 capitalize">{payment.method}</td>
                <td className="px-3 py-3 text-muted-foreground">{payment.note}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatLak(payment.amountLak)} LAK</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      {payments.length === 0 ? (<p className="mt-4 text-sm text-muted-foreground">{t("ui.no.payments.for.this.customer")}</p>) : null}
    </section>);
}
function Metric({ icon: Icon, label, value }: {
    icon: typeof ReceiptText;
    label: string;
    value: string;
}) {
    return (<div className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 break-words text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </div>);
}
function InfoCard({ children, icon: Icon, title }: {
    children: React.ReactNode;
    icon: typeof User;
    title: string;
}) {
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
      <div className="mt-4 grid gap-3">{children}</div>
    </section>);
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>);
}
function StatisticCard({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-lg border border-border bg-card p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 break-words text-xl font-semibold">{value}</div>
    </div>);
}
function getCustomerTags(customer: Customer) {
    const tags = [membershipDisplayLabel(customer.membershipLevel), customer.outstandingBalanceLak > 0 ? "Credit Customer" : "Paid Customer"];
    if (customer.totalPurchasesLak >= 15000000)
        tags.push("High Value");
    if (customer.status === "inactive")
        tags.push("Inactive");
    return tags;
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
function formatDisplayDate(value?: string) {
    if (!value)
        return "--";
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    if (!year || !month || !day)
        return value;
    return `${day} ${monthNames[month - 1]} ${year}`;
}
