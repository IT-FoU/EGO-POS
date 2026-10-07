"use client";

import { useEffect, useMemo, useState } from "react";
import { applyBulkSellingPricesAction, searchBulkPriceProductsAction } from "@/features/products/actions";
import { unitPrintRole } from "@/features/products/barcode-print";
import {
  BULK_PRICE_MAX_LINES,
  bulkPriceUnits,
  quoteBulkSellingPrice,
  type BulkPriceChoice,
  type BulkPriceProductSource,
} from "@/features/products/bulk-price";
import type { BulkPriceApplyResult, BulkPriceJobAudit } from "@/features/products/bulk-price-service";
import { formatLak } from "@/features/products/format";
import { SelectedProductsList, selectedProductsPriceGridClassName, selectedProductsRowClassName } from "@/features/products/components/selected-products-list";
import type { ProductListQuery } from "@/features/products/list-query";
import { localizedProductName } from "@/features/pos/product-display-name";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type Mode = "manual" | "percent";
type Direction = "decrease" | "increase";
type RoundChoice = "0" | "100" | "500" | "1000" | "custom" | "unit";

export function BulkPriceDrawer({ onApplied, onClose, selectedIds }: {
  onApplied: () => Promise<void> | void;
  onClose: () => void;
  query: ProductListQuery;
  selectedIds: string[];
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [products, setProducts] = useState<BulkPriceProductSource[]>([]);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("percent");
  const [direction, setDirection] = useState<Direction>("increase");
  const [percent, setPercent] = useState("10");
  const [roundChoice, setRoundChoice] = useState<RoundChoice>("unit");
  const [customRounding, setCustomRounding] = useState("100");
  const [roundManual, setRoundManual] = useState(false);
  const [samePrice, setSamePrice] = useState("");
  const [phase, setPhase] = useState<"choose" | "preview" | "result">("choose");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(selectedIds.length > 0);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<BulkPriceApplyResult | null>(null);
  const selectionKey = selectedIds.join("\n");

  useEffect(() => {
    if (!selectionKey) return;
    let cancelled = false;
    const ids = selectionKey.split("\n").filter(Boolean);
    void searchBulkPriceProductsAction({ productIds: ids }).then((response) => {
      if (cancelled) return;
      if (!response.ok || !response.data) {
        const error = response.error ?? "";
        setMessage(error.includes("Permission denied") ? t("bulkPermissionDenied") : error);
        setLoading(false);
        return;
      }
      const rows = response.data as BulkPriceProductSource[];
      const rank = new Map(ids.map((id, index) => [id, index]));
      rows.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
      setProducts(rows);
      setIncluded((current) => {
        const next = { ...current };
        for (const product of rows) {
          bulkPriceUnits(product).forEach((unit) => {
            const key = lineKey(unit);
            if (next[key] === undefined) next[key] = false;
          });
        }
        return next;
      });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectionKey]);

  const lines = useMemo(() => products.flatMap((product) => bulkPriceUnits(product).map((unit) => ({
    ...unit,
    included: included[lineKey(unit)] === true,
    key: lineKey(unit),
    localeName: localizedProductName(product, locale),
    manual: manualPrices[lineKey(unit)] ?? "",
  }))), [included, locale, manualPrices, products]);

  const jobRounding = roundChoice === "unit" ? null : roundChoice === "custom" ? Number(customRounding) : Number(roundChoice);
  const roundingReady = roundChoice !== "custom" || (Number.isInteger(jobRounding) && (jobRounding ?? 0) >= 0 && (jobRounding ?? 0) <= 100000);
  const quotes = lines.filter((line) => line.included).map((line) => ({
    ...line,
    quote: quoteForLine(line, { direction, jobRounding, mode, percent, roundManual: roundManual && roundChoice !== "unit" }),
  }));
  const increases = quotes.filter((line) => (line.quote.amount ?? 0) > 0);
  const decreases = quotes.filter((line) => (line.quote.amount ?? 0) < 0);
  const unchanged = quotes.filter((line) => line.quote.newPriceLak === line.priceLak);
  const invalid = quotes.filter((line) => line.quote.reason);
  const ready = quotes.filter((line) => line.quote.newPriceLak !== null && line.quote.newPriceLak !== line.priceLak);
  const percentValue = Number(percent);
  const previewDisabled = quotes.length === 0 || !roundingReady || ready.length > BULK_PRICE_MAX_LINES || (mode === "percent" && (!Number.isFinite(percentValue) || percent.trim() === ""));
  const roundingLabel = roundChoice === "unit" ? t("bulkUnitRounding") : jobRounding === 0 ? t("bulkNoRounding") : formatLak(jobRounding ?? 0);

  function selectRole(role: "box" | "pack" | "piece") {
    setIncluded((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (unitPrintRole(line.unitName) !== role) continue;
        next[line.key] = true;
      }
      return next;
    });
  }

  function clearUnits() {
    setIncluded((current) => {
      const next = { ...current };
      for (const line of lines) next[line.key] = false;
      return next;
    });
  }

  function applySamePrice() {
    const value = samePrice.replace(/[^\d]/g, "");
    if (!value) return;
    setManualPrices((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (!line.included) continue;
        next[line.key] = value;
      }
      return next;
    });
    setMode("manual");
  }

  async function refreshPreview() {
    const ids = products.map((product) => product.id);
    if (ids.length === 0) return;
    const response = await searchBulkPriceProductsAction({ productIds: ids });
    if (!response.ok || !response.data) return;
    const rows = response.data as BulkPriceProductSource[];
    const rank = new Map(ids.map((id, index) => [id, index]));
    rows.sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
    setProducts(rows);
  }

  async function applyUpdates() {
    setApplying(true);
    setMessage("");
    const job: BulkPriceJobAudit = {
      mode,
      roundManual: roundManual && roundChoice !== "unit",
      roundingOverrideLak: roundChoice === "unit" ? null : jobRounding,
    };
    const response = await applyBulkSellingPricesAction(ready.map((line) => ({
      expectedPriceLak: line.priceLak,
      newPriceLak: line.quote.newPriceLak ?? line.priceLak,
      productId: line.productId,
      unitId: line.unitId,
    })), job);
    setApplying(false);
    if (!response.ok || !response.data) {
      const error = response.error ?? "";
      setMessage(error.includes("Permission denied") ? t("bulkPermissionDenied") : error);
      return;
    }
    setResult(response.data as BulkPriceApplyResult);
    setPhase("result");
    signalPosCatalogueInvalidation();
    await onApplied();
  }

  return (
    <div className="grid gap-5" data-loaded={loading ? "0" : "1"} data-mode={mode} data-product-count={products.length} data-rounding={roundChoice} data-selected-count={selectedIds.length} data-testid="products-bulk-price">
      <p className="text-sm text-muted-foreground">{t("bulkRoundingNote")}</p>
      {phase === "choose" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" data-testid="products-bulk-selected">{t("bulkSelectedProducts")}: {products.length}</p>
            <div className="flex flex-wrap gap-1">
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-bulk-all-piece" type="button" onClick={() => selectRole("piece")}>{t("printSelectAllPiece")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-bulk-all-pack" type="button" onClick={() => selectRole("pack")}>{t("printSelectAllPack")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-bulk-all-box" type="button" onClick={() => selectRole("box")}>{t("printSelectAllBox")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-bulk-clear-units" type="button" onClick={clearUnits}>{t("printClearUnits")}</button>
            </div>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">{t("printBusy")}</p> : null}
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <SelectedProductsList>
            <div className={`${selectedProductsRowClassName} ${selectedProductsPriceGridClassName} sticky top-0 z-10 text-xs font-semibold uppercase text-muted-foreground`}>
              <span>{t("productName")}</span>
              <span>{t("unit")}</span>
              <span>{t("barcode")}</span>
              <span className="text-right">{t("cost")}</span>
              <span className="text-right">{t("bulkCurrentSellingPrice")}</span>
              <span className="text-right">{t("bulkNewSellingPrice")}</span>
              <span/>
            </div>
            {products.map((product) => (
              <div data-testid="products-bulk-product" key={product.id}>
                {lines.filter((line) => line.productId === product.id).map((line) => (
                  <UnitRow direction={direction} jobRounding={jobRounding} key={line.key} line={line} mode={mode} percent={percent} productName={localizedProductName(product, locale)} roundManual={roundManual && roundChoice !== "unit"} t={t} onManual={(value) => setManualPrices((current) => ({ ...current, [line.key]: value.replace(/[^\d]/g, "") }))} onRemove={() => setProducts((current) => current.filter((item) => item.id !== product.id))} onToggle={(checked) => setIncluded((current) => ({ ...current, [line.key]: checked }))}/>
                ))}
              </div>
            ))}
          </SelectedProductsList>
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap gap-2">
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${mode === "percent" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-mode-percent" type="button" onClick={() => setMode("percent")}>{t("bulkPercent")}</button>
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${mode === "manual" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-mode-manual" type="button" onClick={() => setMode("manual")}>{t("bulkManual")}</button>
            </div>
            {mode === "percent" ? (
              <div className="flex flex-wrap items-end gap-2">
                <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${direction === "increase" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-increase" type="button" onClick={() => setDirection("increase")}>{t("bulkIncrease")}</button>
                <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${direction === "decrease" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-decrease" type="button" onClick={() => setDirection("decrease")}>{t("bulkDecrease")}</button>
                <label className="grid gap-1 text-xs font-semibold">{t("bulkPercent")}<input className="h-10 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-percent" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value.replace(/[^\d.]/g, ""))}/></label>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs font-semibold">{t("bulkSetSamePrice")}<input className="h-10 w-36 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-same-price" inputMode="numeric" value={samePrice} onChange={(event) => setSamePrice(event.target.value.replace(/[^\d]/g, ""))}/></label>
                <button className="h-10 rounded-md border border-border px-3 text-xs font-semibold" data-testid="products-bulk-same-price-apply" type="button" onClick={applySamePrice}>{t("bulkSetSamePrice")}</button>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input checked={roundChoice !== "unit"} data-testid="products-bulk-override" type="checkbox" onChange={(event) => { setRoundChoice(event.target.checked ? "1000" : "unit"); if (!event.target.checked) setRoundManual(false); }}/>
              {t("bulkOverrideRounding")}
            </label>
            {roundChoice !== "unit" ? (
              <div className="flex flex-wrap gap-2">
                {(["0", "100", "500", "1000", "custom"] as const).map((choice) => (
                  <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${roundChoice === choice ? "border-primary bg-primary/10" : "border-border"}`} data-testid={`products-bulk-round-${choice}`} key={choice} type="button" onClick={() => setRoundChoice(choice)}>{choice === "0" ? t("bulkNoRounding") : choice === "custom" ? t("bulkCustomIncrement") : formatLak(Number(choice))}</button>
                ))}
                {roundChoice === "custom" ? <input className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-custom-rounding" inputMode="numeric" value={customRounding} onChange={(event) => setCustomRounding(event.target.value.replace(/[^\d]/g, ""))}/> : null}
                {mode === "manual" ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input checked={roundManual} data-testid="products-bulk-round-manual" type="checkbox" onChange={(event) => setRoundManual(event.target.checked)}/>
                    {t("bulkApplyRoundingManual")}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
          {ready.length > BULK_PRICE_MAX_LINES ? <p className="text-sm font-semibold text-danger">{t("printTooMany")}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-bulk-preview" disabled={previewDisabled} type="button" onClick={() => setPhase("preview")}>{t("bulkPreviewChanges")}</button>
          </div>
        </div>
      ) : null}
      {phase === "preview" ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold" data-testid="products-bulk-summary">
            {t("bulkMode")}: {mode === "percent" ? t("bulkPercent") : t("bulkManual")}
            {" · "}{t("bulkRoundingLabel")}: {roundingLabel}
            {" · "}{t("bulkProductsAffected")}: {new Set(quotes.map((line) => line.productId)).size}
            {" · "}{t("bulkUnitsAffected")}: {quotes.length}
            {" · "}{t("bulkIncreases")}: {increases.length}
            {" · "}{t("bulkDecreases")}: {decreases.length}
            {" · "}{t("bulkUnchanged")}: {unchanged.length}
            {" · "}{t("bulkInvalid")}: {invalid.length}
          </p>
          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">{t("product")}</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">{t("unit")}</th>
                  <th className="p-2 text-right">{t("cost")}</th>
                  <th className="p-2 text-right">{t("bulkCurrentSellingPrice")}</th>
                  <th className="p-2 text-right">{t("bulkNewSellingPrice")}</th>
                  <th className="p-2 text-right">{t("bulkDifference")}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((line) => (
                  <tr className="border-t border-border" data-new={line.quote.newPriceLak ?? ""} data-old={line.priceLak} data-sku={line.sku} data-testid="products-bulk-row" data-unit={line.unitName} key={line.key}>
                    <td className="p-2 font-semibold">{line.localeName}</td>
                    <td className="p-2 font-mono text-xs">{line.sku}</td>
                    <td className="p-2">{line.unitName}</td>
                    <td className="p-2 text-right">{line.costLak === null ? "—" : formatLak(line.costLak)}</td>
                    <td className="p-2 text-right">{formatLak(line.priceLak)}</td>
                    <td className="p-2 text-right">{line.quote.newPriceLak === null ? t(line.quote.reason === "negative" ? "bulkNegative" : "bulkInvalid") : formatLak(line.quote.newPriceLak)}</td>
                    <td className="p-2 text-right">{line.quote.amount === null ? "—" : `${line.quote.amount > 0 ? "+" : ""}${formatLak(line.quote.amount)}${line.quote.percent === null ? "" : ` (${line.quote.percent > 0 ? "+" : ""}${line.quote.percent}%)`}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-back" type="button" onClick={() => setPhase("choose")}>{t("printBack")}</button>
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-refresh" type="button" onClick={() => { void refreshPreview(); }}>{t("bulkRefreshPreview")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-bulk-apply" disabled={ready.length === 0 || applying} type="button" onClick={() => { void applyUpdates(); }}>{t("save")}</button>
          </div>
        </div>
      ) : null}
      {phase === "result" && result ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold" data-testid="products-bulk-result">
            {t("bulkUpdated")}: {result.updated}
            {" · "}{t("bulkSkipped")}: {result.skipped}
            {" · "}{t("bulkFailed")}: {result.failed}
            {" · "}{t("bulkConflict")}: {result.conflict}
          </p>
          <div className="grid max-h-80 gap-2 overflow-auto">
            {result.results.filter((row) => row.status !== "updated").map((row) => (
              <p className="rounded-md border border-border px-3 py-2 text-sm" data-status={row.status} data-testid="products-bulk-result-row" key={`${row.productId}:${row.unitId}:${row.status}`}>
                {row.sku} / {row.unitName} — {row.status === "conflict" ? t("bulkConflictDetail") : row.status === "skipped" ? t("bulkSkipped") : `${t("bulkFailed")}: ${row.reason}`}
              </p>
            ))}
          </div>
          <div className="flex justify-end">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UnitRow({ direction, jobRounding, line, mode, onManual, onRemove, onToggle, percent, productName, roundManual, t }: {
  direction: Direction;
  jobRounding: number | null;
  line: BulkPriceChoice & { included: boolean; key: string; manual: string };
  mode: Mode;
  onManual: (value: string) => void;
  onRemove: () => void;
  onToggle: (checked: boolean) => void;
  percent: string;
  productName: string;
  roundManual: boolean;
  t: (key: string) => string;
}) {
  const quote = quoteForLine(line, { direction, jobRounding, mode, percent, roundManual });
  return (
    <div className={`${selectedProductsRowClassName} ${selectedProductsPriceGridClassName}`} data-price={line.priceLak} data-product={line.productId} data-role={unitPrintRole(line.unitName)} data-rounding={line.roundingLak} data-sku={line.sku} data-testid="products-bulk-unit" data-unit={line.unitName} data-unit-id={line.unitId}>
      <span className="truncate font-semibold">{productName}</span>
      <label className="flex items-center gap-2 font-semibold">
        <input checked={line.included} data-testid="products-bulk-include" type="checkbox" onChange={(event) => onToggle(event.target.checked)}/>
        <span className="truncate">{line.unitName}</span>
      </label>
      <span className="truncate font-mono text-xs">{line.barcode || "—"}</span>
      <span className="text-right">{line.costLak === null ? "—" : formatLak(line.costLak)}</span>
      <span className="text-right">{formatLak(line.priceLak)}</span>
      {mode === "manual" ? (
        <input className="h-8 w-full rounded-md border border-border bg-white px-2 text-right text-sm" data-testid="products-bulk-manual-price" inputMode="numeric" value={line.manual} onChange={(event) => onManual(event.target.value)}/>
      ) : (
        <span className="text-right font-semibold" data-testid="products-bulk-proposed">{quote.newPriceLak === null ? "—" : formatLak(quote.newPriceLak)}</span>
      )}
      <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-bulk-remove-product" type="button" onClick={onRemove}>{t("printRemoveProduct")}</button>
    </div>
  );
}

function quoteForLine(line: { manual: string; priceLak: number; roundingLak: number }, input: {
  direction: Direction;
  jobRounding: number | null;
  mode: Mode;
  percent: string;
  roundManual: boolean;
}) {
  if (input.mode === "manual") {
    if (!line.manual.trim()) return quoteBulkSellingPrice({ currentPriceLak: line.priceLak, method: "set_exact", value: Number.NaN });
    return quoteBulkSellingPrice({
      currentPriceLak: line.priceLak,
      jobRounding: input.roundManual ? input.jobRounding : null,
      method: "set_exact",
      roundExact: input.roundManual,
      roundingLak: line.roundingLak,
      value: Number(line.manual),
    });
  }
  return quoteBulkSellingPrice({
    currentPriceLak: line.priceLak,
    jobRounding: input.jobRounding,
    method: input.direction === "increase" ? "increase_percent" : "decrease_percent",
    roundingLak: line.roundingLak,
    value: Number(input.percent),
  });
}

function lineKey(unit: Pick<BulkPriceChoice, "productId" | "unitId" | "unitName">) {
  return `${unit.productId}:${unit.unitId || unit.unitName}`;
}
