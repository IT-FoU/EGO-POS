"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CreditCard, Eye, FileText, PackageSearch, Plus, Search, Star, Truck } from "lucide-react";
import type { Supplier, SupplierPayment, SupplierPurchaseOrder, SupplierStatus } from "@/features/suppliers/types";
import { PurchaseStatusBadge } from "@/features/suppliers/components/purchase-status-badge";
import { SupplierStatusBadge } from "@/features/suppliers/components/supplier-status-badge";
import { formatLak } from "@/features/suppliers/format";
const statusOptions: Array<SupplierStatus | "all"> = ["all", "active", "inactive"];
const paymentTermOptions = ["all", "Cash", "7 days", "15 days", "30 days", "60 days", "90 days", "Custom"];
type SupplierFilter = SupplierStatus | "all" | "has_outstanding" | "credit_exceeded";
type SummaryModalKind = "active" | "credit_limit" | "outstanding" | "purchases" | "paid" | "average_monthly" | "last_purchase" | "debt" | "credit_exceeded" | "documents";
export function SuppliersListClient({ payments, purchaseOrders, suppliers, }: {
    payments: SupplierPayment[];
    purchaseOrders: SupplierPurchaseOrder[];
    suppliers: Supplier[];
}) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<SupplierFilter>("all");
    const [paymentTerms, setPaymentTerms] = useState("all");
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [invoiceSupplier, setInvoiceSupplier] = useState<Supplier | null>(null);
    const [summaryModal, setSummaryModal] = useState<SummaryModalKind | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const filteredSuppliers = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return suppliers.filter((supplier) => {
            const matchesQuery = normalizedQuery.length === 0 ||
                [
                    supplier.supplierCode,
                    supplier.companyName,
                    supplier.contactPerson,
                    supplier.phone,
                    supplier.email,
                    supplier.taxNumber,
                ].join(" ").toLowerCase().includes(normalizedQuery);
            const matchesStatus = status === "all" ||
                (status === "has_outstanding"
                    ? supplier.outstandingBalanceLak > 0
                    : status === "credit_exceeded"
                        ? supplier.creditLimitLak > 0 && supplier.outstandingBalanceLak > supplier.creditLimitLak
                        : supplier.status === status);
            const matchesTerms = paymentTerms === "all" || normalizeTerms(supplier.creditTerms) === paymentTerms;
            return matchesQuery && matchesStatus && matchesTerms;
        });
    }, [paymentTerms, query, status, suppliers]);
    const activeSuppliers = suppliers.filter((supplier) => supplier.status === "active").length;
    const totalCreditLimit = suppliers.reduce((total, supplier) => total + supplier.creditLimitLak, 0);
    const totalOutstanding = suppliers.reduce((total, supplier) => total + supplier.outstandingBalanceLak, 0);
    const totalPurchaseValue = purchaseOrders.reduce((total, order) => total + order.totalLak, 0);
    const totalPaid = payments.reduce((total, payment) => total + payment.amountLak, 0);
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {selectedSupplier ? (<SupplierDetailModal payments={payments.filter((payment) => payment.supplierId === selectedSupplier.id)} purchaseOrders={purchaseOrders.filter((order) => order.supplierId === selectedSupplier.id)} supplier={selectedSupplier} onClose={() => setSelectedSupplier(null)} onOpenInvoices={() => {
                setInvoiceSupplier(selectedSupplier);
                setSelectedSupplier(null);
            }}/>) : null}
      {invoiceSupplier ? (<OutstandingInvoicesModal purchaseOrders={purchaseOrders.filter((order) => order.supplierId === invoiceSupplier.id)} supplier={invoiceSupplier} onClose={() => setInvoiceSupplier(null)}/>) : null}
      {summaryModal ? (<SummaryListModal kind={summaryModal} payments={payments} purchaseOrders={purchaseOrders} suppliers={suppliers} onClose={() => setSummaryModal(null)} onViewSupplier={(supplier) => {
                setSelectedSupplier(supplier);
                setSummaryModal(null);
            }}/>) : null}
      {notice ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {notice}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Supplier Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Suppliers</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.supplier.profiles.with.credit.outstanding.ba")}</p>
          </div>
          <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/suppliers/new">
            <Plus aria-hidden="true"/>
            Create supplier
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Building2} label="Active suppliers" value={String(activeSuppliers)} onClick={() => setSummaryModal("active")}/>
        <Metric icon={Truck} label="Total credit limit" value={`${formatLak(totalCreditLimit)} LAK`} onClick={() => setSummaryModal("credit_limit")}/>
        <Metric icon={Eye} label="Outstanding balance" value={`${formatLak(totalOutstanding)} LAK`} onClick={() => setSummaryModal("outstanding")}/>
        <Metric icon={PackageSearch} label="Total purchases" value={`${formatLak(totalPurchaseValue)} LAK`} onClick={() => setSummaryModal("purchases")}/>
        <Metric icon={CreditCard} label="Total paid" value={`${formatLak(totalPaid)} LAK`} onClick={() => setSummaryModal("paid")}/>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Average monthly purchase" value={`${formatLak(Math.round(totalPurchaseValue / 12))} LAK`} onClick={() => setSummaryModal("average_monthly")}/>
        <SummaryCard label="Last purchase date" value={getLastPurchaseDate(purchaseOrders)} onClick={() => setSummaryModal("last_purchase")}/>
        <SummaryCard label="Suppliers with debt" value={String(suppliers.filter((supplier) => supplier.outstandingBalanceLak > 0).length)} onClick={() => setSummaryModal("debt")}/>
        <SummaryCard label="Credit exceeded" value={String(suppliers.filter((supplier) => supplier.creditLimitLak > 0 && supplier.outstandingBalanceLak > supplier.creditLimitLak).length)} onClick={() => setSummaryModal("credit_exceeded")}/>
        <SummaryCard label="Documents" value="UI placeholder" onClick={() => setSummaryModal("documents")}/>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="relative flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input className="field-input pl-10" placeholder={t("ui.search.code.company.contact.phone.email.tax.")} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <select className="field-input" value={status} onChange={(event) => setStatus(event.target.value as SupplierFilter)} aria-label="Filter by supplier status">
            {statusOptions.map((option) => (<option value={option} key={option}>
                {option === "all" ? "All statuses" : option}
              </option>))}
            <option value="has_outstanding">Has outstanding balance</option>
            <option value="credit_exceeded">Credit limit exceeded</option>
          </select>
          <select className="field-input" value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} aria-label="Filter by payment terms">
            {paymentTermOptions.map((option) => (<option value={option} key={option}>
                {option === "all" ? "All payment terms" : option}
              </option>))}
          </select>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Supplier code</th>
                <th className="px-4 py-3 font-semibold">Company name</th>
                <th className="px-4 py-3 font-semibold">Contact person</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 text-right font-semibold">Credit limit</th>
                <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Rating</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((supplier) => (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
                  <td className="px-4 py-4 font-mono text-xs">{supplier.supplierCode}</td>
                  <td className="px-4 py-4">
                    <button className="block max-w-[260px] truncate text-left font-semibold text-primary hover:underline" title={supplier.companyName} type="button" onClick={() => setSelectedSupplier(supplier)}>
                      {supplier.companyName}
                    </button>
                    <div className="mt-1 text-xs text-muted-foreground">{supplier.taxNumber}</div>
                  </td>
                  <td className="max-w-[180px] truncate px-4 py-4" title={supplier.contactPerson}>{supplier.contactPerson}</td>
                  <td className="px-4 py-4">{supplier.phone}</td>
                  <td className="px-4 py-4 text-right font-semibold">{formatLak(supplier.creditLimitLak)} LAK</td>
                  <td className="px-4 py-4 text-right">
                    <button className="font-semibold text-warning underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={supplier.outstandingBalanceLak <= 0} type="button" onClick={() => setInvoiceSupplier(supplier)}>
                      {formatLak(supplier.outstandingBalanceLak)} LAK
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <SupplierStatusBadge status={supplier.status}/>
                  </td>
                  <td className="px-4 py-4">
                    <RatingBadge rating={getSupplierRating(supplier)}/>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary" type="button" onClick={() => setSelectedSupplier(supplier)}>
                        <Eye aria-hidden="true" className="size-4"/>
                        View
                      </button>
                      <Link className="inline-flex h-9 items-center rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary" href={`/suppliers/${supplier.id}`}>
                        Edit
                      </Link>
                      <button className="inline-flex h-9 items-center rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary" type="button" onClick={() => setNotice(t("ui.record.payment.will.be.connected.through.pur"))}>
                        Pay
                      </button>
                      <Link className="inline-flex h-9 items-center rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary" href={`/purchasing/new?supplierId=${supplier.id}`}>
                        PO
                      </Link>
                      <button className="inline-flex h-9 items-center rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary" type="button" onClick={() => setNotice(`${supplier.status === "active" ? "Deactivate" : "Activate"} supplier action will use the existing status update flow in a later wiring pass.`)}>
                        {supplier.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {filteredSuppliers.length === 0 ? (<div className="p-8 text-center text-sm text-muted-foreground">{t("ui.no.suppliers.match.the.current.search.and.fi")}</div>) : null}
      </section>
    </div>);
}
function SupplierDetailModal({ onClose, onOpenInvoices, payments, purchaseOrders, supplier, }: {
    onClose: () => void;
    onOpenInvoices: () => void;
    payments: SupplierPayment[];
    purchaseOrders: SupplierPurchaseOrder[];
    supplier: Supplier;
}) {
    const totalPurchases = purchaseOrders.reduce((total, order) => total + order.totalLak, 0);
    const totalPaid = payments.reduce((total, payment) => total + payment.amountLak, 0);
    const lastPurchaseDate = getLastPurchaseDate(purchaseOrders);
    const averageMonthlyPurchase = Math.round(totalPurchases / 12);
    const rating = getSupplierRating(supplier);
    const score = getSupplierScore(rating);
    const tags = getSupplierTags(supplier);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold" title={supplier.companyName}>{supplier.companyName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Supplier detail summary and future integration placeholders</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[76vh] overflow-y-auto p-5">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Detail label="Supplier code" value={supplier.supplierCode || "-"}/>
            <Detail label="Tax number" value={supplier.taxNumber || "-"}/>
            <Detail label="Payment terms" value={supplier.creditTerms || "Not set"}/>
            <Detail label="Final rating" value={`${rating} (${score}/100)`}/>
            <Detail label="Score" value={`${score}/100`}/>
            <Detail label="Rating notes" value={t("ui.manual.demo.score.auto.calculation.is.future")}/>
            <Detail label="Default currency" value={getSupplierCurrency(supplier)}/>
            <Detail label="Contact person" value={supplier.contactPerson || "-"}/>
            <Detail label="Phone" value={supplier.phone || "-"}/>
            <Detail label="Email" value={supplier.email || "-"}/>
            <Detail label="Status" value={supplier.status}/>
            <Detail label="Credit limit" value={`${formatLak(supplier.creditLimitLak)} LAK`}/>
            <button className="rounded-md border border-warning/40 bg-warning/10 p-3 text-left" type="button" onClick={onOpenInvoices}>
              <dt className="text-xs text-warning">Outstanding balance</dt>
              <dd className="mt-1 font-semibold text-warning">{formatLak(supplier.outstandingBalanceLak)} LAK</dd>
            </button>
            <Detail label="Total purchases" value={`${formatLak(totalPurchases)} LAK`}/>
            <Detail label="Total paid" value={`${formatLak(totalPaid)} LAK`}/>
            <Detail label="Last purchase date" value={lastPurchaseDate}/>
            <Detail label="Average monthly purchase" value={`${formatLak(averageMonthlyPurchase)} LAK`}/>
            <Detail label="Products supplied" value="UI placeholder: linked productId relationships not connected yet"/>
            <Detail label="Address" value={supplier.address || "-"}/>
          </section>
          <section className="mt-5 rounded-md border border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Supplier tags</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {tags.map((tag) => (<span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary" key={tag}>{tag}</span>))}
            </div>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <PlaceholderCard icon={PackageSearch} title="Linked products">{t("ui.one.supplier.can.supply.many.products.and.on")}</PlaceholderCard>
            <PlaceholderCard icon={FileText} title="Documents">{t("ui.business.license.tax.certificate.bank.accoun")}</PlaceholderCard>
            <PlaceholderCard icon={Star} title="Rating notes">{t("ui.delivery.reliability.placeholder.product.qua")}</PlaceholderCard>
          </section>
          <section className="mt-5 rounded-md border border-dashed border-border bg-background p-4">
            <h3 className="text-sm font-semibold">Serviced Warehouses</h3>
            <p className="mt-2 text-xs text-muted-foreground">{t("ui.references.warehouseid.only.warehouse.data.r")}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {["Main Warehouse", "Cold Storage", "Branch Warehouse"].map((warehouse) => (<div className="rounded-md border border-border px-3 py-2 text-sm" key={warehouse}>✓ {warehouse}</div>))}
            </div>
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <HistoryPlaceholder title="Purchase history placeholder" value={`${purchaseOrders.length} real/demo purchase records visible on full supplier page.`}/>
            <HistoryPlaceholder title="Payment history placeholder" value={`${payments.length} real/demo payment records visible on full supplier page.`}/>
            <HistoryPlaceholder title="Documents placeholder" value={t("ui.document.upload.and.storage.will.be.connecte")}/>
          </section>
        </div>
      </div>
    </div>);
}
function OutstandingInvoicesModal({ onClose, purchaseOrders, supplier, }: {
    onClose: () => void;
    purchaseOrders: SupplierPurchaseOrder[];
    supplier: Supplier;
}) {
    const invoices = buildOutstandingInvoices(supplier, purchaseOrders);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">Outstanding invoices</h2>
            <p className="mt-1 text-sm text-muted-foreground">{supplier.companyName}{t("ui.mock.demo.placeholder.until.ap.invoices.are.")}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[66vh] overflow-y-auto p-5">
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Invoice number</th>
                  <th className="px-3 py-3">Purchase date</th>
                  <th className="px-3 py-3">Due date</th>
                  <th className="px-3 py-3 text-right">Original amount</th>
                  <th className="px-3 py-3 text-right">Paid amount</th>
                  <th className="px-3 py-3 text-right">Remaining</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (<tr className="border-b border-border last:border-b-0" key={invoice.invoiceNo}>
                    <td className="px-3 py-3 font-mono">{invoice.invoiceNo}</td>
                    <td className="px-3 py-3">{invoice.purchaseDate}</td>
                    <td className="px-3 py-3">{invoice.dueDate}</td>
                    <td className="px-3 py-3 text-right">{formatLak(invoice.originalAmount)} LAK</td>
                    <td className="px-3 py-3 text-right">{formatLak(invoice.paidAmount)} LAK</td>
                    <td className="px-3 py-3 text-right font-semibold text-warning">{formatLak(invoice.remainingAmount)} LAK</td>
                    <td className="px-3 py-3"><InvoiceStatus status={invoice.status}/></td>
                    <td className="px-3 py-3 text-right">
                      <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">
                        View purchase
                      </button>
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          {invoices.length === 0 ? (<div className="rounded-md border border-border bg-background p-6 text-center text-sm text-muted-foreground">{t("ui.no.outstanding.invoices.real.ap.invoice.ledg")}</div>) : null}
        </div>
      </div>
    </div>);
}
function SummaryListModal({ kind, onClose, onViewSupplier, payments, purchaseOrders, suppliers, }: {
    kind: SummaryModalKind;
    onClose: () => void;
    onViewSupplier: (supplier: Supplier) => void;
    payments: SupplierPayment[];
    purchaseOrders: SupplierPurchaseOrder[];
    suppliers: Supplier[];
}) {
    const title = summaryTitle(kind);
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.summary.modal.some.values.are.demo.placehold")}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="max-h-[66vh] overflow-y-auto p-5">
          {kind === "active" ? <ActiveSuppliersTable suppliers={suppliers.filter((supplier) => supplier.status === "active")} onViewSupplier={onViewSupplier}/> : null}
          {kind === "credit_limit" ? <CreditLimitTable suppliers={suppliers} onViewSupplier={onViewSupplier}/> : null}
          {kind === "outstanding" ? <OutstandingSummaryTable suppliers={suppliers} purchaseOrders={purchaseOrders} onViewSupplier={onViewSupplier}/> : null}
          {kind === "purchases" ? <PurchaseSummaryTable suppliers={suppliers} purchaseOrders={purchaseOrders}/> : null}
          {kind === "paid" ? <PaidSummaryTable suppliers={suppliers} payments={payments}/> : null}
          {kind === "average_monthly" ? <MonthlySummaryTable purchaseOrders={purchaseOrders}/> : null}
          {kind === "last_purchase" ? <LatestPurchaseTable suppliers={suppliers} purchaseOrders={purchaseOrders}/> : null}
          {kind === "debt" ? <DebtSuppliersTable suppliers={suppliers.filter((supplier) => supplier.outstandingBalanceLak > 0)} onViewSupplier={onViewSupplier}/> : null}
          {kind === "credit_exceeded" ? <CreditExceededTable suppliers={suppliers.filter((supplier) => supplier.creditLimitLak > 0 && supplier.outstandingBalanceLak > supplier.creditLimitLak)} onViewSupplier={onViewSupplier}/> : null}
          {kind === "documents" ? <DocumentsTable suppliers={suppliers} onViewSupplier={onViewSupplier}/> : null}
        </div>
      </div>
    </div>);
}
function ActiveSuppliersTable({ onViewSupplier, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier code", "Company name", "Contact person", "Phone", "Status", "View"]}>
      {suppliers.map((supplier) => (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
          <td className="px-3 py-3 font-mono">{supplier.supplierCode}</td>
          <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
          <td className="px-3 py-3">{supplier.contactPerson}</td>
          <td className="px-3 py-3">{supplier.phone}</td>
          <td className="px-3 py-3"><SupplierStatusBadge status={supplier.status}/></td>
          <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
        </tr>))}
    </ModalTable>);
}
function CreditLimitTable({ onViewSupplier, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "Credit limit", "Used credit", "Available credit", "View"]}>
      {suppliers.map((supplier) => {
            const available = Math.max(supplier.creditLimitLak - supplier.outstandingBalanceLak, 0);
            return (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
            <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
            <td className="px-3 py-3 text-right">{formatLak(supplier.creditLimitLak)} LAK</td>
            <td className="px-3 py-3 text-right">{formatLak(supplier.outstandingBalanceLak)} LAK</td>
            <td className="px-3 py-3 text-right">{formatLak(available)} LAK</td>
            <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
          </tr>);
        })}
    </ModalTable>);
}
function OutstandingSummaryTable({ onViewSupplier, purchaseOrders, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    purchaseOrders: SupplierPurchaseOrder[];
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "Invoice/PO", "Due date", "Remaining amount", "Overdue status", "View"]}>
      {suppliers.filter((supplier) => supplier.outstandingBalanceLak > 0).map((supplier) => {
            const order = purchaseOrders.find((item) => item.supplierId === supplier.id);
            return (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
            <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
            <td className="px-3 py-3 font-mono">{order?.purchaseNo ?? "AP placeholder"}</td>
            <td className="px-3 py-3">{order ? addDays(order.purchaseDate, 30) : "Future AP"}</td>
            <td className="px-3 py-3 text-right text-warning">{formatLak(supplier.outstandingBalanceLak)} LAK</td>
            <td className="px-3 py-3"><InvoiceStatus status="Overdue"/></td>
            <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
          </tr>);
        })}
    </ModalTable>);
}
function PurchaseSummaryTable({ purchaseOrders, suppliers }: {
    purchaseOrders: SupplierPurchaseOrder[];
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "PO No", "Date", "Amount", "Status", "View"]}>
      {purchaseOrders.map((order) => (<tr className="border-b border-border last:border-b-0" key={order.id}>
          <td className="px-3 py-3 font-semibold">{supplierName(suppliers, order.supplierId)}</td>
          <td className="px-3 py-3 font-mono">{order.purchaseNo}</td>
          <td className="px-3 py-3">{order.purchaseDate}</td>
          <td className="px-3 py-3 text-right">{formatLak(order.totalLak)} LAK</td>
          <td className="px-3 py-3"><PurchaseStatusBadge status={order.status}/></td>
          <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">View</button></td>
        </tr>))}
    </ModalTable>);
}
function PaidSummaryTable({ payments, suppliers }: {
    payments: SupplierPayment[];
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "Payment No", "Date", "Method", "Amount", "View"]}>
      {payments.map((payment) => (<tr className="border-b border-border last:border-b-0" key={payment.id}>
          <td className="px-3 py-3 font-semibold">{supplierName(suppliers, payment.supplierId)}</td>
          <td className="px-3 py-3 font-mono">{payment.paymentNo}</td>
          <td className="px-3 py-3">{payment.paymentDate}</td>
          <td className="px-3 py-3 capitalize">{payment.method}</td>
          <td className="px-3 py-3 text-right">{formatLak(payment.amountLak)} LAK</td>
          <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">View</button></td>
        </tr>))}
    </ModalTable>);
}
function MonthlySummaryTable({ purchaseOrders }: {
    purchaseOrders: SupplierPurchaseOrder[];
}) {
    const rows = Array.from(purchaseOrders.reduce((map, order) => {
        const month = order.purchaseDate.slice(0, 7) || "Unknown";
        const current = map.get(month) ?? { count: 0, total: 0 };
        map.set(month, { count: current.count + 1, total: current.total + order.totalLak });
        return map;
    }, new Map<string, {
        count: number;
        total: number;
    }>()));
    return (<div>
      <div className="mb-4 rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">{t("ui.simple.chart.placeholder.monthly.purchase.ba")}</div>
      <ModalTable headers={["Month", "Total purchase", "Supplier count", "Chart"]}>
        {rows.map(([month, row]) => (<tr className="border-b border-border last:border-b-0" key={month}>
            <td className="px-3 py-3">{month}</td>
            <td className="px-3 py-3 text-right">{formatLak(row.total)} LAK</td>
            <td className="px-3 py-3 text-right">{row.count}</td>
            <td className="px-3 py-3"><div className="h-2 rounded bg-primary/30" style={{ width: `${Math.min(100, Math.max(12, row.count * 18))}%` }}/></td>
          </tr>))}
      </ModalTable>
    </div>);
}
function LatestPurchaseTable({ purchaseOrders, suppliers }: {
    purchaseOrders: SupplierPurchaseOrder[];
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "PO No", "Date", "Amount", "View"]}>
      {[...purchaseOrders].sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)).slice(0, 12).map((order) => (<tr className="border-b border-border last:border-b-0" key={order.id}>
          <td className="px-3 py-3 font-semibold">{supplierName(suppliers, order.supplierId)}</td>
          <td className="px-3 py-3 font-mono">{order.purchaseNo}</td>
          <td className="px-3 py-3">{order.purchaseDate}</td>
          <td className="px-3 py-3 text-right">{formatLak(order.totalLak)} LAK</td>
          <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">View</button></td>
        </tr>))}
    </ModalTable>);
}
function DebtSuppliersTable({ onViewSupplier, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "Outstanding balance", "Credit limit", "Due date", "View"]}>
      {suppliers.map((supplier) => (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
          <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
          <td className="px-3 py-3 text-right">{formatLak(supplier.outstandingBalanceLak)} LAK</td>
          <td className="px-3 py-3 text-right">{formatLak(supplier.creditLimitLak)} LAK</td>
          <td className="px-3 py-3">AP placeholder</td>
          <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
        </tr>))}
    </ModalTable>);
}
function CreditExceededTable({ onViewSupplier, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    suppliers: Supplier[];
}) {
    return (<ModalTable headers={["Supplier", "Credit limit", "Outstanding balance", "Exceeded amount", "View"]}>
      {suppliers.map((supplier) => (<tr className="border-b border-border last:border-b-0" key={supplier.id}>
          <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
          <td className="px-3 py-3 text-right">{formatLak(supplier.creditLimitLak)} LAK</td>
          <td className="px-3 py-3 text-right">{formatLak(supplier.outstandingBalanceLak)} LAK</td>
          <td className="px-3 py-3 text-right text-danger">{formatLak(Math.max(supplier.outstandingBalanceLak - supplier.creditLimitLak, 0))} LAK</td>
          <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
        </tr>))}
    </ModalTable>);
}
function DocumentsTable({ onViewSupplier, suppliers }: {
    onViewSupplier: (supplier: Supplier) => void;
    suppliers: Supplier[];
}) {
    const documentTypes = ["Tax certificate", "Business license", "Contract", "Bank account"];
    return (<ModalTable headers={["Supplier", "Document type", "Status", "Expiry date", "View"]}>
      {suppliers.flatMap((supplier) => documentTypes.slice(0, 2).map((documentType) => (<tr className="border-b border-border last:border-b-0" key={`${supplier.id}-${documentType}`}>
          <td className="px-3 py-3 font-semibold">{supplier.companyName}</td>
          <td className="px-3 py-3">{documentType}</td>
          <td className="px-3 py-3">UI placeholder</td>
          <td className="px-3 py-3">Future document expiry</td>
          <td className="px-3 py-3 text-right"><ViewSupplierButton supplier={supplier} onViewSupplier={onViewSupplier}/></td>
        </tr>)))}
    </ModalTable>);
}
function ModalTable({ children, headers }: {
    children: React.ReactNode;
    headers: string[];
}) {
    return (<div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>{headers.map((header) => <th className="px-3 py-3" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>);
}
function ViewSupplierButton({ onViewSupplier, supplier }: {
    onViewSupplier: (supplier: Supplier) => void;
    supplier: Supplier;
}) {
    return <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => onViewSupplier(supplier)}>View</button>;
}
function summaryTitle(kind: SummaryModalKind) {
    const titles: Record<SummaryModalKind, string> = {
        active: "Active suppliers",
        average_monthly: "Average monthly purchase",
        credit_exceeded: "Credit exceeded",
        credit_limit: "Total credit limit",
        debt: "Suppliers with debt",
        documents: "Documents",
        last_purchase: "Last purchase date",
        outstanding: "Outstanding balance",
        paid: "Total paid",
        purchases: "Total purchases",
    };
    return titles[kind];
}
function supplierName(suppliers: Supplier[], supplierId: string) {
    return suppliers.find((supplier) => supplier.id === supplierId)?.companyName ?? "Unknown supplier";
}
function Metric({ icon: Icon, label, onClick, value, }: {
    icon: typeof Building2;
    label: string;
    onClick?: () => void;
    value: string;
}) {
    return (<button className="rounded-lg border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5" type="button" onClick={onClick}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 whitespace-nowrap text-lg font-semibold xl:text-xl">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </button>);
}
function SummaryCard({ label, onClick, value }: {
    label: string;
    onClick?: () => void;
    value: string;
}) {
    return (<button className="rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/5" type="button" onClick={onClick}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-2 whitespace-nowrap text-sm font-semibold">{value}</div>
    </button>);
}
function Detail({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>);
}
function PlaceholderCard({ children, icon: Icon, title }: {
    children: React.ReactNode;
    icon: typeof PackageSearch;
    title: string;
}) {
    return (<div className="rounded-md border border-dashed border-border bg-background p-4">
      <div className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className="size-4 text-primary"/>
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>);
}
function HistoryPlaceholder({ title, value }: {
    title: string;
    value: string;
}) {
    return (<div className="rounded-md border border-border bg-background p-4">
      <div className="font-semibold">{title}</div>
      <p className="mt-2 text-sm text-muted-foreground">{value}</p>
    </div>);
}
function RatingBadge({ rating }: {
    rating: string;
}) {
    const tone = rating === "A" ? "border-success/40 bg-success/10 text-success" :
        rating === "B" ? "border-primary/40 bg-primary/10 text-primary" :
            rating === "C" ? "border-warning/40 bg-warning/10 text-warning" :
                "border-danger/40 bg-danger/10 text-danger";
    return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{rating} ({getSupplierScore(rating)}/100)</span>;
}
function InvoiceStatus({ status }: {
    status: string;
}) {
    const tone = status === "Overdue" ? "bg-danger/10 text-danger" : status === "Partial" ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground";
    return <span className={`rounded-md px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}
function normalizeTerms(terms: string) {
    const normalized = terms.trim().toLowerCase();
    if (normalized === "net 7" || normalized === "7 days")
        return "7 days";
    if (normalized === "net 15" || normalized === "15 days")
        return "15 days";
    if (normalized === "net 30" || normalized === "30 days")
        return "30 days";
    if (normalized === "net 60" || normalized === "60 days")
        return "60 days";
    if (normalized === "net 90" || normalized === "90 days")
        return "90 days";
    if (normalized === "prepaid" || normalized === "cash")
        return "Cash";
    return terms ? "Custom" : "all";
}
function getSupplierRating(supplier: Supplier) {
    const match = supplier.notes.match(/Supplier rating:\s*([ABCD])/i);
    if (match)
        return match[1].toUpperCase();
    if (supplier.status === "inactive")
        return "D";
    if (supplier.outstandingBalanceLak === 0)
        return "A";
    if (supplier.creditLimitLak > 0 && supplier.outstandingBalanceLak > supplier.creditLimitLak)
        return "D";
    if (supplier.outstandingBalanceLak > supplier.creditLimitLak * 0.7)
        return "C";
    return "B";
}
function getSupplierScore(rating: string) {
    if (rating === "A")
        return 92;
    if (rating === "B")
        return 81;
    if (rating === "C")
        return 70;
    return 55;
}
function getSupplierTags(supplier: Supplier) {
    const tags = new Set<string>();
    if (supplier.outstandingBalanceLak === 0)
        tags.add("Preferred Supplier");
    if (supplier.status === "active")
        tags.add("Local Supplier");
    if (supplier.creditLimitLak >= 20000000)
        tags.add("Main Supplier");
    if (supplier.averageDeliveryDays <= 2)
        tags.add("Backup Supplier");
    if (supplier.notes.toLowerCase().includes("import"))
        tags.add("Importer");
    if (supplier.notes.toLowerCase().includes("consignment"))
        tags.add("Consignment Supplier");
    return Array.from(tags).slice(0, 4);
}
function getSupplierCurrency(supplier: Supplier) {
    const upperNotes = supplier.notes.toUpperCase();
    if (upperNotes.includes("THB"))
        return "THB";
    if (upperNotes.includes("USD"))
        return "USD";
    return "LAK";
}
function getLastPurchaseDate(orders: SupplierPurchaseOrder[]) {
    return orders.map((order) => order.purchaseDate).filter(Boolean).sort().at(-1) ?? "No purchases";
}
function buildOutstandingInvoices(supplier: Supplier, orders: SupplierPurchaseOrder[]) {
    if (supplier.outstandingBalanceLak <= 0)
        return [];
    const sourceOrders = orders.length > 0
        ? orders.slice(0, 4)
        : [{ id: "placeholder", purchaseDate: "Future AP", purchaseNo: `${supplier.supplierCode || "SUP"}-INV`, totalLak: supplier.outstandingBalanceLak }];
    const perInvoiceRemaining = Math.max(Math.round(supplier.outstandingBalanceLak / sourceOrders.length), 1);
    return sourceOrders.map((order, index) => {
        const originalAmount = "totalLak" in order ? order.totalLak : supplier.outstandingBalanceLak;
        const remainingAmount = Math.min(perInvoiceRemaining, originalAmount);
        const purchaseDate = "purchaseDate" in order ? order.purchaseDate : "Future AP";
        return {
            dueDate: addDays(purchaseDate, 30),
            invoiceNo: `INV-${supplier.supplierCode || "SUP"}-${String(index + 1).padStart(3, "0")}`,
            originalAmount,
            paidAmount: Math.max(originalAmount - remainingAmount, 0),
            purchaseDate,
            remainingAmount,
            status: index === 0 ? "Overdue" : remainingAmount < originalAmount ? "Partial" : "Unpaid",
        };
    });
}
function addDays(dateValue: string, days: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue))
        return "Future AP";
    const date = new Date(`${dateValue}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}
