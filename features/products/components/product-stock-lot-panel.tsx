"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adjustProductStockAction,
  loadProductStockSnapshotAction,
  stockInAction,
} from "@/features/inventory/actions";
import { StockMovementHistory } from "@/features/inventory/components/stock-movement-history";
import {
  STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
  STOCK_RESERVED_FLOOR_MESSAGE,
} from "@/features/inventory/stock-count-errors";
import type { ProductStockSnapshot } from "@/features/inventory/types";
import { ProductSmallModal } from "@/features/products/components/product-small-modal";
import type { ProductUnit } from "@/features/products/types";
import {
  displayProductUnitName,
  tProducts,
} from "@/lib/i18n/products-copy";
import {
  inventoryMovementLabel,
  localizeInventoryError,
  tInventory,
} from "@/lib/i18n/inventory-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type DialogMode = "add" | "adjust" | "lots" | "history" | null;

function qtyLabel(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

export function ProductStockLotPanel({
  canAddStock,
  canAdjustStock,
  productId,
  snapshot: snapshotProp,
  units,
}: {
  canAddStock: boolean;
  canAdjustStock: boolean;
  productId: string;
  snapshot: ProductStockSnapshot | null;
  units: ProductUnit[];
}) {
  const router = useRouter();
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const ti = (key: string) => tInventory(key, locale);
  const [isPending, startTransition] = useTransition();
  const [snapshot, setSnapshot] = useState(snapshotProp);
  useEffect(() => {
    setSnapshot(snapshotProp);
  }, [snapshotProp]);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"success" | "error">("success");
  const warehouses = snapshot?.warehouses ?? [];
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.warehouseId ?? "");
  const selected = warehouses.find((row) => row.warehouseId === warehouseId) ?? warehouses[0];
  const activeUnits = units.filter((unit) => (unit.status ?? "active") !== "inactive");
  const defaultUnit = activeUnits.find((unit) => unit.isPurchaseUnit) ?? activeUnits.find((unit) => unit.isBaseUnit) ?? activeUnits[0];
  const [unitId, setUnitId] = useState(defaultUnit?.id ?? "");
  const selectedUnit = activeUnits.find((unit) => unit.id === unitId) ?? defaultUnit;
  const conversionQty = Math.max(Number(selectedUnit?.conversionQty ?? 1), 1);
  const [quantity, setQuantity] = useState(0);
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [costLak, setCostLak] = useState(Number(selectedUnit?.costPriceLak ?? 0));
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const hasLots = (selected?.lots.length ?? 0) > 0;
  const convertedBase = Math.max(quantity, 0) * conversionQty;
  const adjustmentDelta = selected ? convertedBase - selected.onHand : 0;

  const lotStatusLabel = useMemo(
    () => ({
      active: t("lotStatusActive"),
      empty: t("lotStatusEmpty"),
      expired: t("lotStatusExpired"),
    }),
    [locale],
  );

  function resetDialogFields() {
    setQuantity(0);
    setLotNumber("");
    setExpiryDate("");
    setCostLak(Number(selectedUnit?.costPriceLak ?? 0));
    setNote("");
    setReason("");
    setUnitId(defaultUnit?.id ?? "");
  }

  function openDialog(mode: DialogMode) {
    resetDialogFields();
    setMessage(null);
    setDialog(mode);
  }

  function localizeError(errorMessage: string) {
    if (errorMessage === STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE) return ti("stockCountLotUnsupported");
    if (errorMessage === STOCK_RESERVED_FLOOR_MESSAGE) return ti("stockReservedFloor");
    return localizeInventoryError(errorMessage, locale);
  }

  async function refreshSnapshot() {
    const result = await loadProductStockSnapshotAction(productId);
    if (result.ok && result.data) {
      setSnapshot(result.data);
    }
    router.refresh();
  }

  function submitAddStock() {
    if (!selected || !canAddStock) return;
    if (!(quantity > 0)) {
      setMessageKind("error");
      setMessage(ti("quantityMustBePositive"));
      return;
    }
    startTransition(async () => {
      const result = await stockInAction({
        expiryDate: expiryDate || null,
        lotNumber: lotNumber.trim() || null,
        note: note.trim() || "Add stock from product edit",
        productId,
        quantity,
        unitCostLak: costLak,
        unitId: selectedUnit?.id ?? null,
        warehouseId: selected.warehouseId,
      });
      if (!result.ok) {
        setMessageKind("error");
        setMessage(localizeError(result.error ?? ti("stockInFailed")));
        return;
      }
      setMessageKind("success");
      setMessage(t("addStockSaved"));
      setDialog(null);
      await refreshSnapshot();
    });
  }

  function submitAdjustStock() {
    if (!selected || !canAdjustStock) return;
    if (!reason.trim()) {
      setMessageKind("error");
      setMessage(ti("adjustmentReasonRequired"));
      return;
    }
    if (quantity < 0) {
      setMessageKind("error");
      setMessage(ti("quantityMustBePositive"));
      return;
    }
    if (hasLots) {
      setMessageKind("error");
      setMessage(ti("stockCountLotUnsupported"));
      return;
    }
    startTransition(async () => {
      const result = await adjustProductStockAction({
        countedQuantity: quantity,
        expectedSystemQuantity: selected.onHand,
        productId,
        reason: reason.trim(),
        unitId: selectedUnit?.id ?? null,
        warehouseId: selected.warehouseId,
      });
      if (!result.ok) {
        setMessageKind("error");
        setMessage(localizeError(result.error ?? ti("countFailed")));
        return;
      }
      setMessageKind("success");
      setMessage(t("adjustStockSaved"));
      setDialog(null);
      await refreshSnapshot();
    });
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5" data-section="stock-lot-tracking">
      <div>
        <h2 className="text-lg font-semibold">{t("stockLotTracking")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("stockLotTrackingHint")}</p>
      </div>

      {message ? (
        <div
          className={
            messageKind === "success"
              ? "mt-4 rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
              : "mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          }
          role={messageKind === "success" ? "status" : "alert"}
        >
          {message}
        </div>
      ) : null}

      {warehouses.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{ti("noInventory")}</p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <label className="grid gap-1 text-sm font-medium">
              {ti("warehouse")}
              <select
                className="field-input"
                value={selected?.warehouseId ?? ""}
                onChange={(event) => setWarehouseId(event.target.value)}
              >
                {warehouses.map((warehouse) => (
                  <option key={warehouse.warehouseId} value={warehouse.warehouseId}>
                    {warehouse.warehouseName}
                  </option>
                ))}
              </select>
            </label>
            <StockMetric label={t("stockOnHand")} value={qtyLabel(selected?.onHand ?? 0)} />
            <StockMetric label={t("stockReserved")} value={qtyLabel(selected?.reserved ?? 0)} />
            <StockMetric label={t("stockAvailable")} value={qtyLabel(selected?.available ?? 0)} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {canAddStock ? (
              <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => openDialog("add")}>
                {t("addStock")}
              </button>
            ) : null}
            {canAdjustStock ? (
              <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => openDialog("adjust")}>
                {t("adjustStock")}
              </button>
            ) : null}
            <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => openDialog("lots")}>
              {t("manageLots")}
            </button>
            <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => openDialog("history")}>
              {t("viewStockHistory")}
            </button>
          </div>
          {!canAddStock && !canAdjustStock ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("stockActionsNeedPermission")}</p>
          ) : null}

          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">{ti("lotNumber")}</th>
                  <th className="px-3 py-3 text-right">{ti("quantity")}</th>
                  <th className="px-3 py-3">{ti("expiryDate")}</th>
                  <th className="px-3 py-3">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {(selected?.lots.length ?? 0) === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground" colSpan={4}>{t("noLots")}</td>
                  </tr>
                ) : selected?.lots.map((lot) => (
                  <tr className="border-b border-border last:border-b-0" key={lot.id}>
                    <td className="px-3 py-3 font-mono text-xs">{lot.lotNumber || "—"}</td>
                    <td className="px-3 py-3 text-right">{qtyLabel(lot.quantity)}</td>
                    <td className="px-3 py-3">{lot.expiryDate || "—"}</td>
                    <td className="px-3 py-3">{lotStatusLabel[lot.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {dialog === "add" && selected ? (
        <ProductSmallModal
          closeOnBackdrop
          closeOnEscape
          footer={
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setDialog(null)}>{t("cancel")}</button>
              <button className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={isPending} type="button" onClick={submitAddStock}>
                {isPending ? t("saving") : t("addStock")}
              </button>
            </div>
          }
          onClose={() => setDialog(null)}
          size="md"
          title={t("addStock")}
        >
          <div className="grid gap-3">
            <Field label={ti("warehouse")}><div className="field-input flex items-center">{selected.warehouseName}</div></Field>
            <Field label={ti("unit")}>
              <select className="field-input" value={selectedUnit?.id ?? ""} onChange={(event) => setUnitId(event.target.value)}>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{displayProductUnitName(unit.unitName)}</option>
                ))}
              </select>
            </Field>
            <Field label={ti("quantityReceived")}>
              <input className="field-input" min={0} type="number" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value) || 0)} />
            </Field>
            <Field label={t("convertedBaseQty")}>
              <div className="field-input flex items-center">{qtyLabel(convertedBase)}</div>
            </Field>
            <Field label={t("lotNumber")}>
              <input className="field-input" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} />
            </Field>
            <Field label={t("expiryDate")}>
              <input className="field-input" type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} />
            </Field>
            <Field label={t("costLak")}>
              <input className="field-input" min={0} type="number" value={costLak || ""} onChange={(event) => setCostLak(Number(event.target.value) || 0)} />
            </Field>
            <Field label={t("note")}>
              <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm" value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
          </div>
        </ProductSmallModal>
      ) : null}

      {dialog === "adjust" && selected ? (
        <ProductSmallModal
          closeOnBackdrop
          closeOnEscape
          description={hasLots ? ti("stockCountLotUnsupported") : undefined}
          footer={
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setDialog(null)}>{t("cancel")}</button>
              <button className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={isPending || hasLots} type="button" onClick={submitAdjustStock}>
                {isPending ? t("saving") : t("adjustStock")}
              </button>
            </div>
          }
          onClose={() => setDialog(null)}
          size="md"
          title={t("adjustStock")}
        >
          <div className="grid gap-3">
            <StockMetric label={t("stockOnHand")} value={qtyLabel(selected.onHand)} />
            <StockMetric label={t("stockReserved")} value={qtyLabel(selected.reserved)} />
            <Field label={ti("unit")}>
              <select className="field-input" value={selectedUnit?.id ?? ""} onChange={(event) => setUnitId(event.target.value)}>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>{displayProductUnitName(unit.unitName)}</option>
                ))}
              </select>
            </Field>
            <Field label={t("actualQuantity")}>
              <input className="field-input" min={0} type="number" value={quantity || ""} onChange={(event) => setQuantity(Number(event.target.value) || 0)} />
            </Field>
            <StockMetric label={t("convertedBaseQty")} value={qtyLabel(convertedBase)} />
            <StockMetric label={t("adjustmentPreview")} value={`${adjustmentDelta > 0 ? "+" : ""}${qtyLabel(adjustmentDelta)}`} />
            <Field label={ti("adjustmentReason")}>
              <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm" required value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
        </ProductSmallModal>
      ) : null}

      {dialog === "lots" ? (
        <ProductSmallModal
          closeOnBackdrop
          closeOnEscape
          footer={
            <div className="flex justify-end">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setDialog(null)}>{t("close")}</button>
            </div>
          }
          onClose={() => setDialog(null)}
          size="md"
          title={t("manageLots")}
        >
          <p className="text-sm leading-6 text-muted-foreground">{t("lotsViewOnly")}</p>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{ti("lotNumber")}</th>
                  <th className="px-3 py-2 text-right">{ti("quantity")}</th>
                  <th className="px-3 py-2">{ti("expiryDate")}</th>
                  <th className="px-3 py-2">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {(selected?.lots.length ?? 0) === 0 ? (
                  <tr><td className="px-3 py-3 text-muted-foreground" colSpan={4}>{t("noLots")}</td></tr>
                ) : selected?.lots.map((lot) => (
                  <tr className="border-b border-border last:border-b-0" key={lot.id}>
                    <td className="px-3 py-2 font-mono text-xs">{lot.lotNumber || "—"}</td>
                    <td className="px-3 py-2 text-right">{qtyLabel(lot.quantity)}</td>
                    <td className="px-3 py-2">{lot.expiryDate || "—"}</td>
                    <td className="px-3 py-2">{lotStatusLabel[lot.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ProductSmallModal>
      ) : null}

      {dialog === "history" ? (
        <ProductSmallModal
          closeOnBackdrop
          closeOnEscape
          footer={
            <div className="flex justify-end">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setDialog(null)}>{t("close")}</button>
            </div>
          }
          onClose={() => setDialog(null)}
          size="xl"
          title={t("viewStockHistory")}
        >
          <div className="space-y-2 text-xs text-muted-foreground">
            {(snapshot?.movements ?? []).slice(0, 8).map((movement) => (
              <div className="rounded-md border border-border bg-background p-3" key={movement.id}>
                <div className="font-semibold text-foreground">{inventoryMovementLabel(movement.movementType, locale)}</div>
                <div>{movement.createdAt} · {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity} · {movement.beforeQty} → {movement.afterQty}</div>
                {movement.note ? <div className="mt-1">{movement.note}</div> : null}
              </div>
            ))}
            {(snapshot?.movements.length ?? 0) === 0 ? <p>{ti("noMovements")}</p> : null}
          </div>
          <div className="mt-4 hidden md:block">
            <StockMovementHistory movements={snapshot?.movements ?? []} />
          </div>
        </ProductSmallModal>
      ) : null}
    </section>
  );
}

function StockMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
