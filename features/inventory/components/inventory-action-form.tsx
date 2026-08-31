"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, ClipboardCheck, PackagePlus, Save, SlidersHorizontal } from "lucide-react";
import type { InventoryItem, Warehouse } from "@/features/inventory/types";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { stockAdjustmentAction, stockCountAction, stockInAction } from "@/features/inventory/actions";
import {
    STOCK_COUNT_CHANGED_MESSAGE,
    STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
} from "@/features/inventory/stock-count-errors";
type Mode = "stock-in" | "adjustment" | "count";
const modeConfig: Record<Mode, {
    title: string;
    subtitle: string;
    icon: typeof PackagePlus;
    quantityLabel: string;
    noteLabel: string;
}> = {
    "stock-in": {
        title: "Stock In",
        subtitle: t("ui.receive.products.into.a.selected.warehouse"),
        icon: PackagePlus,
        quantityLabel: "Quantity received",
        noteLabel: "Receiving note",
    },
    adjustment: {
        title: "Stock Adjustment",
        subtitle: t("ui.adjust.stock.for.damaged.expired.lost.or.cor"),
        icon: SlidersHorizontal,
        quantityLabel: "Adjustment quantity",
        noteLabel: "Adjustment reason",
    },
    count: {
        title: "Stock Count",
        subtitle: t("ui.record.counted.quantity.and.calculate.varian"),
        icon: ClipboardCheck,
        quantityLabel: "Counted quantity",
        noteLabel: "Count note",
    },
};
export function InventoryActionForm({ items, mode, warehouses, }: {
    items: InventoryItem[];
    mode: Mode;
    warehouses: Warehouse[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const config = modeConfig[mode];
    const Icon = config.icon;
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(warehouses[0]?.id ?? "all");
    const [selectedItemId, setSelectedItemId] = useState("");
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [quantity, setQuantity] = useState(0);
    const [message, setMessage] = useState<string | null>(null);
    const [messageKind, setMessageKind] = useState<"success" | "error">("success");
    const warehouseItems = useMemo(() => items.filter((item) => item.warehouseId === selectedWarehouseId), [items, selectedWarehouseId]);
    const selectedItem = warehouseItems.find((item) => item.id === selectedItemId);
    const receivingUnits = (selectedItem?.units ?? []).filter((unit) => unit.status !== "inactive" && (mode !== "stock-in" || unit.isPurchaseUnit || unit.isBaseUnit));
    const selectedUnit = receivingUnits.find((unit) => unit.id === selectedUnitId) ?? receivingUnits.find((unit) => unit.isBaseUnit) ?? receivingUnits[0];
    const baseQuantityPreview = quantity * (selectedUnit?.conversionQty ?? 1);
    const variance = selectedItem ? quantity - selectedItem.quantity : 0;
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!selectedItem) {
            setMessageKind("error");
            setMessage(t("ui.select.a.product.first"));
            return;
        }
        const formData = new FormData(event.currentTarget);
        const note = String(formData.get("note") ?? "").trim();
        if (mode === "adjustment" && !note) {
            setMessageKind("error");
            setMessage("Adjustment reason is required.");
            return;
        }
        const payload = {
            note: note || undefined,
            productId: selectedItem.productId,
            quantity,
            warehouseId: selectedWarehouseId,
        };
        startTransition(async () => {
            const result = mode === "stock-in"
                ? await stockInAction({ ...payload, unitId: selectedUnit?.id })
                : mode === "adjustment"
                    ? await stockAdjustmentAction({ ...payload, reason: note })
                    : await stockCountAction({
                        countedQuantity: quantity,
                        expectedSystemQuantity: selectedItem.quantity,
                        note: note || undefined,
                        productId: selectedItem.productId,
                        warehouseId: selectedWarehouseId,
                    });
            if (!result.ok) {
                const errorMessage = result.error ?? `${config.title} failed.`;
                setMessageKind("error");
                setMessage(
                    errorMessage === STOCK_COUNT_CHANGED_MESSAGE
                        ? t("ui.stock.count.changed")
                        : errorMessage === STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE
                            ? t("ui.stock.count.lot.unsupported")
                            : errorMessage,
                );
                if (mode === "count") {
                    router.refresh();
                }
                return;
            }
            setMessageKind("success");
            setMessage(`${config.title} saved successfully.`);
            router.refresh();
        });
    }
    return (<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/inventory">
          <ArrowLeft aria-hidden="true"/>
          Back to inventory
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Icon aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{config.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {config.subtitle}
            </p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" disabled={isPending} type="submit">
            <Save aria-hidden="true"/>
            {isPending ? t("ui.saving") : "Save"}
          </button>
        </div>
      </section>

      {message ? (<div className={messageKind === "error" ? "rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" : "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"}>
          {message}
        </div>) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Transaction details</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <WarehouseSelector selectedWarehouseId={selectedWarehouseId} warehouses={warehouses} onChange={(warehouseId) => {
            setSelectedWarehouseId(warehouseId);
            setSelectedItemId("");
            setSelectedUnitId("");
        }}/>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Product
              <select className="field-input" value={selectedItemId} onChange={(event) => {
            setSelectedItemId(event.target.value);
            setSelectedUnitId("");
        }} required>
                <option value="">Select product</option>
                {warehouseItems.map((item) => (<option value={item.id} key={item.id}>
                    {item.productNameEn} / {item.sku}
                  </option>))}
              </select>
            </label>
            {mode === "stock-in" ? (<label className="flex flex-col gap-2 text-sm font-medium">
                Receiving unit
                <select className="field-input" value={selectedUnit?.id ?? ""} onChange={(event) => setSelectedUnitId(event.target.value)} required>
                  {receivingUnits.map((unit) => (<option value={unit.id} key={unit.id}>
                      {unit.unitName} x {unit.conversionQty}
                    </option>))}
                </select>
              </label>) : null}
            <label className="flex flex-col gap-2 text-sm font-medium">
              Barcode / SKU
              <div className="relative">
                <Barcode aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                <input className="field-input pl-10 font-mono" value={selectedItem ? `${selectedItem.barcode} / ${selectedItem.sku}` : ""} readOnly placeholder="Select product to fill"/>
              </div>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {config.quantityLabel}
              <input className="field-input" type="number" min={mode === "adjustment" ? undefined : 0} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} required/>
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium md:col-span-2">
              {config.noteLabel}
              <textarea className="min-h-28 rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="note" placeholder="Add a short note for stock movement history"/>
            </label>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Preview</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Current quantity</dt>
              <dd className="mt-1 font-semibold">
                {selectedItem ? `${selectedItem.quantity} ${selectedItem.baseUnit}` : "Select product"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                {mode === "count" ? "Variance" : "New quantity preview"}
              </dt>
              <dd className="mt-1 font-semibold">
                {selectedItem
            ? mode === "count"
                ? `${variance > 0 ? "+" : ""}${variance} ${selectedItem.baseUnit}`
                : mode === "stock-in"
                    ? `${selectedItem.quantity + baseQuantityPreview} ${selectedItem.baseUnit}`
                    : `${selectedItem.quantity + quantity} ${selectedItem.baseUnit}`
            : "Select product"}
              </dd>
            </div>
            {mode === "stock-in" ? (<div>
                <dt className="text-muted-foreground">Conversion preview</dt>
                <dd className="mt-1 font-semibold">
                  {selectedItem && selectedUnit
                ? `${quantity} ${selectedUnit.unitName} x ${selectedUnit.conversionQty} = ${baseQuantityPreview} ${selectedItem.baseUnit}`
                : "Select product and unit"}
                </dd>
              </div>) : null}
            <div>
              <dt className="text-muted-foreground">Database status</dt>
              <dd className="mt-1 font-semibold text-success">Real database</dd>
            </div>
          </dl>
        </aside>
      </section>
    </form>);
}
