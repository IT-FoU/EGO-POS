"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, CircleDollarSign, PackageCheck, PackageSearch, ReceiptText, Star, Truck, } from "lucide-react";
import type { Supplier, SupplierPayment, SupplierPurchaseOrder, SupplierReceiving } from "@/features/suppliers/types";
import { PurchaseStatusBadge } from "@/features/suppliers/components/purchase-status-badge";
import { SupplierStatusBadge } from "@/features/suppliers/components/supplier-status-badge";
import { formatDays, formatLak } from "@/features/suppliers/format";
import { updateSupplierAction } from "@/features/suppliers/actions";
type DetailModal = {
    kind: "po";
    row: SupplierPurchaseOrder;
} | {
    kind: "receiving";
    row: SupplierReceiving;
} | {
    kind: "payment";
    row: SupplierPayment;
} | {
    kind: "ledger";
} | {
    kind: "payment_placeholder";
};
const productsSupplied = [
    { action: "View product", barcode: "885001", code: "WAT-500", cost: 85680, leadTime: 2, moq: "5 Carton", name: "Water 500ml", preferred: true, supplierSku: "LB-WAT-500" },
    { action: "View product", barcode: "885002", code: "PEP-CAN", cost: 115000, leadTime: 3, moq: "3 Carton", name: "Pepsi Can", preferred: false, supplierSku: "LB-PEP-CAN" },
    { action: "View product", barcode: "885003", code: "SNK-CLASSIC", cost: 42000, leadTime: 4, moq: "10 Pack", name: "Lay's Classic", preferred: false, supplierSku: "SN-LAY-CLASSIC" },
];
export function SupplierDetailClient({ payments, purchaseOrders, receivings, supplier, }: {
    payments: SupplierPayment[];
    purchaseOrders: SupplierPurchaseOrder[];
    receivings: SupplierReceiving[];
    supplier: Supplier;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [modal, setModal] = useState<DetailModal | null>(null);
    const totalPurchaseValue = purchaseOrders.reduce((total, purchaseOrder) => total + purchaseOrder.totalLak, 0);
    const lastPurchaseDate = purchaseOrders.map((purchaseOrder) => purchaseOrder.purchaseDate).sort().at(-1) ?? "No purchases";
    const remainingCredit = Math.max(supplier.creditLimitLak - supplier.outstandingBalanceLak, 0);
    const autoRating = getAutoRating(supplier);
    const manualRating = getManualRating(supplier);
    const finalRating = manualRating ?? autoRating;
    const supplierScore = getSupplierScore(finalRating);
    const supplierTags = getSupplierTags(supplier);
    const supplierCurrency = getSupplierCurrency(supplier);
    const ledgerRows = useMemo(() => buildLedgerRows(purchaseOrders, receivings, payments), [payments, purchaseOrders, receivings]);
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {modal ? (<DetailModalView ledgerRows={ledgerRows} modal={modal} supplier={supplier} onClose={() => setModal(null)}/>) : null}

      {message ? (<div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {message}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/suppliers">
          <ArrowLeft aria-hidden="true"/>
          Back to suppliers
        </Link>
        <div className="mt-5 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 aria-hidden="true"/>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-3xl font-semibold" title={supplier.companyName}>{supplier.companyName}</h1>
                <SupplierStatusBadge status={supplier.status}/>
                <RatingBadge rating={finalRating} score={supplierScore}/>
              </div>
              <p className="mt-2 font-mono text-sm text-muted-foreground">{supplier.supplierCode} / {supplier.taxNumber || "No tax number"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {supplierTags.map((tag) => (<span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary" key={tag}>{tag}</span>))}
              </div>
              <div className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                <span>{t("ui.contact")}{supplier.contactPerson || "-"}</span>
                <span>{supplier.phone || "-"}</span>
                <span>{supplier.email || "-"}</span>
                <span className="truncate" title={supplier.address}>{supplier.address || "-"}</span>
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-background p-4 text-sm lg:w-80">
            <div className="text-muted-foreground">Notes</div>
            <p className="mt-2 line-clamp-4 leading-6">{supplier.notes || t("ui.no.supplier.notes")}</p>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <QuickAction href={`/purchasing/new?supplierId=${supplier.id}`} label="Create Purchase Order"/>
        <QuickAction href="/purchasing/receiving" label="Receive Goods"/>
        <QuickAction onClick={() => setModal({ kind: "payment_placeholder" })} label="Record Payment"/>
        <QuickAction onClick={() => setModal({ kind: "ledger" })} label="Supplier Ledger"/>
        <QuickAction href={`/suppliers/${supplier.id}`} label="Edit Supplier"/>
        <QuickAction label={supplier.status === "active" ? "Deactivate Supplier" : "Activate Supplier"} onClick={() => setMessage(`${supplier.status === "active" ? "Deactivate" : "Activate"} supplier will use existing supplier status action in a later wiring pass.`)}/>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={ReceiptText} label="Total orders" value={String(purchaseOrders.length)}/>
        <Metric icon={CircleDollarSign} label="Total purchase value" value={`${formatLak(totalPurchaseValue)} LAK`}/>
        <Metric icon={Truck} label="Average delivery time" value={formatDays(supplier.averageDeliveryDays)}/>
        <Metric icon={PackageCheck} label="Last purchase date" value={lastPurchaseDate}/>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Supplier profile</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label="Contact person" value={supplier.contactPerson || "-"}/>
              <Summary label="Phone" value={supplier.phone || "-"}/>
              <Summary label="Email" value={supplier.email || "-"}/>
              <Summary label="Tax number" value={supplier.taxNumber || "-"}/>
            </dl>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <ContactAction label="Call" href={supplier.phone ? `tel:${supplier.phone}` : undefined} disabled={!supplier.phone}/>
              <ContactAction label="Email" href={supplier.email ? `mailto:${supplier.email}` : undefined} disabled={!supplier.email}/>
              <ContactAction label="Copy Phone" onClick={() => copyText(supplier.phone)} disabled={!supplier.phone}/>
              <ContactAction label="Copy Email" onClick={() => copyText(supplier.email)} disabled={!supplier.email}/>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Credit terms</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label="Credit terms" value={supplier.creditTerms || "Not set"}/>
              <Summary label="Default currency" value={supplierCurrency}/>
              <Summary label="Credit limit" value={`${formatLak(supplier.creditLimitLak)} LAK`}/>
              <Summary label="Outstanding balance" value={`${formatLak(supplier.outstandingBalanceLak)} LAK`}/>
              <Summary label="Remaining credit" value={`${formatLak(remainingCredit)} LAK`}/>
              <Summary label="Opening balance" value={`${formatLak(supplier.openingBalanceLak)} LAK`}/>
            </dl>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Supplier rating</h2>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <Summary label="Auto rating" value={autoRating}/>
              <Summary label="Manual override" value={manualRating ?? "None"}/>
              <Summary label="Final rating" value={`${finalRating} (${supplierScore}/100)`}/>
              <Summary label="Score" value={`${supplierScore}/100`}/>
              <Summary label="Rating notes" value={t("ui.manual.demo.score.auto.score.calculation.is.")}/>
              <Summary label="Rating explanation" value={t("ui.future.calculation.delivery.reliability.prod")}/>
              <Summary label="Last rating update" value="Future integration"/>
            </dl>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Serviced Warehouses</h2>
            <p className="mt-2 text-xs text-muted-foreground">{t("ui.references.warehouseid.only.warehouse.owners")}</p>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {["Main Warehouse", "Cold Storage", "Branch Warehouse"].map((warehouse) => (<div className="rounded-md border border-border bg-background px-3 py-2" key={warehouse}>✓ {warehouse}</div>))}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Documents</h2>
            <div className="mt-4 flex flex-col gap-2 text-sm">
              {["Business License", "Tax Certificate", "Bank Account", "Contract"].map((document) => (<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2" key={document}>
                  <span>{document}</span>
                  <span className="text-xs text-muted-foreground">UI placeholder</span>
                </div>))}
            </div>
          </section>

        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          <ProductsSuppliedCard />
          <PurchaseOrdersHistory purchaseOrders={purchaseOrders} onView={(row) => setModal({ kind: "po", row })}/>
          <ReceivingHistory receivings={receivings} onView={(row) => setModal({ kind: "receiving", row })}/>
          <PaymentHistory payments={payments} onView={(row) => setModal({ kind: "payment", row })}/>
          <LedgerCard ledgerRows={ledgerRows} onOpen={() => setModal({ kind: "ledger" })}/>
          <form className="min-w-0 rounded-lg border border-border bg-card p-6" onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startTransition(async () => {
                const result = await updateSupplierAction(supplier.id, {
                    companyName: String(formData.get("companyName") ?? "").trim(),
                    contactPerson: String(formData.get("contactPerson") ?? "").trim() || null,
                    email: String(formData.get("email") ?? "").trim() || null,
                    phone: String(formData.get("phone") ?? "").trim() || null,
                    status: String(formData.get("status") ?? "active") as "active" | "inactive",
                });
                if (!result.ok) {
                    setMessage(result.error ?? t("ui.supplier.update.failed"));
                    return;
                }
                setMessage(t("ui.supplier.updated.successfully"));
                router.refresh();
            });
        }}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Edit supplier</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("ui.update.core.supplier.contact.and.status.deta")}</p>
              </div>
              <button className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="submit" disabled={isPending}>
                {isPending ? t("ui.saving") : "Save supplier"}
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Company name
                <input className="field-input" name="companyName" defaultValue={supplier.companyName} required/>
              </label>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Contact person
                <input className="field-input" name="contactPerson" defaultValue={supplier.contactPerson}/>
              </label>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Phone
                <input className="field-input" name="phone" defaultValue={supplier.phone}/>
              </label>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium">
                Email
                <input className="field-input" name="email" defaultValue={supplier.email} type="email"/>
              </label>
              <label className="flex min-w-0 flex-col gap-2 text-sm font-medium md:col-span-2">
                Status
                <select className="field-input" name="status" defaultValue={supplier.status}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
          </form>
        </div>
      </section>
    </div>);
}
function QuickAction({ href, label, onClick }: {
    href?: string;
    label: string;
    onClick?: () => void;
}) {
    const className = "inline-flex h-11 min-w-0 items-center justify-center rounded-md border border-border bg-card px-3 text-center text-xs font-semibold transition hover:border-primary hover:text-primary";
    if (href)
        return <Link className={className} href={href}>{label}</Link>;
    return <button className={className} type="button" onClick={onClick}>{label}</button>;
}
function PurchaseOrdersHistory({ onView, purchaseOrders }: {
    onView: (row: SupplierPurchaseOrder) => void;
    purchaseOrders: SupplierPurchaseOrder[];
}) {
    return (<HistoryCard title="Purchase Orders History" empty={t("ui.no.purchase.orders.for.this.supplier")}>
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">PO No</th>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3 text-right">Amount</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {purchaseOrders.map((purchaseOrder) => (<tr className="border-b border-border last:border-b-0" key={purchaseOrder.id}>
              <td className="px-3 py-3 font-mono">{purchaseOrder.purchaseNo}</td>
              <td className="px-3 py-3">{purchaseOrder.purchaseDate}</td>
              <td className="px-3 py-3 text-right font-semibold">{formatLak(purchaseOrder.totalLak)} LAK</td>
              <td className="px-3 py-3"><PurchaseStatusBadge status={purchaseOrder.status}/></td>
              <td className="px-3 py-3 text-right"><ViewButton onClick={() => onView(purchaseOrder)}/></td>
            </tr>))}
        </tbody>
      </table>
      {purchaseOrders.length === 0 ? <EmptyText text={t("ui.no.purchase.orders.for.this.supplier")}/> : null}
    </HistoryCard>);
}
function ReceivingHistory({ onView, receivings }: {
    onView: (row: SupplierReceiving) => void;
    receivings: SupplierReceiving[];
}) {
    return (<HistoryCard title="Receiving History" empty={t("ui.no.receiving.records.for.this.supplier")}>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Receive No</th>
            <th className="px-3 py-3">PO No</th>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Warehouse</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {receivings.map((receiving) => (<tr className="border-b border-border last:border-b-0" key={receiving.id}>
              <td className="px-3 py-3 font-mono">{receiving.receiveNo}</td>
              <td className="px-3 py-3 font-mono">{receiving.purchaseNo}</td>
              <td className="px-3 py-3">{receiving.receivedDate}</td>
              <td className="px-3 py-3">{receiving.warehouseName}</td>
              <td className="px-3 py-3 text-right"><ViewButton onClick={() => onView(receiving)}/></td>
            </tr>))}
        </tbody>
      </table>
      {receivings.length === 0 ? <EmptyText text={t("ui.no.receiving.records.for.this.supplier")}/> : null}
    </HistoryCard>);
}
function PaymentHistory({ onView, payments }: {
    onView: (row: SupplierPayment) => void;
    payments: SupplierPayment[];
}) {
    return (<HistoryCard title="Payment History" empty={t("ui.no.payments.for.this.supplier")}>
      <table className="w-full min-w-[580px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Payment No</th>
            <th className="px-3 py-3">Date</th>
            <th className="px-3 py-3">Method</th>
            <th className="px-3 py-3 text-right">Amount</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (<tr className="border-b border-border last:border-b-0" key={payment.id}>
              <td className="px-3 py-3 font-mono">{payment.paymentNo}</td>
              <td className="px-3 py-3">{payment.paymentDate}</td>
              <td className="px-3 py-3 capitalize">{payment.method}</td>
              <td className="px-3 py-3 text-right font-semibold">{formatLak(payment.amountLak)} LAK</td>
              <td className="px-3 py-3 text-right"><ViewButton onClick={() => onView(payment)}/></td>
            </tr>))}
        </tbody>
      </table>
      {payments.length === 0 ? <EmptyText text={t("ui.no.payments.for.this.supplier")}/> : null}
    </HistoryCard>);
}
function ProductsSuppliedCard() {
    return (<HistoryCard title="Products Supplied" empty={t("ui.supplier.product.linking.is.a.future.integra")}>
      <div className="mb-3 rounded-md border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">{t("ui.ui.placeholder.only.this.section.must.refere")}</div>
      <div className="grid gap-3 md:grid-cols-3">
        <Summary label="SKU count" value={String(productsSupplied.length)}/>
        <Summary label="Preferred supplier status" value="Future per-product setting"/>
        <Summary label="Integration" value="Future SupplierProduct relationship"/>
      </div>
      <div className="mt-4 max-w-full overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Product code / barcode</th>
              <th className="px-3 py-3">Product name</th>
              <th className="px-3 py-3">Supplier SKU</th>
              <th className="px-3 py-3 text-right">Last cost</th>
              <th className="px-3 py-3">MOQ</th>
              <th className="px-3 py-3 text-right">Lead time</th>
              <th className="px-3 py-3">Preferred</th>
              <th className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {productsSupplied.map((product) => (<tr className="border-b border-border last:border-b-0" key={product.code}>
                <td className="px-3 py-3"><div className="font-mono">{product.code}</div><div className="text-xs text-muted-foreground">{product.barcode}</div></td>
                <td className="px-3 py-3 font-semibold">{product.name}</td>
                <td className="px-3 py-3 font-mono">{product.supplierSku}</td>
                <td className="px-3 py-3 text-right">{formatLak(product.cost)} LAK</td>
                <td className="px-3 py-3">{product.moq}</td>
                <td className="px-3 py-3 text-right">{product.leadTime}d</td>
                <td className="px-3 py-3">{product.preferred ? "Yes" : "No"}</td>
                <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{product.action}</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </HistoryCard>);
}
function LedgerCard({ ledgerRows, onOpen }: {
    ledgerRows: LedgerRow[];
    onOpen: () => void;
}) {
    return (<section className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Supplier Ledger</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.ui.placeholder.until.ap.po.payment.ledger.is")}</p>
        </div>
        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={onOpen}>Open ledger</button>
      </div>
      <div className="mt-4 max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3 text-right">Debit</th>
              <th className="px-3 py-3 text-right">Credit</th>
              <th className="px-3 py-3 text-right">Balance</th>
              <th className="px-3 py-3">Note</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.slice(0, 5).map((row) => (<tr className="border-b border-border last:border-b-0" key={`${row.type}-${row.reference}-${row.date}`}>
                <td className="px-3 py-3">{row.date}</td>
                <td className="px-3 py-3">{row.type}</td>
                <td className="px-3 py-3 font-mono">{row.reference}</td>
                <td className="px-3 py-3 text-right">{row.debit ? `${formatLak(row.debit)} LAK` : "-"}</td>
                <td className="px-3 py-3 text-right">{row.credit ? `${formatLak(row.credit)} LAK` : "-"}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatLak(row.balance)} LAK</td>
                <td className="px-3 py-3 text-muted-foreground">{row.note}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </section>);
}
function HistoryCard({ children, empty, title }: {
    children: React.ReactNode;
    empty: string;
    title: string;
}) {
    return (<section className="min-w-0 max-w-full rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-5 max-w-full overflow-x-auto">{children}</div>
    </section>);
}
function ViewButton({ onClick }: {
    onClick: () => void;
}) {
    return <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={onClick}>View Detail</button>;
}
function EmptyText({ text }: {
    text: string;
}) {
    return <p className="mt-4 text-sm text-muted-foreground">{text}</p>;
}
function DetailModalView({ ledgerRows, modal, onClose, supplier, }: {
    ledgerRows: LedgerRow[];
    modal: DetailModal;
    onClose: () => void;
    supplier: Supplier;
}) {
    const title = modal.kind === "po" ? "Purchase Order Detail" :
        modal.kind === "receiving" ? "Receiving Detail" :
            modal.kind === "payment" ? "Payment Detail" :
                modal.kind === "ledger" ? "Supplier Ledger" :
                    "Record Payment";
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{supplier.companyName}</p>
          </div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="max-h-[68vh] overflow-y-auto p-5">
          {modal.kind === "po" ? <PoDetail row={modal.row} supplier={supplier}/> : null}
          {modal.kind === "receiving" ? <ReceivingDetail row={modal.row}/> : null}
          {modal.kind === "payment" ? <PaymentDetail row={modal.row}/> : null}
          {modal.kind === "ledger" ? <LedgerDetail rows={ledgerRows}/> : null}
          {modal.kind === "payment_placeholder" ? (<PlaceholderPanel title="Record Payment">{t("ui.payment.modal.is.a.placeholder.final.impleme")}</PlaceholderPanel>) : null}
        </div>
      </div>
    </div>);
}
function PoDetail({ row, supplier }: {
    row: SupplierPurchaseOrder;
    supplier: Supplier;
}) {
    return (<div className="grid gap-3 text-sm md:grid-cols-2">
      <Detail label="PO No" value={row.purchaseNo}/>
      <Detail label="Date" value={row.purchaseDate}/>
      <Detail label="Supplier" value={supplier.companyName}/>
      <Detail label="Warehouse" value={row.warehouseName || "-"}/>
      <Detail label="Items count" value="Future item detail"/>
      <Detail label="Subtotal" value={`${formatLak(row.totalLak)} LAK`}/>
      <Detail label="Discount" value="0 LAK"/>
      <Detail label="Tax if used" value="0 LAK"/>
      <Detail label="Total" value={`${formatLak(row.totalLak)} LAK`}/>
      <Detail label="Status" value={row.status}/>
      <Detail label="Created by" value="Current purchasing user placeholder"/>
      <Detail label="Notes" value={t("ui.purchasing.notes.will.be.connected.later")}/>
      <Link className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/purchasing">
        View in Purchasing
      </Link>
    </div>);
}
function ReceivingDetail({ row }: {
    row: SupplierReceiving;
}) {
    return (<div className="grid gap-3 text-sm md:grid-cols-2">
      <Detail label="Receive No" value={row.receiveNo}/>
      <Detail label="PO No" value={row.purchaseNo}/>
      <Detail label="Date" value={row.receivedDate}/>
      <Detail label="Warehouse" value={row.warehouseName || "-"}/>
      <Detail label="Items received" value={String(row.itemCount)}/>
      <Detail label="Damaged items" value="Future receiving field"/>
      <Detail label="Expiry check status" value="Future lot/expiry review"/>
      <Detail label="Received by" value="Current receiving user placeholder"/>
      <Detail label="Notes" value={t("ui.receiving.notes.will.be.connected.later")}/>
      <Link className="md:col-span-2 inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/purchasing/receiving">
        View receiving document
      </Link>
    </div>);
}
function PaymentDetail({ row }: {
    row: SupplierPayment;
}) {
    return (<div className="grid gap-3 text-sm md:grid-cols-2">
      <Detail label="Payment No" value={row.paymentNo}/>
      <Detail label="Date" value={row.paymentDate}/>
      <Detail label="Method" value={row.method}/>
      <Detail label="Amount" value={`${formatLak(row.amountLak)} LAK`}/>
      <Detail label="Currency" value="LAK"/>
      <Detail label="Exchange rate if applicable" value="1.00"/>
      <Detail label="Reference number" value="Future payment reference"/>
      <Detail label="Paid by" value="Current user placeholder"/>
      <Detail label="Notes" value={row.note || "-"}/>
      <button className="md:col-span-2 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">
        View payment record
      </button>
    </div>);
}
function LedgerDetail({ rows }: {
    rows: LedgerRow[];
}) {
    return (<div>
      <p className="mb-4 rounded-md border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">{t("ui.ui.placeholder.final.ledger.must.combine.po.")}</p>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">Reference</th>
              <th className="px-3 py-3 text-right">Debit</th>
              <th className="px-3 py-3 text-right">Credit</th>
              <th className="px-3 py-3 text-right">Balance</th>
              <th className="px-3 py-3">Note</th>
              <th className="px-3 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (<tr className="border-b border-border last:border-b-0" key={`${row.type}-${row.reference}-${row.date}`}>
                <td className="px-3 py-3">{row.date}</td>
                <td className="px-3 py-3">{row.type}</td>
                <td className="px-3 py-3 font-mono">{row.reference}</td>
                <td className="px-3 py-3 text-right">{row.debit ? `${formatLak(row.debit)} LAK` : "-"}</td>
                <td className="px-3 py-3 text-right">{row.credit ? `${formatLak(row.credit)} LAK` : "-"}</td>
                <td className="px-3 py-3 text-right font-semibold">{formatLak(row.balance)} LAK</td>
                <td className="px-3 py-3 text-muted-foreground">{row.note}</td>
                <td className="px-3 py-3 text-right"><button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">View</button></td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>);
}
function PlaceholderPanel({ children, title }: {
    children: React.ReactNode;
    title: string;
}) {
    return (<div className="rounded-md border border-dashed border-border bg-background p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>);
}
function Metric({ icon: Icon, label, value }: {
    icon: typeof ReceiptText;
    label: string;
    value: string;
}) {
    return (<div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 whitespace-nowrap text-xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden="true"/>
        </div>
      </div>
    </div>);
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>);
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
function ContactAction({ disabled, href, label, onClick }: {
    disabled?: boolean;
    href?: string;
    label: string;
    onClick?: () => void;
}) {
    const className = "inline-flex h-9 items-center justify-center rounded-md border border-border px-2 text-xs font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50";
    if (href && !disabled)
        return <a className={className} href={href}>{label}</a>;
    return <button className={className} disabled={disabled} type="button" onClick={onClick}>{label}</button>;
}
function copyText(value: string) {
    if (!value || typeof navigator === "undefined")
        return;
    void navigator.clipboard?.writeText(value);
}
function RatingBadge({ rating, score }: {
    rating: string;
    score?: number;
}) {
    const tone = rating === "A" ? "border-success/40 bg-success/10 text-success" :
        rating === "B" ? "border-primary/40 bg-primary/10 text-primary" :
            rating === "C" ? "border-warning/40 bg-warning/10 text-warning" :
                "border-danger/40 bg-danger/10 text-danger";
    return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{rating}{score ? ` (${score}/100)` : ""}</span>;
}
type LedgerRow = {
    balance: number;
    credit: number;
    date: string;
    debit: number;
    note: string;
    reference: string;
    type: string;
};
function buildLedgerRows(orders: SupplierPurchaseOrder[], receivings: SupplierReceiving[], payments: SupplierPayment[]) {
    const rows = [
        ...orders.map((order) => ({ credit: 0, date: order.purchaseDate, debit: order.totalLak, note: "Purchase order placeholder", reference: order.purchaseNo, type: "PO" })),
        ...receivings.map((receiving) => ({ credit: 0, date: receiving.receivedDate, debit: 0, note: `${receiving.itemCount} items received`, reference: receiving.receiveNo, type: "Goods received" })),
        ...payments.map((payment) => ({ credit: payment.amountLak, date: payment.paymentDate, debit: 0, note: payment.note || "Supplier payment", reference: payment.paymentNo, type: "Payment" })),
    ].sort((left, right) => left.date.localeCompare(right.date));
    let balance = 0;
    return rows.map((row) => {
        balance += row.debit - row.credit;
        return { ...row, balance };
    });
}
function getManualRating(supplier: Supplier) {
    const match = supplier.notes.match(/Supplier rating:\s*([ABCD])/i);
    return match ? match[1].toUpperCase() : null;
}
function getAutoRating(supplier: Supplier) {
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
