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
import { WhiteDataTable } from "@/features/products/components/selected-products-list";
import type { ProductListQuery } from "@/features/products/list-query";
import { localizedProductName } from "@/features/pos/product-display-name";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type Mode = "amount" | "percent";
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
  const [mode, setMode] = useState<Mode>("percent");
  const [direction, setDirection] = useState<Direction>("increase");
  const [percent, setPercent] = useState("10");
  const [amount, setAmount] = useState("1000");
  const [roundChoice, setRoundChoice] = useState<RoundChoice>("unit");
  const [customRounding, setCustomRounding] = useState("100");
  const [confirmed, setConfirmed] = useState(false);
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
  }))), [included, locale, products]);

  const jobRounding = roundChoice === "unit" ? null : roundChoice === "custom" ? Number(customRounding) : Number(roundChoice);
  const roundingReady = roundChoice !== "custom" || (Number.isInteger(jobRounding) && (jobRounding ?? 0) >= 0 && (jobRounding ?? 0) <= 100000);
  const quotes = lines.filter((line) => line.included).map((line) => ({
    ...line,
    quote: quoteForLine(line, { amount, direction, jobRounding, mode, percent }),
  }));
  const increases = quotes.filter((line) => (line.quote.amount ?? 0) > 0);
  const decreases = quotes.filter((line) => (line.quote.amount ?? 0) < 0);
  const unchanged = quotes.filter((line) => line.quote.newPriceLak === line.priceLak);
  const invalid = quotes.filter((line) => line.quote.reason);
  const ready = quotes.filter((line) => line.quote.newPriceLak !== null && line.quote.newPriceLak !== line.priceLak);
  const adjustment = mode === "percent" ? percent : amount;
  const adjustmentValue = Number(adjustment);
  const previewDisabled = quotes.length === 0 || !roundingReady || ready.length > BULK_PRICE_MAX_LINES || adjustment.trim() === "" || !Number.isFinite(adjustmentValue) || adjustmentValue < 0;
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
      roundManual: false,
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
          <WhiteDataTable minWidth="1280px">
            <thead>
              <tr>
                <th>{t("productName")}</th>
                <th className="mid">{t("unit")}</th>
                <th>{t("barcode")}</th>
                <th className="num">{t("cost")}</th>
                <th className="num">{t("bulkCurrentSellingPrice")}</th>
                <th className="num">{t("bulkRawResult")}</th>
                <th className="num">{t("bulkNewSellingPrice")}</th>
                <th className="mid">{t("action")}</th>
              </tr>
            </thead>
            {products.map((product) => (
              <tbody data-testid="products-bulk-product" key={product.id}>
                {lines.filter((line) => line.productId === product.id).map((line) => (
                  <UnitRow amount={amount} direction={direction} jobRounding={jobRounding} key={line.key} line={line} mode={mode} percent={percent} productName={localizedProductName(product, locale)} t={t} onRemove={() => setProducts((current) => current.filter((item) => item.id !== product.id))} onToggle={(checked) => setIncluded((current) => ({ ...current, [line.key]: checked }))}/>
                ))}
              </tbody>
            ))}
          </WhiteDataTable>
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap gap-2">
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${mode === "percent" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-mode-percent" type="button" onClick={() => setMode("percent")}>{t("bulkPercent")}</button>
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${mode === "amount" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-mode-amount" type="button" onClick={() => setMode("amount")}>{t("bulkAmount")}</button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${direction === "increase" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-increase" type="button" onClick={() => setDirection("increase")}>{t("bulkIncrease")}</button>
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold ${direction === "decrease" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-bulk-decrease" type="button" onClick={() => setDirection("decrease")}>{t("bulkDecrease")}</button>
              {mode === "percent" ? (
                <label className="grid gap-1 text-xs font-semibold">{t("bulkPercent")}<input className="h-10 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-percent" inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value.replace(/[^\d.]/g, ""))}/></label>
              ) : (
                <label className="grid gap-1 text-xs font-semibold">{t("bulkAmount")}<input className="h-10 w-28 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-amount" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}/></label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input checked={roundChoice !== "unit"} data-testid="products-bulk-override" type="checkbox" onChange={(event) => setRoundChoice(event.target.checked ? "1000" : "unit")}/>
              {t("bulkOverrideRounding")}
            </label>
            {roundChoice !== "unit" ? (
              <div className="flex flex-wrap gap-2">
                {(["0", "100", "500", "1000", "custom"] as const).map((choice) => (
                  <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${roundChoice === choice ? "border-primary bg-primary/10" : "border-border"}`} data-testid={`products-bulk-round-${choice}`} key={choice} type="button" onClick={() => setRoundChoice(choice)}>{choice === "0" ? t("bulkNoRounding") : choice === "custom" ? t("bulkCustomIncrement") : formatLak(Number(choice))}</button>
                ))}
                {roundChoice === "custom" ? <input className="h-9 w-28 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-bulk-custom-rounding" inputMode="numeric" value={customRounding} onChange={(event) => setCustomRounding(event.target.value.replace(/[^\d]/g, ""))}/> : null}
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
            {t("bulkMode")}: {mode === "percent" ? t("bulkPercent") : t("bulkAmount")}
            {" · "}{direction === "increase" ? t("bulkIncrease") : t("bulkDecrease")}
            {" · "}{t("bulkRoundingLabel")}: {roundingLabel}
            {" · "}{t("bulkProductsAffected")}: {new Set(quotes.map((line) => line.productId)).size}
            {" · "}{t("bulkUnitsAffected")}: {quotes.length}
            {" · "}{t("bulkIncreases")}: {increases.length}
            {" · "}{t("bulkDecreases")}: {decreases.length}
            {" · "}{t("bulkUnchanged")}: {unchanged.length}
            {" · "}{t("bulkInvalid")}: {invalid.length}
          </p>
          <WhiteDataTable minWidth="1120px" testId="products-bulk-quote-table">
            <thead>
              <tr>
                <th>{t("product")}</th>
                <th>SKU</th>
                <th className="mid">{t("unit")}</th>
                <th className="num">{t("cost")}</th>
                <th className="num">{t("bulkCurrentSellingPrice")}</th>
                <th className="num">{t("bulkRawResult")}</th>
                <th className="num">{t("bulkNewSellingPrice")}</th>
                <th className="num">{t("bulkDifference")}</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((line) => (
                <tr data-new={line.quote.newPriceLak ?? ""} data-old={line.priceLak} data-raw={line.quote.rawPriceLak ?? ""} data-sku={line.sku} data-testid="products-bulk-row" data-unit={line.unitName} key={line.key}>
                  <td className="font-semibold">{line.localeName}</td>
                  <td className="font-mono text-xs">{line.sku}</td>
                  <td className="mid">{line.unitName}</td>
                  <td className="num">{line.costLak === null ? "—" : formatLak(line.costLak)}</td>
                  <td className="num">{formatLak(line.priceLak)}</td>
                  <td className="num" data-testid="products-bulk-raw">{line.quote.rawPriceLak === null ? "—" : formatLak(line.quote.rawPriceLak)}</td>
                  <td className="num" data-testid="products-bulk-final">{line.quote.newPriceLak === null ? t(line.quote.reason === "negative" ? "bulkNegative" : "bulkInvalid") : formatLak(line.quote.newPriceLak)}</td>
                  <td className="num">{line.quote.amount === null ? "—" : `${line.quote.amount > 0 ? "+" : ""}${formatLak(line.quote.amount)}${line.quote.percent === null ? "" : ` (${line.quote.percent > 0 ? "+" : ""}${line.quote.percent}%)`}`}</td>
                </tr>
              ))}
            </tbody>
          </WhiteDataTable>
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input checked={confirmed} data-testid="products-bulk-confirm" type="checkbox" onChange={(event) => setConfirmed(event.target.checked)}/>
            {t("bulkConfirmUpdates")}
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-back" type="button" onClick={() => { setConfirmed(false); setPhase("choose"); }}>{t("printBack")}</button>
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-refresh" type="button" onClick={() => { setConfirmed(false); void refreshPreview(); }}>{t("bulkRefreshPreview")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-bulk-apply" disabled={ready.length === 0 || invalid.length > 0 || !confirmed || applying} type="button" onClick={() => { void applyUpdates(); }}>{t("save")}</button>
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

function UnitRow({ amount, direction, jobRounding, line, mode, onRemove, onToggle, percent, productName, t }: {
  amount: string;
  direction: Direction;
  jobRounding: number | null;
  line: BulkPriceChoice & { included: boolean; key: string };
  mode: Mode;
  onRemove: () => void;
  onToggle: (checked: boolean) => void;
  percent: string;
  productName: string;
  t: (key: string) => string;
}) {
  const quote = line.included ? quoteForLine(line, { amount, direction, jobRounding, mode, percent }) : null;
  return (
    <tr data-price={line.priceLak} data-product={line.productId} data-role={unitPrintRole(line.unitName)} data-rounding={line.roundingLak} data-sku={line.sku} data-testid="products-bulk-unit" data-unit={line.unitName} data-unit-id={line.unitId}>
      <td className="font-semibold">{productName}</td>
      <td className="mid">
        <label className="inline-flex items-center gap-2 font-semibold">
          <input checked={line.included} data-testid="products-bulk-include" type="checkbox" onChange={(event) => onToggle(event.target.checked)}/>
          <span>{line.unitName}</span>
        </label>
      </td>
      <td className="font-mono text-xs">{line.barcode || "—"}</td>
      <td className="num">{line.costLak === null ? "—" : formatLak(line.costLak)}</td>
      <td className="num">{formatLak(line.priceLak)}</td>
      <td className="num" data-testid="products-bulk-raw">{quote?.rawPriceLak == null ? "—" : formatLak(quote.rawPriceLak)}</td>
      <td className="num"><span className="font-semibold" data-testid="products-bulk-proposed">{quote?.newPriceLak == null ? "—" : formatLak(quote.newPriceLak)}</span></td>
      <td className="mid"><button className="ego-row-remove" data-testid="products-bulk-remove-product" type="button" onClick={onRemove}>{t("printRemoveProduct")}</button></td>
    </tr>
  );
}

function quoteForLine(line: { priceLak: number; roundingLak: number }, input: {
  amount: string;
  direction: Direction;
  jobRounding: number | null;
  mode: Mode;
  percent: string;
}) {
  const valueText = input.mode === "percent" ? input.percent : input.amount;
  const method = input.mode === "percent"
    ? input.direction === "increase" ? "increase_percent" : "decrease_percent"
    : input.direction === "increase" ? "increase_amount" : "decrease_amount";
  return quoteBulkSellingPrice({
    currentPriceLak: line.priceLak,
    jobRounding: input.jobRounding,
    method,
    roundingLak: line.roundingLak,
    value: valueText.trim() === "" ? Number.NaN : Number(valueText),
  });
}

function lineKey(unit: Pick<BulkPriceChoice, "productId" | "unitId" | "unitName">) {
  return `${unit.productId}:${unit.unitId || unit.unitName}`;
}
