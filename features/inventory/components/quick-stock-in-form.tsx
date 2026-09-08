"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, FileDown, Printer, Search } from "lucide-react";
import { stockInAction } from "@/features/inventory/actions";
import { InventoryImage } from "@/features/inventory/components/inventory-image";
import type { InventoryItem, Warehouse } from "@/features/inventory/types";
import type { Supplier } from "@/features/suppliers/types";
import { localizedProductName } from "@/features/pos/product-display-name";
import { fillInventoryCopy, inventoryPaymentLabel, localizeInventoryError, tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

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
function itemProductName(item: InventoryItem, locale: SupportedLocale) {
    return localizedProductName({ nameEn: item.productNameEn, nameLo: item.productNameLo }, locale);
}
export function QuickStockInForm({ items, suppliers, warehouses, locale: localeProp, }: {
    items: InventoryItem[];
    suppliers: Supplier[];
    warehouses: Warehouse[];
    locale?: SupportedLocale;
}) {
    const locale = useAppLocale(localeProp);
    const t = (key: string) => tInventory(key, locale);
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
    const [stockInNo, setStockInNo] = useState("");
    const [lotNumber, setLotNumber] = useState("");
    const [expiryDate, setExpiryDate] = useState("");
    const [note, setNote] = useState("");
    const [photoNames, setPhotoNames] = useState<string[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [isPending, startTransition] = useTransition();
    useEffect(() => {
        setStockInNo((current) => current || generateClientStockInNo());
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
            return { label: t("matchedUnitBarcode"), value: `${matchingUnit.unitName}: ${matchingUnit.barcode}` };
        }
        if (matchingUnit) {
            return { label: t("matchedUnit"), value: matchingUnit.unitName };
        }
        if (item.barcode?.toLowerCase() === term) {
            return { label: t("matchedMainBarcode"), value: item.barcode };
        }
        if (item.productCode?.toLowerCase() === term) {
            return { label: t("matchedProductCode"), value: item.productCode };
        }
        if (item.sku?.toLowerCase() === term) {
            return { label: t("matchedSku"), value: item.sku };
        }
        return { label: t("receivingCheck"), value: t("checkUnitBeforeReceiving") };
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
            return t("productRequired");
        if (!warehouseId)
            return t("warehouseRequired");
        if (!selectedUnit)
            return t("receivingUnitRequired");
        if (enteredQty <= 0)
            return t("quantityMustBePositive");
        if (cost < 0)
            return t("costMustBeZeroOrGreater");
        if (!paymentStatus)
            return t("paymentStatusRequired");
        if (!stockInNo.trim())
            return t("stockInNumberRequired");
        if (selectedItem.expiryTrackingEnabled && !expiryDate)
            return t("expiryRequired");
        if (selectedItem.expiryTrackingEnabled && !lotNumber.trim())
            return t("lotRequired");
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
            setError(validationError || t("missingStockInDetails"));
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
                setError(localizeInventoryError(result.error ?? "Quick Stock In failed.", locale));
                return;
            }
            setMessage(fillInventoryCopy(t("quickStockInSaved"), { no: stockInNo }));
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
              {t("backToInventory")}
            </Link>
            <h1 className="mt-3 text-2xl font-semibold">{t("quickStockIn")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("quickStockInSubtitle")}</p>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
            <div className="text-muted-foreground">{t("stockInNo")}</div>
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
              {t("printComingSoon")}
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 font-semibold opacity-60" type="button" disabled>
              <FileDown className="size-4" aria-hidden="true"/>
              {t("downloadPdfComingSoon")}
            </button>
          </div>
        </div>) : null}

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("scanOrSearch")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("searchByBarcodeHint")}</p>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true"/>
            <input aria-label={t("scanOrSearch")} className="h-11 flex-1 bg-transparent text-sm outline-none" placeholder={t("searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </div>
          {barcodeQuery ? (<p className="mt-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary">{t("receivedFromCreateProduct")}</p>) : null}
          <div className="mt-4 text-sm font-semibold">{t("productMatchOrNotFound")}</div>
          <div className="mt-4 grid max-h-[430px] gap-3 overflow-y-auto pr-1 md:grid-cols-2">
            {showProductNotFound ? (<div className="rounded-lg border border-dashed border-warning/40 bg-warning/10 p-4 md:col-span-2">
                <div className="text-sm font-semibold text-foreground">{t("productNotFound")}</div>
                <div className="mt-1 font-mono text-sm text-warning">{searchedValue}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("productNotFoundHint")}</p>
                <Link className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href={createProductHref}>
                  {t("createProduct")}
                </Link>
              </div>) : null}
            {filteredItems.map((item) => {
            const matchContext = getMatchContext(item);
            const productName = itemProductName(item, locale);
            return (<button className={`flex items-center gap-3 rounded-lg border p-3 text-left transition hover:border-primary ${selectedItemId === item.id ? "border-primary bg-primary/10" : "border-border bg-background"}`} key={item.id} type="button" onClick={() => selectItem(item)}>
                <InventoryImage imageKey={item.imageKey} label={productName}/>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{productName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{fillInventoryCopy(t("codeSkuBarcode"), { code: item.productCode || "-", sku: item.sku || "-", barcode: item.barcode || "-" })}</div>
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
          <h2 className="text-lg font-semibold">{t("receiveDetails")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("receiveDetailsIntro")}</p>
          {selectedItem ? (<div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background p-3">
              <InventoryImage imageKey={selectedItem.imageKey} label={itemProductName(selectedItem, locale)}/>
              <div>
                <div className="font-semibold">{itemProductName(selectedItem, locale)}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {fillInventoryCopy(t("currentStockPrefix"), { qty: formatQuantity(selectedItem.quantity, selectedItem.baseUnit) })}
                </div>
              </div>
            </div>) : (<div className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{t("selectProductBeforeDetails")}</div>)}

          <div className="mt-4 grid gap-4">
            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("receiveDetails")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("receiveDetailsHint")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm font-semibold">
                  {t("warehouse")}
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                    {warehouses.map((warehouse) => (<option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  {t("receivingUnit")}
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={selectedUnitId} onChange={(event) => selectUnit(event.target.value)}>
                    <option value="">{t("selectUnitEveryTime")}</option>
                    {receivingUnits.map((unit) => (<option key={unit.id} value={unit.id}>{unit.unitName}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  {t("quantity")}
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0"/>
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("supplierAndCost")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("supplierCostHint")}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  {t("supplier")}
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                    <option value="">{t("noSupplier")}</option>
                    {suppliers.map((supplier) => (<option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  {t("unitCost")}
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value.replace(/[^\d.]/g, ""))} placeholder="0"/>
                </label>
                <label className="text-sm font-semibold">
                  {t("paymentStatus")}
                  <select className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as "paid" | "credit")}>
                    <option value="paid">{t("paid")}</option>
                    <option value="credit">{t("credit")}</option>
                  </select>
                </label>
                <label className="text-sm font-semibold">{t("invoiceNo")}<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} placeholder="INV-2026-0618-001"/>
                </label>
                <label className="text-sm font-semibold md:col-span-2">{t("stockInNo")}<input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 font-mono text-sm" value={stockInNo} onChange={(event) => setStockInNo(event.target.value)}/>
                </label>
              </div>
              <label className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm font-semibold text-warning">
                <input className="mt-1 size-4" type="checkbox" checked={updateProductCost} onChange={(event) => setUpdateProductCost(event.target.checked)}/>
                <span>
                  {t("updateProductCost")}
                  <span className="mt-1 block text-xs font-normal leading-5">{t("updateProductCostHint")}</span>
                </span>
              </label>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("lotAndExpiry")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("lotExpiryHint")}</p>
              {selectedItem?.expiryTrackingEnabled ? (<p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">{t("lotRequiredNotice")}</p>) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm font-semibold">
                  {t("lotNumber")}
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="ABC240618"/>
                </label>
                <label className="text-sm font-semibold">
                  {t("expiryDate")}
                  <input className="mt-1 h-11 w-full rounded-md border border-border bg-background px-3 text-sm" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)}/>
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("conversionPreviewTitle")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {fillInventoryCopy(t("receivingConversion"), {
                    qty: enteredQty || 0,
                    unit: selectedUnit?.unitName ?? t("units"),
                    conv: conversionQty || 0,
                    base: formatQuantity(baseQtyAdded, selectedItem?.baseUnit ?? t("base")),
                })}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">{t("receivedQuantity")}</div>
                  <div className="mt-1 font-semibold">{enteredQty || 0} {selectedUnit?.unitName ?? t("units")}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("convertedBaseQuantity")}</div>
                  <div className="mt-1 font-semibold">{formatQuantity(baseQtyAdded, selectedItem?.baseUnit ?? t("base"))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("currentStock")}</div>
                  <div className="mt-1 font-semibold">{formatQuantity(currentStock, selectedItem?.baseUnit ?? t("base"))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{t("afterStock")}</div>
                  <div className="mt-1 text-xl font-bold text-success">{formatQuantity(afterStock, selectedItem?.baseUnit ?? t("base"))}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-muted-foreground">{t("totalCost")}</div>
                  <div className="mt-1 font-semibold">{formatLak(totalCost)}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Camera className="size-4" aria-hidden="true"/>
              {t("receivingPhotos")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("uploadReady")}</p>
            <input className="mt-3 text-sm" multiple type="file" accept={t("acceptImages")} onChange={(event) => setPhotoNames(Array.from(event.target.files ?? []).map((file) => file.name))}/>
            {photoNames.length ? <div className="mt-2 text-xs text-muted-foreground">{fillInventoryCopy(t("photosCount"), { count: photoNames.length })}{photoNames.join(", ")}</div> : null}
          </div>

          <label className="mt-4 block text-sm font-semibold">
            {t("note")}
            <textarea className="mt-1 min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("optionalReceivingNote")}/>
          </label>

          <div className="mt-5 flex justify-end gap-2">
            <Link className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold" href="/inventory">{t("cancel")}</Link>
            <button className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={handlePreview}>
              {t("previewConfirmation")}
            </button>
          </div>
        </section>
      </div>

      {isConfirming && selectedItem && selectedUnit ? (<section className="rounded-lg border border-primary/30 bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("previewConfirmation")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("previewConfirmationHint")}</p>
            </div>
            <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">{t("manualConfirmationRequired")}</div>
          </div>
          {updateProductCost ? (<p className="mt-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-warning">{t("updateCostEnabledWarning")}</p>) : null}
          <div className="mt-4 grid gap-4 text-sm xl:grid-cols-2">
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">{t("product")}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label={t("product")} value={itemProductName(selectedItem, locale)}/>
                <SummaryField label={t("stockInNo")} value={stockInNo}/>
                <SummaryField label={t("warehouse")} value={warehouses.find((warehouse) => warehouse.id === warehouseId)?.name ?? "-"}/>
                <SummaryField label={t("receivingUnit")} value={selectedUnit.unitName}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">{t("quantityAndConversion")}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label={t("enteredQuantity")} value={enteredQty.toLocaleString("en-US")}/>
                <SummaryField label={t("conversion")} value={`${enteredQty} x ${conversionQty}`}/>
                <SummaryField label={t("baseQuantityAdded")} value={formatQuantity(baseQtyAdded, selectedItem.baseUnit)}/>
                <SummaryField label={t("afterStock")} value={formatQuantity(afterStock, selectedItem.baseUnit)}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">{t("supplierAndCost")}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label={t("supplier")} value={selectedSupplier?.companyName ?? t("noSupplier")}/>
                <SummaryField label={t("paymentStatus")} value={inventoryPaymentLabel(paymentStatus, locale)}/>
                <SummaryField label={t("invoiceNo")} value={invoiceNo || "-"}/>
                <SummaryField label={t("unitCost")} value={formatLak(cost)}/>
                <SummaryField label={t("totalCost")} value={formatLak(totalCost)}/>
                <SummaryField label={t("updateProductCost")} value={updateProductCost ? t("yes") : t("no")}/>
              </div>
            </div>
            <div className="rounded-md border border-border bg-background p-3">
              <h3 className="text-sm font-semibold">{t("lotAndExpiry")}</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <SummaryField label={t("lotNumber")} value={lotNumber || "-"}/>
                <SummaryField label={t("expiryDate")} value={expiryDate || "-"}/>
                <SummaryField label={t("photosCountLabel")} value={String(photoNames.length)}/>
                <SummaryField label={t("note")} value={note || "-"}/>
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className="inline-flex h-11 items-center rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setIsConfirming(false)}>{t("cancel")}</button>
            <button className="inline-flex h-11 items-center rounded-md bg-success px-4 text-sm font-semibold text-success-foreground disabled:opacity-60" type="button" disabled={isPending} onClick={handleConfirm}>
              {isPending ? t("saving") : t("confirmStockIn")}
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
