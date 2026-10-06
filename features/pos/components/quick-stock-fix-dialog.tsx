"use client";

import { useState } from "react";

import { PosSmallModal } from "@/features/pos/components/pos-small-modal";
import {
  QUICK_STOCK_FIX_PRESETS,
  type QuickStockFixRequest,
} from "@/features/pos/quick-stock-fix";
import { displayProductUnitName } from "@/lib/i18n/products-copy";
import { fillPosCopy, tPos } from "@/lib/i18n/pos-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

export function QuickStockFixDialog({
  busy,
  error,
  onCancel,
  onConfirm,
  request,
}: {
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (baseQty: number) => void;
  request: QuickStockFixRequest;
}) {
  const locale = useAppLocale();
  const t = (key: string) => tPos(key, locale);
  const baseUnit = displayProductUnitName(request.baseUnitName, locale);
  const saleUnit = displayProductUnitName(request.saleUnitName, locale);
  const outOfStock = request.availableBase <= 0;
  const [selected, setSelected] = useState(request.shortBase);
  const [custom, setCustom] = useState("");
  const [usingCustom, setUsingCustom] = useState(false);
  const customQty = Number(custom);
  const quantity = usingCustom ? customQty : selected;
  const quantityValid = Number.isInteger(quantity) && quantity > 0;
  const coversShortage = quantityValid && quantity >= request.shortBase;
  const requestedLabel = request.conversionQty === 1
    ? `1 ${saleUnit}`
    : `1 ${saleUnit} (${request.conversionQty} ${baseUnit})`;

  function choosePreset(amount: number) {
    setUsingCustom(false);
    setSelected(amount);
  }

  function submit() {
    if (busy || !coversShortage) return;
    onConfirm(quantity);
  }

  return (
    <PosSmallModal
      closeOnEscape
      description={request.productName}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold"
            disabled={busy}
            type="button"
            onClick={onCancel}
          >
            {t("ui.cancel")}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            disabled={busy || !coversShortage}
            type="button"
            onClick={submit}
          >
            {busy ? t("ui.saving") : t("ui.quick.stock.continue")}
          </button>
        </div>
      )}
      onClose={onCancel}
      size="sm"
      title={outOfStock ? t("ui.quick.stock.out") : t("ui.quick.stock.insufficient")}
    >
      <div className="grid gap-3 text-sm" data-section="quick-stock-fix">
        <h3 className="text-base font-semibold">{t("ui.quick.stock.fix")}</h3>
        <dl className="grid gap-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("ui.quick.stock.current")}</dt>
            <dd className="font-semibold">{request.availableBase} {baseUnit}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("ui.quick.stock.requested")}</dt>
            <dd className="font-semibold">{requestedLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("ui.quick.stock.short")}</dt>
            <dd className="font-semibold">{request.shortBase} {baseUnit}</dd>
          </div>
        </dl>
        {request.conversionQty !== 1 ? (
          <p className="text-xs text-muted-foreground">
            {fillPosCopy(t("ui.quick.stock.unit.hint"), {
              base: baseUnit,
              qty: request.conversionQty,
              unit: saleUnit,
            })}
          </p>
        ) : null}
        <p className="text-xs font-semibold text-muted-foreground">{t("ui.quick.stock.add.temporary")}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_STOCK_FIX_PRESETS.map((amount) => (
            <button
              className={cn(
                "inline-flex h-10 min-w-14 items-center justify-center rounded-md border px-3 text-sm font-semibold",
                !usingCustom && selected === amount ? "border-primary bg-primary/10 text-primary" : "border-border",
              )}
              key={amount}
              type="button"
              onClick={() => choosePreset(amount)}
            >
              +{amount}
            </button>
          ))}
          {(QUICK_STOCK_FIX_PRESETS as readonly number[]).includes(request.shortBase) ? null : (
            <button
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-md border px-3 text-sm font-semibold",
                !usingCustom && selected === request.shortBase ? "border-primary bg-primary/10 text-primary" : "border-border",
              )}
              type="button"
              onClick={() => choosePreset(request.shortBase)}
            >
              +{request.shortBase}
            </button>
          )}
        </div>
        <label className="grid gap-1 text-xs font-semibold">
          {t("ui.quick.stock.custom")} ({baseUnit})
          <input
            className="field-input h-10"
            inputMode="numeric"
            min={1}
            type="number"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              setUsingCustom(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>
        <div className="grid gap-1">
          <div className="text-xs font-semibold text-muted-foreground">{t("ui.quick.stock.reason")}</div>
          <p className="rounded-md border border-border bg-background px-3 py-2 text-sm">{t("ui.quick.stock.reason.value")}</p>
        </div>
        {usingCustom && custom.trim() !== "" && !quantityValid ? (
          <p className="text-sm text-danger" role="alert">{t("ui.quick.stock.invalid")}</p>
        ) : null}
        {quantityValid && !coversShortage ? (
          <p className="text-sm text-danger" role="alert">
            {fillPosCopy(t("ui.quick.stock.below"), { qty: request.shortBase, unit: baseUnit })}
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      </div>
    </PosSmallModal>
  );
}
