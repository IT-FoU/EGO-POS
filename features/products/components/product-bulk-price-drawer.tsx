"use client";

import { useEffect, useMemo, useState } from "react";
import { applyBulkSellingPricesAction, searchBulkPriceProductsAction } from "@/features/products/actions";
import {
  bulkPriceUnits,
  quoteBulkSellingPrice,
  type BulkPriceChoice,
  type BulkPriceMethod,
  type BulkPriceProductSource,
} from "@/features/products/bulk-price";
import type { BulkPriceApplyResult } from "@/features/products/bulk-price-service";
import { formatLak } from "@/features/products/format";
import type { ProductListQuery } from "@/features/products/list-query";
import { localizedProductName } from "@/features/pos/product-display-name";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

const METHODS: BulkPriceMethod[] = ["set_exact", "increase_amount", "decrease_amount", "increase_percent", "decrease_percent"];

export function BulkPriceDrawer({ onApplied, onClose, query, selectedIds }: {
  onApplied: () => Promise<void> | void;
  onClose: () => void;
  query: ProductListQuery;
  selectedIds: string[];
}) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [products, setProducts] = useState<BulkPriceProductSource[]>([]);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<BulkPriceMethod>("set_exact");
  const [value, setValue] = useState("");
  const [phase, setPhase] = useState<"choose" | "preview" | "result">("choose");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(selectedIds.length > 0);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<BulkPriceApplyResult | null>(null);

  useEffect(() => {
    if (selectedIds.length === 0) return;
    let cancelled = false;
    void loadProducts({ productIds: selectedIds }).then((rows) => {
      if (cancelled || !rows) return;
      addProducts(rows, true);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  function addProducts(rows: BulkPriceProductSource[], replace = false) {
    setProducts((current) => {
      const next = replace ? [] : [...current];
      for (const row of rows) {
        if (!next.some((product) => product.id === row.id)) next.push(row);
      }
      return next;
    });
    setIncluded((current) => {
      const next = replace ? {} : { ...current };
      for (const product of rows) {
        bulkPriceUnits(product).forEach((unit) => {
          const key = lineKey(unit);
          if (next[key] === undefined) next[key] = true;
        });
      }
      return next;
    });
  }

  async function loadProducts(input: { filtered?: ProductListQuery; productIds?: string[]; search?: string }) {
    const response = await searchBulkPriceProductsAction(input);
    if (!response.ok || !response.data) {
      const error = response.error ?? "";
      setMessage(error.includes("Permission denied") ? t("bulkPermissionDenied") : error);
      setLoading(false);
      return null;
    }
    return response.data as BulkPriceProductSource[];
  }

  async function runSearch() {
    const text = search.trim();
    if (!text) return;
    setMessage("");
    const rows = await loadProducts({ search: text });
    if (rows) addProducts(rows);
  }

  async function loadFiltered() {
    setMessage("");
    setLoading(true);
    const rows = await loadProducts({ filtered: query });
    setLoading(false);
    if (rows) addProducts(rows, true);
  }

  const lines = useMemo(() => products.flatMap((product) => bulkPriceUnits(product).map((unit) => ({
    ...unit,
    included: included[lineKey(unit)] !== false,
    key: lineKey(unit),
  }))), [included, products]);

  const amount = Number(value.replace(/,/g, ""));
  const quotes = lines.filter((line) => line.included).map((line) => ({
    ...line,
    quote: quoteBulkSellingPrice({
      currentPriceLak: line.priceLak,
      method,
      roundingLak: line.roundingLak,
      value: amount,
    }),
  }));
  const ready = quotes.filter((line) => line.quote.newPriceLak !== null && line.quote.newPriceLak !== line.priceLak);
  const invalid = quotes.filter((line) => line.quote.reason);
  const unchanged = quotes.filter((line) => line.quote.newPriceLak === line.priceLak);
  const methodLabel = (item: BulkPriceMethod) => t(item === "set_exact" ? "bulkSetExact" : item === "increase_amount" ? "bulkIncreaseAmount" : item === "decrease_amount" ? "bulkDecreaseAmount" : item === "increase_percent" ? "bulkIncreasePercent" : "bulkDecreasePercent");

  async function applyUpdates() {
    setApplying(true);
    setMessage("");
    const response = await applyBulkSellingPricesAction(ready.map((line) => ({
      expectedPriceLak: line.priceLak,
      newPriceLak: line.quote.newPriceLak ?? line.priceLak,
      productId: line.productId,
      unitId: line.unitId,
    })));
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
    <div className="grid gap-5" data-testid="products-bulk-price">
      <p className="text-sm text-muted-foreground">{t("bulkRoundingNote")}</p>
      {phase === "choose" ? (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-selected" type="button" onClick={() => { if (selectedIds.length > 0) void loadProducts({ productIds: selectedIds }).then((rows) => { if (rows) addProducts(rows, true); }); }}>{t("bulkSelectedProducts")}</button>
            <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-filtered" type="button" onClick={() => { void loadFiltered(); }}>{t("bulkFilteredProducts")}</button>
          </div>
          <label className="grid gap-2 text-sm font-semibold">
            {t("printSelectProducts")}
            <span className="flex gap-2">
              <input className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary" data-testid="products-bulk-search-input" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}/>
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-bulk-search" type="button" onClick={() => { void runSearch(); }}>{t("printSearchAction")}</button>
            </span>
          </label>
          {loading ? <p className="text-sm text-muted-foreground">{t("printBusy")}</p> : null}
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <div className="grid gap-3">
            {products.map((product) => (
              <section className="rounded-lg border border-border bg-background p-4" key={product.id}>
                <h3 className="font-semibold">{localizedProductName(product, locale)}</h3>
                <p className="text-xs text-muted-foreground">{product.sku}</p>
                <div className="mt-3 grid gap-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("printSelectUnit")}</p>
                  {lines.filter((line) => line.productId === product.id).map((line) => (
                    <UnitRow key={line.key} line={line} t={t} onToggle={(checked) => setIncluded((current) => ({ ...current, [line.key]: checked }))}/>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold">{t("adjustment")}
              <select className="field-input" data-testid="products-bulk-method" value={method} onChange={(event) => setMethod(event.target.value as BulkPriceMethod)}>
                {METHODS.map((item) => <option key={item} value={item}>{methodLabel(item)}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">{t("bulkPriceValue")}
              <input className="field-input" data-testid="products-bulk-value" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ""))}/>
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-bulk-preview" disabled={quotes.length === 0 || value.trim() === "" || !Number.isFinite(amount)} type="button" onClick={() => setPhase("preview")}>{t("bulkPreviewChanges")}</button>
          </div>
        </div>
      ) : null}
      {phase === "preview" ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold" data-testid="products-bulk-summary">
            {t("bulkProductsAffected")}: {new Set(quotes.map((line) => line.productId)).size}
            {" · "}{t("bulkUnitsAffected")}: {quotes.length}
            {" · "}{t("bulkUpdated")}: {ready.length}
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
                  <th className="p-2 text-right">{t("bulkCurrentPrice")}</th>
                  <th className="p-2 text-right">{t("bulkNewPrice")}</th>
                  <th className="p-2 text-right">{t("bulkDifference")}</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((line) => (
                  <tr className="border-t border-border" data-new={line.quote.newPriceLak ?? ""} data-old={line.priceLak} data-sku={line.sku} data-testid="products-bulk-row" data-unit={line.unitName} key={line.key}>
                    <td className="p-2 font-semibold">{localizedProductName(line, locale)}</td>
                    <td className="p-2 font-mono text-xs">{line.sku}</td>
                    <td className="p-2">{line.unitName}</td>
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
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-bulk-apply" disabled={ready.length === 0 || applying} type="button" onClick={() => { void applyUpdates(); }}>{t("bulkApply")}</button>
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
                {row.sku} / {row.unitName} — {row.status === "conflict" ? t("bulkConflictReason") : row.status === "skipped" ? t("bulkSkipped") : t("bulkFailed")}
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

function UnitRow({ line, onToggle, t }: {
  line: BulkPriceChoice & { included: boolean; key: string };
  onToggle: (checked: boolean) => void;
  t: (key: string) => string;
}) {
  return (
    <label className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm" data-price={line.priceLak} data-product={line.productId} data-rounding={line.roundingLak} data-sku={line.sku} data-testid="products-bulk-unit" data-unit={line.unitName} data-unit-id={line.unitId}>
      <span className="flex items-center gap-2 font-semibold">
        <input checked={line.included} data-testid="products-bulk-include" type="checkbox" onChange={(event) => onToggle(event.target.checked)}/>
        {line.unitName}
      </span>
      <span>{t("sellingPrice")}: {formatLak(line.priceLak)}</span>
    </label>
  );
}

function lineKey(unit: Pick<BulkPriceChoice, "productId" | "unitId" | "unitName">) {
  return `${unit.productId}:${unit.unitId || unit.unitName}`;
}
