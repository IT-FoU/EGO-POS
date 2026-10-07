"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { searchBarcodePrintProductsAction } from "@/features/products/actions";
import { encodeCode128B, parsePrintQuantity, type BarcodeModule, type BarcodePrintProduct } from "@/features/products/barcode-print";
import { formatLak } from "@/features/products/format";
import { buildShelfPrintJob, SHELF_LABEL_HEIGHT_MM, SHELF_LABEL_WIDTH_MM, shelfPrintUnits, type ShelfPrintChoice } from "@/features/products/shelf-print";
import { localizedProductName } from "@/features/pos/product-display-name";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type Draft = { included: boolean; qty: string };

export function PrintShelfLabelDrawer({ onClose, selectedIds }: { onClose: () => void; selectedIds: string[] }) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [products, setProducts] = useState<BarcodePrintProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<"choose" | "preview">("choose");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(selectedIds.length > 0);

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

  function addProducts(rows: BarcodePrintProduct[], replaceIds = false) {
    setProducts((current) => {
      const next = replaceIds ? current.filter((product) => !rows.some((row) => row.id === product.id)) : current;
      const merged = [...next];
      for (const row of rows) {
        if (!merged.some((product) => product.id === row.id)) merged.push(row);
      }
      return merged;
    });
    setDrafts((current) => {
      const next = { ...current };
      for (const product of rows) {
        shelfPrintUnits(product).forEach((unit, index) => {
          const key = lineKey(product.id, index);
          if (next[key]) return;
          next[key] = { included: !unit.missingPrice, qty: "1" };
        });
      }
      return next;
    });
  }

  async function runSearch() {
    const query = search.trim();
    if (!query) return;
    setMessage("");
    const rows = await loadProducts({ search: query });
    if (rows === null) return;
    if (rows.length === 0) setMessage(t("printShelfNone"));
    addProducts(rows);
  }

  async function loadProducts(input: { productIds?: string[]; search?: string }) {
    const response = await searchBarcodePrintProductsAction(input);
    if (!response.ok || !response.data) {
      const error = response.error ?? "";
      setMessage(error.includes("Permission denied") ? t("printShelfPermissionDenied") : error);
      setLoading(false);
      return null;
    }
    return response.data as BarcodePrintProduct[];
  }

  const lines = useMemo(() => products.flatMap((product) => shelfPrintUnits(product).map((unit, index) => {
    const draft = drafts[lineKey(product.id, index)] ?? { included: false, qty: "1" };
    const copies = parsePrintQuantity(draft.qty);
    return {
      ...unit,
      copies: copies ?? 0,
      included: draft.included,
      key: lineKey(product.id, index),
      qty: draft.qty,
      qtyValid: copies !== null,
    };
  })), [drafts, products]);

  const job = buildShelfPrintJob(lines.filter((line) => line.included).map((line) => ({ ...line, copies: line.copies })));
  const qtyError = lines.some((line) => line.included && !line.qtyValid);
  const graphics = useMemo(() => {
    const encoded = new Map<string, BarcodeModule[] | null>();
    for (const line of job.printable) {
      if (!line.barcode || encoded.has(line.barcode)) continue;
      encoded.set(line.barcode, encodeCode128B(line.barcode));
    }
    return encoded;
  }, [job.printable]);

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? { included: false, qty: "1" }), ...patch } }));
  }

  return (
    <div className="grid gap-5" data-selected-count={selectedIds.length} data-testid="products-print-shelf">
      <style dangerouslySetInnerHTML={{ __html: printCss }}/>
      <p className="text-sm text-muted-foreground print:hidden">{t("shelfLabel")}. {t("printShelfSize")}</p>
      {phase === "choose" ? (
        <div className="grid gap-4 print:hidden">
          <label className="grid gap-2 text-sm font-semibold">
            {t("printSelectProducts")}
            <span className="flex gap-2">
              <input className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary" data-testid="products-shelf-search-input" placeholder={t("printSearch")} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }}/>
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-shelf-search" type="button" onClick={() => { void runSearch(); }}>{t("printSearchAction")}</button>
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
                    <UnitRow key={line.key} line={line} productId={product.id} t={t} onChange={updateDraft}/>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <p className="text-sm font-semibold" data-testid="products-shelf-total">{t("printTotalLabels")}: {job.overLimit ? 0 : job.total}</p>
          {qtyError ? <p className="text-sm font-semibold text-danger">{t("printQtyInvalid")}</p> : null}
          {job.overLimit ? <p className="text-sm font-semibold text-danger">{t("printTooMany")}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-shelf-preview" disabled={job.total < 1 || qtyError || job.overLimit} type="button" onClick={() => setPhase("preview")}>{t("preview")}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm font-semibold" data-testid="products-shelf-total">{t("printTotalLabels")}: {job.total}</p>
            <div className="flex gap-2">
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-shelf-back" type="button" onClick={() => setPhase("choose")}>{t("printBack")}</button>
              <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" data-testid="products-shelf-confirm" type="button" onClick={() => window.print()}>{t("printAction")}</button>
            </div>
          </div>
          <div className="shelf-print-sheet grid gap-3 sm:grid-cols-2" data-testid="products-shelf-sheet">
            {job.printable.flatMap((line) => Array.from({ length: line.copies }, (_, copy) => (
              <ShelfCard copy={copy} key={`${line.productId}-${line.unitName}-${copy}`} line={line} locale={locale} modules={line.barcode ? graphics.get(line.barcode) ?? null : null}/>
            )))}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitRow({ line, onChange, productId, t }: {
  line: ShelfPrintChoice & { included: boolean; key: string; qty: string; qtyValid: boolean };
  onChange: (key: string, patch: Partial<Draft>) => void;
  productId: string;
  t: (key: string) => string;
}) {
  const blocked = line.missingPrice;
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-[auto_1fr_auto] md:items-center" data-testid={blocked ? "products-shelf-missing-price" : "products-shelf-unit"}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input checked={line.included} data-testid="products-shelf-include" disabled={blocked} type="checkbox" onChange={(event) => onChange(line.key, { included: event.target.checked })}/>
        {line.unitName}
      </label>
      <div className="text-xs">
        {blocked ? <span className="font-semibold text-danger">{t("printMissingPrice")}</span> : <span>{t("sellingPrice")}: {formatLak(line.priceLak ?? 0)}</span>}
        {!blocked && line.barcode ? <span className="mt-1 block font-mono text-muted-foreground">{line.barcode}</span> : null}
        {blocked ? <Link className="ml-2 font-semibold text-primary" href={`/products/${productId}/edit`}>{t("auditOpenProduct")}</Link> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-semibold">{t("printQuantity")}</span>
        {[1, 5, 10].map((qty) => (
          <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold disabled:opacity-40" disabled={blocked} key={qty} type="button" onClick={() => onChange(line.key, { qty: String(qty) })}>{qty}</button>
        ))}
        <input className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-qty" disabled={blocked} inputMode="numeric" value={line.qty} onChange={(event) => onChange(line.key, { qty: event.target.value })}/>
      </div>
      {!blocked && !line.qtyValid ? <p className="text-xs font-semibold text-danger md:col-span-3">{t("printQtyInvalid")}</p> : null}
    </div>
  );
}

function ShelfCard({ copy, line, locale, modules }: {
  copy: number;
  line: ShelfPrintChoice;
  locale: ReturnType<typeof useAppLocale>;
  modules: BarcodeModule[] | null;
}) {
  const meta = [line.barcode, line.sku].filter(Boolean).join(" · ");
  return (
    <article className="shelf-label grid content-between rounded-md border border-neutral-300 bg-white p-3 text-neutral-950" data-barcode={line.barcode} data-copy={copy} data-price={line.priceLak} data-sku={line.sku} data-testid="products-shelf-label" data-unit={line.unitName}>
      <div>
        <div className="shelf-name text-sm font-semibold leading-tight">{localizedProductName(line, locale)}</div>
        <div className="mt-1 text-xs">{line.unitName}</div>
      </div>
      <div className="shelf-price text-3xl font-black leading-none">{formatLak(line.priceLak ?? 0)}</div>
      <div>
        {modules ? <BarcodeSvg modules={modules}/> : null}
        {meta ? <div className="truncate text-center font-mono text-[10px]">{meta}</div> : null}
      </div>
    </article>
  );
}

function BarcodeSvg({ modules }: { modules: BarcodeModule[] }) {
  const width = modules.reduce((sum, module) => sum + module.width, 0);
  let x = 0;
  const bars = modules.map((module, index) => {
    const rect = module.ink ? <rect fill="#000" height="28" key={index} width={module.width} x={x} y="0"/> : null;
    x += module.width;
    return rect;
  });
  return <svg aria-hidden="true" className="mx-auto h-8 w-4/5" viewBox={`0 0 ${width} 28`}>{bars}</svg>;
}

function lineKey(productId: string, index: number) {
  return `${productId}:${index}`;
}

const printCss = `
@media print {
  @page { size: ${SHELF_LABEL_WIDTH_MM}mm ${SHELF_LABEL_HEIGHT_MM}mm; margin: 1.5mm; }
  body * { visibility: hidden !important; }
  .shelf-print-sheet, .shelf-print-sheet * { visibility: visible !important; }
  .shelf-print-sheet {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: auto !important;
  }
  .shelf-label {
    width: ${SHELF_LABEL_WIDTH_MM - 3}mm;
    height: ${SHELF_LABEL_HEIGHT_MM - 3}mm;
    break-after: page;
    page-break-after: always;
    border: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
    font-family: var(--app-font-family), "Noto Sans Lao", Arial, sans-serif !important;
  }
  .shelf-name {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-word;
    font-size: 9pt;
  }
  .shelf-price { font-size: 18pt; }
  .shelf-label:last-child { break-after: auto; page-break-after: auto; }
}
`;
