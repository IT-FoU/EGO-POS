"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, PackagePlus, Plus, Save, Search, Trash2 } from "lucide-react";
import type { Product } from "@/features/products/types";
import type { CurrencyCode, Supplier } from "@/features/purchasing/types";
import type { Warehouse } from "@/features/inventory/types";
import { convertToLak, formatMoney } from "@/features/purchasing/format";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { createPurchaseOrderAction } from "@/features/purchasing/actions";
type DraftLine = {
    id: string;
    productId: string;
    productName: string;
    sku: string;
    barcode: string;
    unitName: string;
    quantity: number;
    unitCost: number;
    lotNumber: string;
    expiryDate: string;
};
const exchangeRates: Record<CurrencyCode, number> = {
    LAK: 1,
    THB: 750,
    USD: 22000,
};
export function PurchaseOrderForm({ products, suppliers, warehouses, }: {
    products: Product[];
    suppliers: Supplier[];
    warehouses: Warehouse[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
    const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
    const [currency, setCurrency] = useState<CurrencyCode>("LAK");
    const [exchangeRate, setExchangeRate] = useState(exchangeRates.LAK);
    const [paidAmount, setPaidAmount] = useState(0);
    const [productQuery, setProductQuery] = useState("");
    const [lines, setLines] = useState<DraftLine[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const filteredProducts = useMemo(() => {
        const normalized = productQuery.toLowerCase();
        return products.filter((product) => product.nameEn.toLowerCase().includes(normalized) ||
            product.sku.toLowerCase().includes(normalized) ||
            product.barcode.includes(productQuery));
    }, [productQuery, products]);
    const subtotal = lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
    const subtotalLak = convertToLak(subtotal, exchangeRate);
    const paidLak = convertToLak(paidAmount, exchangeRate);
    const unpaidLak = Math.max(subtotalLak - paidLak, 0);
    function selectCurrency(nextCurrency: CurrencyCode) {
        setCurrency(nextCurrency);
        setExchangeRate(exchangeRates[nextCurrency]);
    }
    function addProduct(product: Product) {
        const unit = product.units[0];
        setLines((current) => [
            ...current,
            {
                id: `line-${Date.now()}-${product.id}`,
                productId: product.id,
                productName: product.nameEn,
                sku: product.sku,
                barcode: product.barcode,
                unitName: unit?.unitName ?? "Piece",
                quantity: 1,
                unitCost: currency === "LAK" ? product.costPriceLak : Math.round(product.costPriceLak / exchangeRate),
                lotNumber: "",
                expiryDate: "",
            },
        ]);
    }
    function updateLine(lineId: string, patch: Partial<DraftLine>) {
        setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
    }
    function removeLine(lineId: string) {
        setLines((current) => current.filter((line) => line.id !== lineId));
    }
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (lines.length === 0) {
            setMessage(t("ui.add.at.least.one.product.line"));
            return;
        }
        startTransition(async () => {
            const result = await createPurchaseOrderAction({
                currency,
                exchangeRate,
                items: lines.map((line) => ({
                    expiryDate: line.expiryDate || undefined,
                    lotNumber: line.lotNumber || undefined,
                    productId: line.productId,
                    quantity: line.quantity,
                    unitCost: line.unitCost,
                })),
                paidAmount,
                supplierId,
                warehouseId,
            });
            if (!result.ok) {
                setMessage(result.error ?? t("ui.purchase.order.save.failed"));
                return;
            }
            setMessage(t("ui.purchase.order.saved.successfully"));
            router.refresh();
            router.push("/purchasing");
        });
    }
    return (<form className="flex min-w-0 flex-col gap-6 overflow-x-hidden" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/purchasing">
          <ArrowLeft aria-hidden="true"/>
          Back to purchasing
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <PackagePlus aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">New purchase order</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.create.a.purchase.order.with.supplier.wareho")}</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="submit" disabled={isPending}>
            <Save aria-hidden="true"/>
            {isPending ? t("ui.saving") : "Save"}
          </button>
        </div>
      </section>

      {message ? <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Order details</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Supplier">
                <select className="field-input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  {suppliers.map((supplier) => (<option key={supplier.id} value={supplier.id}>{supplier.name}</option>))}
                </select>
              </Field>
              <WarehouseSelector selectedWarehouseId={warehouseId} warehouses={warehouses} onChange={setWarehouseId}/>
              <Field label="Cost currency">
                <select className="field-input" value={currency} onChange={(event) => selectCurrency(event.target.value as CurrencyCode)}>
                  <option value="LAK">LAK</option>
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label="Exchange rate to LAK">
                <input className="field-input" type="number" min="1" value={exchangeRate} onChange={(event) => setExchangeRate(Number(event.target.value))}/>
              </Field>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Product search</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("ui.search.by.product.name.sku.or.barcode")}</p>
              </div>
              <label className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
                <input className="field-input pl-10" placeholder="Search products" value={productQuery} onChange={(event) => setProductQuery(event.target.value)}/>
              </label>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
              {filteredProducts.map((product) => (<button className="min-w-0 rounded-md border border-border p-4 text-left transition hover:border-primary" key={product.id} type="button" onClick={() => addProduct(product)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold" title={product.nameEn}>{product.nameEn}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground" title={product.nameLo}>{product.nameLo}</div>
                    </div>
                    <Plus aria-hidden="true" className="text-primary"/>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Barcode aria-hidden="true"/>
                    {product.barcode} / {product.sku}
                  </div>
                </button>))}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Order lines</h2>
            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Product</th>
                    <th className="px-3 py-3">Unit</th>
                    <th className="px-3 py-3">Qty</th>
                    <th className="px-3 py-3">Unit cost</th>
                    <th className="px-3 py-3">Lot number</th>
                    <th className="px-3 py-3">Expiry date</th>
                    <th className="px-3 py-3">Line total</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (<tr className="border-b border-border last:border-b-0" key={line.id}>
                      <td className="px-3 py-3">
                        <div className="font-semibold">{line.productName}</div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{line.sku}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select className="field-input h-10" value={line.unitName} onChange={(event) => updateLine(line.id, { unitName: event.target.value })}>
                          <option>Piece</option>
                          <option>Pack</option>
                          <option>Carton</option>
                          <option>Bag</option>
                          <option>Bottle</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input className="field-input h-10" type="number" min="1" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })}/>
                      </td>
                      <td className="px-3 py-3">
                        <input className="field-input h-10" type="number" min="0" value={line.unitCost} onChange={(event) => updateLine(line.id, { unitCost: Number(event.target.value) })}/>
                      </td>
                      <td className="px-3 py-3">
                        <input className="field-input h-10 font-mono" value={line.lotNumber} onChange={(event) => updateLine(line.id, { lotNumber: event.target.value })} placeholder="LOT-001"/>
                      </td>
                      <td className="px-3 py-3">
                        <input className="field-input h-10" type="date" value={line.expiryDate} onChange={(event) => updateLine(line.id, { expiryDate: event.target.value })}/>
                      </td>
                      <td className="px-3 py-3 font-semibold">{formatMoney(line.quantity * line.unitCost, currency)}</td>
                      <td className="px-3 py-3 text-right">
                        <button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-danger transition hover:border-danger" type="button" onClick={() => removeLine(line.id)} aria-label="Remove line">
                          <Trash2 aria-hidden="true"/>
                        </button>
                      </td>
                    </tr>))}
                  {lines.length === 0 ? (<tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>{t("ui.add.products.to.build.the.purchase.order")}</td>
                    </tr>) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="min-w-0 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Payment summary</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label="Subtotal" value={formatMoney(subtotal, currency)}/>
            <Summary label="Subtotal in LAK" value={formatMoney(subtotalLak, "LAK")}/>
            <div>
              <dt className="text-muted-foreground">{t("ui.paid.amount")}{currency})</dt>
              <dd className="mt-1">
                <input className="field-input" type="number" min="0" value={paidAmount} onChange={(event) => setPaidAmount(Number(event.target.value))}/>
              </dd>
            </div>
            <Summary label="Paid in LAK" value={formatMoney(paidLak, "LAK")}/>
            <Summary label="Unpaid in LAK" value={formatMoney(unpaidLak, "LAK")}/>
            <Summary label="Mode" value="Real database"/>
          </dl>
        </aside>
      </section>
    </form>);
}
function Field({ children, label }: {
    children: React.ReactNode;
    label: string;
}) {
    return <label className="flex flex-col gap-2 text-sm font-medium">{label}{children}</label>;
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>);
}
