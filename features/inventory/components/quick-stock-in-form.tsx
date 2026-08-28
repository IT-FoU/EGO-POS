"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, FileDown, Printer, Search } from "lucide-react";
import { stockInAction } from "@/features/inventory/actions";
import { InventoryImage } from "@/features/inventory/components/inventory-image";
import type { InventoryItem, Warehouse } from "@/features/inventory/types";
import type { Supplier } from "@/features/suppliers/types";
type Unit = NonNullable<InventoryItem["units"]>[number];
function formatLak(value: number) {
    return `${Math.round(value).toLocaleString("en-US")} LAK`;
}
function formatQuantity(value: number, unit: string) {
    return `${Number(value.toFixed(3)).toLocaleString("en-US")} ${unit}`;
}
function generateClientStockInNo() {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const sequence = String((now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) % 10000).padStart(4, "0");
    return `SI-${datePart}-${sequence}`;
}
function readBarcodeQueryParam() {
    if (typeof window === "undefined") {
        return "";
    }
    return new URLSearchParams(window.location.search).get("barcode")?.trim() ?? "";
}
export function QuickStockInForm({ items, suppliers, warehouses, }: {
    items: InventoryItem[];
    suppliers: Supplier[];
    warehouses: Warehouse[];
}) {
    const [barcodeQuery, setBarcodeQuery] = useState("");
    const [query, setQuery] = useState("");
    const [selectedItemId, setSelectedItemId] = useState("");
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
    const [quantity, setQuantity] = useState("");
    const [unitCost, setUnitCost] = useState("");
    const [updateProductCost, setUpdateProductCost] = useState(false);
    const [supplierId, setSupplierId] = useState("");
    const [paymentStatus, setPaymentStatus] = useState<"paid" | "credit">("paid");
    const [invoiceNo, setInvoiceNo] = useState("");
    const [stockInNo, setStockInNo] = useState(generateClientStockInNo);
    const [lotNumber, setLotNumber] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [note, setNote] = useState("");
    const [photoNames, setPhotoNames] = useState<string[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useEffect(() => {
        const nextBarcodeQuery = readBarcodeQueryParam();
        if (!nextBarcodeQuery)
            return;
        setBarcodeQuery(nextBarcodeQuery);
        setQuery(nextBarcodeQuery);
        setSelectedItemId("");
        setSelectedUnitId("");
        setIsConfirming(false);
    }, []);
    const filteredItems = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) {
            return items.slice(0, 12);
        }
        const scored = items.map((item) => {
            const fields = [
                item.barcode,
                item.productCode,
                item.productNameEn,
                item.productNameLo,
                item.sku,
                ...((item.units ?? []).map((unit) => unit.barcode) ?? []),
                ...((item.units ?? []).map((unit) => unit.unitName) ?? []),
            ].filter(Boolean) as string[];
            const exact = fields.some((field) => field.toLowerCase() === term);
            const partial = fields.join(" ").toLowerCase().includes(term);
            return { exact, item, partial };
        }).filter((row) => row.exact || row.partial);
        scored.sort((left, right) => Number(right.exact) - Number(left.exact));
        return scored.slice(0, 20).map((row) => row.item);
    }, [items, query]);
    const searchedValue = query.trim();
    const showProductNotFound = searchedValue.length > 0 && filteredItems.length === 0;
    const createProductHref = `/products/new?barcode=${encodeURIComponent(searchedValue)}&from=inventory`;
    const selectedItem = items.find((item) => item.id === selectedItemId);
    const receivingUnits = useMemo(() => (selectedItem?.units ?? []).filter((unit) => unit.status === "active"), [selectedItem]);
    const selectedUnit = receivingUnits.find((unit) => unit.id === selectedUnitId);
    const enteredQty = Number(quantity) || 0;
    const conversionQty = selectedUnit?.conversionQty ?? 0;
    const baseQtyAdded = enteredQty * conversionQty;
    const currentStock = selectedItem?.quantity ?? 0;
    const afterStock = currentStock + baseQtyAdded;
    const cost = Number(unitCost) || 0;
    const totalCost = enteredQty * cost;
    const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
    function getMatchContext(item: InventoryItem) {
        const term = searchedValue.toLowerCase();
        if (!term) {
            return null;
        }
        const matchingUnit = (item.units ?? []).find((unit) => unit.barcode?.toLowerCase() === term || unit.unitName?.toLowerCase() === term);
        if (matchingUnit?.barcode?.toLowerCase() === term) {
            return { label: "Matched unit barcode", value: `${matchingUnit.unitName}: ${matchingUnit.barcode}` };
        }
        if (matchingUnit) {
            return { label: "Matched unit", value: matchingUnit.unitName };
        }
        if (item.barcode?.toLowerCase() === term) {
            return { label: "Matched main barcode", value: item.barcode };
        }
        if (item.productCode?.toLowerCase() === term) {
            return { label: "Matched product code", value: item.productCode };
        }
        if (item.sku?.toLowerCase() === term) {
            return { label: "Matched SKU", value: item.sku };
        }
        return { label: "Receiving check", value: "Check the unit before receiving stock." };
    }
    function selectItem(item: InventoryItem) {
        setSelectedItemId(item.id);
        setSelectedUnitId("");
        setUnitCost("");
        setIsConfirming(false);
        setError("");
        setMessage("");
    }
    function selectUnit(unitId: string) {
        setSelectedUnitId(unitId);
        const unit = receivingUnits.find((candidate) => candidate.id === unitId);
        setUnitCost(unit?.costPriceLak == null ? "" : String(unit.costPriceLak));
        setIsConfirming(false);
    }
    function validate() {
        if (!selectedItem)
            return t("ui.product.is.required");
        if (!warehouseId)
            return t("ui.warehouse.is.required");
        if (!selectedUnit)
            return t("ui.receiving.unit.is.required");
        if (enteredQty <= 0)
            return t("ui.quantity.must.be.greater.than.zero");
        if (cost < 0)
            return t("ui.cost.must.be.zero.or.greater");
        if (!paymentStatus)
            return t("ui.payment.status.is.required");
        if (!stockInNo.trim())
            return t("ui.stock.in.number.is.required");
        if (selectedItem.expiryTrackingEnabled && !expiryDate)
            return t("ui.expiry.date.is.required.for.this.product");
        if (selectedItem.expiryTrackingEnabled && !lotNumber.trim())
            return t("ui.lot.number.is.required.for.this.product");
        return "";
    }
    function handlePreview() {
        const validationError = validate();
        setError(validationError);
        setMessage("");
        setIsConfirming(!validationError);
    }
    function handleConfirm() {
        const validationError = validate();
        if (validationError || !selectedItem || !selectedUnit) {
            setError(validationError || t("ui.missing.stock.in.details"));
            return;
        }
        startTransition(async () => {
            setError("");
            setMessage("");
            const result = await stockInAction({
                expiryDate: expiryDate || null,
                invoiceNo: invoiceNo || null,
                lotNumber: lotNumber || null,
                note: note || null,
                paymentStatus,
                photos: photoNames,
                productId: selectedItem.productId,
                quantity: enteredQty,
                stockInNo,
                supplierId: supplierId || null,
                supplierName: selectedSupplier?.companyName ?? null,
                unitCostLak: cost,
                unitId: selectedUnit.id,
                updateProductCost,
                warehouseId,
            });
            if (!result.ok) {
                setError(result.error ?? t("ui.quick.stock.in.failed"));
                return;
            }
            setMessage(`Quick Stock In ${stockInNo} saved successfully.`);
            setIsConfirming(false);
            setQuantity("");
            setNote("");
            setPhotoNames([]);
            setStockInNo(generateClientStockInNo());
        });
    }
    return (<div className="flex flex-col gap-5">
      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" href="/inventory">
              <ArrowLeft className="size-4" aria-hidden="true"/>
              Back to inventory
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">Quick Stock In</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.receive.stock.quickly.with.unit.conversion.l")}</p>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <div className="text-muted-foreground">{t("ui.stock.in.no")}</div>
            <div className="font-mono font-semibold text-primary">{stockInNo}</div>
          </div>
        </div>
      </section>

      {message ? (<div className="flex flex-col gap-3 rounded-lg border border-success/30 bg-success/10 p-4 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 font-semibold text-success">
            <CheckCircle2 className="size-5" aria-hidden="true"/>
            {message}
          </div>
          <div className="flex gap-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 font-semibold opacity-60" type="button" disabled>
              <Printer className="size-4" aria-hidden="true"/>
              Print - Coming soon
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 font-semibold opacity-60" type="button" disabled>
              <FileDown className="size-4" aria-hidden="true"/>
              Download PDF - Coming soon
            </button>
          </div>
        </div>) : null}

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Scan or Search Product</h2>
          <p className="mt-1 text-sm text-muted-foreground">Search by barcode, product code, SKU, product name, or unit barcode.</p>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true"/>
            <input className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder={t("ui.search.barcode.unit.barcode.sku.product.name")} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </div>
          {barcodeQuery ? (<p className="mt-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">Received from Create Product. Review the matched product before adding stock.</p>) : null}
          <div className="mt-4 text-sm font-semibold">Product Match / Product Not Found</div>
          <div className="mt-4 grid max-h-[430px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {showProductNotFound ? (<div className="rounded-lg border border-dashed border-warning/40 bg-warning/10 p-4 md:col-span-2">
                <div className="text-sm font-semibold text-foreground">Product not found</div>
                <div className="mt-1 font-mono text-sm text-warning">{searchedValue}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">No stock can be received until this product exists. Create it first, then return to Inventory to receive stock.</p>
                <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href={createProductHref}>
                  Create Product
                </Link>
              </div>) : null}
            {filteredItems.map((item) => {
            const matchContext = getMatchContext(item);
            return (<button className={`flex items-center gap-3 rounded-lg border p-3 text-left transition hover:border-primary ${selectedItemId === item.id ? "border-primary bg-primary/10" : "border-border bg-background"}`} key={item.id} type="button" onClick={() => selectItem(item)}>
                <InventoryImage imageKey={item.imageKey} label={item.productNameEn}/>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{item.productNameEn || item.productNameLo}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Code: {item.productCode || "-"} - SKU: {item.sku || "-"} - Barcode: {item.barcode || "-"}</div>
                  {matchContext ? (<div className="mt-1 text-xs text-muted-foreground">{matchContext.label}: <span className="font-semibold text-foreground">{matchContext.value}</span></div>) : null}
                  <div className="mt-1 text-xs font-semibold text-primary">
                    {formatQuantity(item.quantity, item.baseUnit)}
                  </div>
                </div>
              </button>);
        })}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Receive Details</h2>
          <p className="mt-1 text-sm text-muted-foreground">Select a product, choose the receiving unit, then review the conversion before confirming stock in.</p>
          {selectedItem ? (<div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <InventoryImage imageKey={selectedItem.imageKey} label={selectedItem.productNameEn}/>
              <div>
                <div className="font-semibold">{selectedItem.productNameEn || selectedItem.productNameLo}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Current stock: {formatQuantity(selectedItem.quantity, selectedItem.baseUnit)}
                </div>
              </div>
            </div>) : (<div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Select a product before entering receiving details.</div>)}

          <div className="mt-4 grid gap-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Receive Details</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Choose the warehouse, receiving unit, and quantity. Nothing is saved until Confirm Stock In.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-semibold">
                  Warehouse
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    {warehouses.map((warehouse) => (<option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Receiving Unit
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={selectedUnitId} onChange={(event) => selectUnit(event.target.value)}>
                    <option value="">Select unit every time</option>
                    {receivingUnits.map((unit) => (<option key={unit.id} value={unit.id}>{unit.unitName}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Quantity
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0"/>
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Supplier & Cost</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Unit cost is used for this receiving record. Changing product cost is optional.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Supplier
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                    <option value="">No supplier</option>
                    {suppliers.map((supplier) => (<option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Unit Cost
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0"/>
                </label>
                <label className="text-sm font-semibold">
                  Payment Status
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as "paid" | "credit")}>
                    <option value="paid">Paid</option>
                    <option value="credit">Credit</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">{t("ui.invoice.no")}<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="INV-2026-0618-001"/>
                </label>
                <label className="text-sm font-semibold md:col-span-2">{t("ui.stock.in.no")}<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm" value={stockInNo} onChange={(event) => setStockInNo(event.target.value)}/>
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm font-semibold text-warning">
                <input className="mt-1 size-4" type="checkbox" checked={updateProductCost} onChange={(event) => setUpdateProductCost(event.target.checked)}/>
                <span>
                  Update Product Cost
                  <span className="mt-1 block text-xs font-normal leading-5">If enabled, this will update the saved product/unit cost after confirmation.</span>
                </span>
              </label>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Lot & Expiry</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Lot and expiry are used to track product batches. Some products may require lot number and expiry date before receiving.</p>
              {selectedItem?.expiryTrackingEnabled ? (<p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">This product requires lot number and expiry date.</p>) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  Lot Number
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="ABC240618"/>
                </label>
                <label className="text-sm font-semibold">
                  Expiry Date
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)}/>
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Conversion Preview</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Receiving {enteredQty || 0} {selectedUnit?.unitName ?? "units"} x {conversionQty || 0} = {formatQuantity(baseQtyAdded, selectedItem?.baseUnit ?? "Base")} added to base stock.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Received Quantity</div>
                  <div className="mt-1 font-semibold">{enteredQty || 0} {selectedUnit?.unitName ?? "units"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Converted Base Quantity</div>
                  <div className="mt-1 font-semibold">{formatQuantity(baseQtyAdded, selectedItem?.baseUnit ?? "Base")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Current Stock</div>
                  <div className="mt-1 font-semibold">{formatQuantity(currentStock, selectedItem?.baseUnit ?? "Base")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">After Stock</div>
                  <div className="mt-1 text-xl font-bold text-success">{formatQuantity(afterStock, selectedItem?.baseUnit ?? "Base")}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">Total Cost</div>
                  <div className="mt-1 font-semibold">{formatLak(totalCost)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Camera className="size-4" aria-hidden="true"/>
              Receiving Photos
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("ui.upload.ui.is.ready.storage.can.be.connected.")}</p>
            <input className="mt-3 text-sm" multiple type="file" accept={t("ui.image.png.image.jpeg.image.webp")} onChange={(event) => setPhotoNames(Array.from(event.target.files ?? []).map((file) => file.name))}/>
            {photoNames.length ? <div className="mt-2 text-xs text-muted-foreground">{photoNames.length}{t("ui.photo.s")}{photoNames.join(", ")}</div> : null}
          </div>

          <label className="mt-4 block text-sm font-semibold">
            Note
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional receiving note"/>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Link className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold" href="/inventory">Cancel</Link>
            <button className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={handlePreview}>
              Preview Confirmation
            </button>
          </div>
        </section>
      </div>

      {isConfirming && selectedItem && selectedUnit ? (<section className="rounded-lg border border-primary/30 bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Preview Confirmation</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review these details before running Confirm Stock In. Nothing has been saved yet.</p>
            </div>
            <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">Manual confirmation required</div>
          </div>
          {updateProductCost ? (<p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">Update Product Cost is enabled. This will update product/unit cost after confirmation.</p>) : null}
          <div className="mt-4 grid gap-4 text-sm xl:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">Product</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label="Product" value={selectedItem.productNameEn || selectedItem.productNameLo}/>
                <SummaryField label={t("ui.stock.in.no")} value={stockInNo}/>
                <SummaryField label="Warehouse" value={warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "-"}/>
                <SummaryField label="Receiving Unit" value={selectedUnit.unitName}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">Quantity & Conversion</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label="Entered Quantity" value={enteredQty.toLocaleString("en-US")}/>
                <SummaryField label="Conversion" value={`${enteredQty} x ${conversionQty}`}/>
                <SummaryField label="Base Quantity Added" value={formatQuantity(baseQtyAdded, selectedItem.baseUnit)}/>
                <SummaryField label="After Stock" value={formatQuantity(afterStock, selectedItem.baseUnit)}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">Supplier & Cost</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label="Supplier" value={selectedSupplier?.companyName ?? "No supplier"}/>
                <SummaryField label="Payment Status" value={paymentStatus}/>
                <SummaryField label={t("ui.invoice.no")} value={invoiceNo || "-"}/>
                <SummaryField label="Unit Cost" value={formatLak(cost)}/>
                <SummaryField label="Total Cost" value={formatLak(totalCost)}/>
                <SummaryField label="Update Product Cost" value={updateProductCost ? "Yes" : "No"}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">Lot & Expiry</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label="Lot Number" value={lotNumber || "-"}/>
                <SummaryField label="Expiry Date" value={expiryDate || "-"}/>
                <SummaryField label="Photos Count" value={String(photoNames.length)}/>
                <SummaryField label="Note" value={note || "-"}/>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setIsConfirming(false)}>Cancel</button>
            <button className="inline-flex h-11 items-center rounded-md bg-success px-4 text-sm font-semibold text-success-foreground disabled:opacity-60" type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending ? t("ui.saving") : "Confirm Stock In"}
            </button>
          </div>
        </section>) : null}
    </div>);
}

function SummaryField({ label, value }: { label: string; value: string }) {
    return (<div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>);
}
