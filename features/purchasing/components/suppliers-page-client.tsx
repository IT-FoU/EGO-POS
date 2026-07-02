"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState } from "react";
import { Mail, Phone, Search, Truck } from "lucide-react";
import type { PurchaseOrder, Supplier, SupplierPayable } from "@/features/purchasing/types";
import { formatMoney } from "@/features/purchasing/format";
import { PurchaseStatusBadge, SupplierStatusBadge } from "@/features/purchasing/components/purchasing-status";
import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readStringFromStorage } from "@/lib/demo/storage";
export function SuppliersPageClient({ suppliers, purchaseOrders, payables, }: {
    suppliers: Supplier[];
    purchaseOrders: PurchaseOrder[];
    payables: SupplierPayable[];
}) {
    const [query, setQuery] = useState("");
    const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id ?? "");
    const [locale, setLocale] = useState<"en" | "th">("en");
    useEffect(() => {
        const readLocale = () => {
            const storedLocale = readStringFromStorage(DemoStorageKeys.locale);
            setLocale(storedLocale === "th" ? "th" : "en");
        };
        readLocale();
        window.addEventListener("storage", readLocale);
        return () => window.removeEventListener("storage", readLocale);
    }, []);
    const filteredSuppliers = useMemo(() => {
        const normalized = query.toLowerCase();
        return suppliers.filter((supplier) => supplier.name.toLowerCase().includes(normalized) ||
            supplier.supplierCode.toLowerCase().includes(normalized) ||
            supplier.phone.toLowerCase().includes(normalized));
    }, [query, suppliers]);
    const selectedSupplier = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? suppliers[0];
    const supplierOrders = purchaseOrders.filter((order) => order.supplierId === selectedSupplier?.id);
    const supplierPayables = payables.filter((payable) => payable.supplierId === selectedSupplier?.id);
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Truck aria-hidden="true"/>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">Supplier Management</p>
            <h1 className="mt-2 text-3xl font-semibold">{locale === "th" ? "Suppliers" : "Suppliers"}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.supplier.list.and.detail.summary.with.purcha")}</p>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Supplier list</h2>
            <SupplierStatusBadge status="active"/>
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
            <input className="field-input pl-10" placeholder="Search supplier" value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <div className="mt-4 flex flex-col gap-3">
            {filteredSuppliers.map((supplier) => {
            const selected = supplier.id === selectedSupplier?.id;
            return (<button className={selected
                    ? "rounded-md border border-primary bg-primary/10 p-4 text-left"
                    : "rounded-md border border-border p-4 text-left transition hover:border-primary"} key={supplier.id} type="button" onClick={() => setSelectedSupplierId(supplier.id)}>
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold" title={supplier.name}>{supplier.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{supplier.supplierCode}</div>
                    </div>
                    <div>
                      <SupplierStatusBadge status={supplier.status}/>
                    </div>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">Outstanding</div>
                  <div className="break-words font-semibold">{formatMoney(supplier.outstandingBalanceLak, "LAK")}</div>
                </button>);
        })}
          </div>
        </div>

        {selectedSupplier ? (<div className="flex min-w-0 flex-col gap-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h2 className="break-words text-2xl font-semibold">{selectedSupplier.name}</h2>
                  <p className="mt-1 break-words text-sm text-muted-foreground">{selectedSupplier.address}</p>
                </div>
                <SupplierStatusBadge status={selectedSupplier.status}/>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <Metric label="Credit limit" value={formatMoney(selectedSupplier.creditLimitLak, "LAK")}/>
                <Metric label="Outstanding balance" value={formatMoney(selectedSupplier.outstandingBalanceLak, "LAK")}/>
                <Metric label="Open orders" value={String(supplierOrders.length)}/>
              </div>
              <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Phone aria-hidden="true" className="shrink-0"/>
                  <span className="truncate">{selectedSupplier.phone}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <Mail aria-hidden="true" className="shrink-0"/>
                  <span className="truncate">{selectedSupplier.email}</span>
                </div>
              </div>
              <p className="mt-5 rounded-md border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                {selectedSupplier.note}
              </p>
            </section>

            <section className="grid min-w-0 gap-6 lg:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold">Purchase orders</h3>
                <div className="mt-4 flex flex-col gap-3">
                  {supplierOrders.map((order) => (<div className="rounded-md border border-border p-3" key={order.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-sm font-semibold">{order.purchaseNo}</span>
                        <PurchaseStatusBadge status={order.status}/>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {order.warehouseName} - {formatMoney(order.subtotal, order.currency)}
                      </div>
                    </div>))}
                  {supplierOrders.length === 0 ? <p className="text-sm text-muted-foreground">{t("ui.no.purchase.orders.found")}</p> : null}
                </div>
              </div>
              <div className="min-w-0 rounded-lg border border-border bg-card p-5">
                <h3 className="text-lg font-semibold">Credit summary</h3>
                <div className="mt-4 flex flex-col gap-3">
                  {supplierPayables.map((payable) => (<div className="rounded-md border border-border p-3" key={payable.id}>
                      <div className="font-mono text-sm font-semibold">{payable.purchaseNo}</div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                        <Metric label="Paid" value={formatMoney(payable.paidAmountLak, "LAK")}/>
                        <Metric label="Unpaid" value={formatMoney(payable.balanceAmountLak, "LAK")}/>
                      </div>
                    </div>))}
                  {supplierPayables.length === 0 ? <p className="text-sm text-muted-foreground">{t("ui.no.supplier.credit.found")}</p> : null}
                </div>
              </div>
            </section>
          </div>) : null}
      </section>
    </div>);
}
function Metric({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div className="min-w-0 rounded-md border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-semibold">{value}</div>
    </div>);
}
