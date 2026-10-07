"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { searchBarcodePrintProductsAction } from "@/features/products/actions";
import { encodeCode128B, fitBarcodeLabelName, parseLabelMillimetres, parsePrintQuantity, unitPrintRole, type BarcodeModule, type BarcodePrintProduct } from "@/features/products/barcode-print";
import { formatLak } from "@/features/products/format";
import {
  DEFAULT_SHELF_LABEL_FIELDS,
  SHELF_LABEL_HEIGHT_MM,
  SHELF_LABEL_WIDTH_MM,
  buildShelfPrintJob,
  resolveShelfLabelSize,
  resolveShelfLabelView,
  shelfLayoutStyle,
  shelfPrintUnits,
  type ShelfLabelFields,
  type ShelfLabelOverride,
  type ShelfLabelPresetId,
  type ShelfLabelStyle,
  type ShelfLayoutId,
  type ShelfPrintChoice,
} from "@/features/products/shelf-print";
import { localizedProductName } from "@/features/pos/product-display-name";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type Draft = { included: boolean; qty: string };
const SIZE_KEY = "ego-pos-shelf-label-design";

export function PrintShelfLabelDrawer({ onClose, selectedIds }: { onClose: () => void; selectedIds: string[] }) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [products, setProducts] = useState<BarcodePrintProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [overrides, setOverrides] = useState<Record<string, ShelfLabelOverride>>({});
  const [fields, setFields] = useState<ShelfLabelFields>(DEFAULT_SHELF_LABEL_FIELDS);
  const [style, setStyle] = useState<ShelfLabelStyle>(shelfLayoutStyle("price"));
  const [preset, setPreset] = useState<ShelfLabelPresetId>("70x40");
  const [customWidth, setCustomWidth] = useState(String(SHELF_LABEL_WIDTH_MM));
  const [customHeight, setCustomHeight] = useState(String(SHELF_LABEL_HEIGHT_MM));
  const [sizeReady, setSizeReady] = useState(false);
  const [bulkQty, setBulkQty] = useState("1");
  const [editingKey, setEditingKey] = useState("");
  const [phase, setPhase] = useState<"choose" | "preview">("choose");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(selectedIds.length > 0);
  const selectionKey = selectedIds.join("\n");
  const size = resolveShelfLabelSize(preset, customWidth, customHeight);
  const customValid = preset !== "custom" || (parseLabelMillimetres(customWidth) !== null && parseLabelMillimetres(customHeight) !== null);

  useEffect(() => {
    if (!selectionKey) return;
    let cancelled = false;
    const ids = selectionKey.split("\n").filter(Boolean);
    void searchBarcodePrintProductsAction({ productIds: ids }).then((response) => {
      if (cancelled) return;
      if (!response.ok || !response.data) {
        const error = response.error ?? "";
        setMessage(error.includes("Permission denied") ? t("printShelfPermissionDenied") : error);
        setLoading(false);
        return;
      }
      const rows = response.data as BarcodePrintProduct[];
      setProducts(rows);
      setDrafts((current) => {
        const next = { ...current };
        for (const product of rows) {
          shelfPrintUnits(product).forEach((unit, index) => {
            const key = lineKey(product.id, index);
            if (next[key]) return;
            next[key] = { included: false, qty: "1" };
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

  useEffect(() => {
    const saved = readSavedDesign();
    setPreset(saved.preset);
    setCustomWidth(saved.width);
    setCustomHeight(saved.height);
    setStyle(shelfLayoutStyle(saved.layout));
    setSizeReady(true);
  }, []);

  useEffect(() => {
    if (!sizeReady) return;
    sessionStorage.setItem(SIZE_KEY, JSON.stringify({ height: customHeight, layout: style.layout, preset, width: customWidth }));
  }, [customHeight, customWidth, preset, sizeReady, style.layout]);

  const lines = useMemo(() => products.flatMap((product) => shelfPrintUnits(product).map((unit, index) => {
    const draft = drafts[lineKey(product.id, index)] ?? { included: false, qty: "1" };
    const copies = parsePrintQuantity(draft.qty);
    return {
      ...unit,
      copies: copies ?? 0,
      included: draft.included,
      key: lineKey(product.id, index),
      localeName: localizedProductName(product, locale),
      qty: draft.qty,
      qtyValid: copies !== null,
    };
  })), [drafts, locale, products]);

  const job = buildShelfPrintJob(lines.filter((line) => line.included).map((line) => ({ ...line, copies: line.copies })));
  const qtyError = lines.some((line) => line.included && !line.qtyValid);
  const sample = lines.find((line) => line.included && !line.missingPrice);
  const selectedUnits = lines.filter((line) => line.included && !line.missingPrice).length;

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? { included: false, qty: "1" }), ...patch } }));
  }

  function selectRole(role: "box" | "pack" | "piece") {
    setDrafts((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (unitPrintRole(line.unitName) !== role || line.missingPrice) continue;
        next[line.key] = { ...(next[line.key] ?? { included: false, qty: "1" }), included: true };
      }
      return next;
    });
  }

  function clearUnits() {
    setDrafts((current) => {
      const next = { ...current };
      for (const line of lines) next[line.key] = { ...(next[line.key] ?? { included: false, qty: "1" }), included: false };
      return next;
    });
  }

  function setQuantityForIncluded() {
    const copies = parsePrintQuantity(bulkQty);
    if (copies === null) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (!line.included) continue;
        next[line.key] = { ...(next[line.key] ?? { included: true, qty: "1" }), qty: String(copies) };
      }
      return next;
    });
  }

  function chooseLayout(layout: ShelfLayoutId) {
    setStyle(shelfLayoutStyle(layout));
  }

  return (
    <div className="grid gap-5" data-layout={style.layout} data-loaded={loading ? "0" : "1"} data-preset={preset} data-product-count={products.length} data-selected-count={selectedIds.length} data-testid="products-print-shelf">
      <style dangerouslySetInnerHTML={{ __html: printCss(size.widthMm, size.heightMm) }}/>
      <p className="text-sm text-muted-foreground print:hidden">{t("shelfLabel")}. {t("printShelfSize")}</p>
      {phase === "choose" ? (
        <div className="grid gap-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" data-testid="products-shelf-selected">{t("printSelectedLoaded")}: {products.length}</p>
            <div className="flex flex-wrap gap-1">
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-all-piece" type="button" onClick={() => selectRole("piece")}>{t("printSelectAllPiece")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-all-pack" type="button" onClick={() => selectRole("pack")}>{t("printSelectAllPack")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-all-box" type="button" onClick={() => selectRole("box")}>{t("printSelectAllBox")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-clear-units" type="button" onClick={clearUnits}>{t("printClearUnits")}</button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold">{t("printSetQtyAll")}<input className="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-qty-all" inputMode="numeric" value={bulkQty} onChange={(event) => setBulkQty(event.target.value)}/></label>
            {[1, 5, 10].map((qty) => <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" key={qty} type="button" onClick={() => setBulkQty(String(qty))}>{qty}</button>)}
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" data-testid="products-shelf-qty-all-apply" type="button" onClick={setQuantityForIncluded}>{t("printSetQtyAll")}</button>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">{t("printBusy")}</p> : null}
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <div className="grid max-h-[36vh] gap-3 overflow-auto">
            {products.map((product) => (
              <section className="rounded-lg border border-border bg-background p-4" data-testid="products-shelf-product" key={product.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{localizedProductName(product, locale)}</h3>
                    {product.sku ? <p className="text-xs text-muted-foreground">{product.sku}</p> : null}
                  </div>
                  <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-remove-product" type="button" onClick={() => setProducts((current) => current.filter((item) => item.id !== product.id))}>{t("printRemoveProduct")}</button>
                </div>
                <div className="mt-3 grid gap-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">{t("printSelectUnits")}</p>
                  {lines.filter((line) => line.productId === product.id).map((line) => (
                    <UnitRow key={line.key} line={line} productId={product.id} t={t} onChange={updateDraft}/>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <ShelfSettings customHeight={customHeight} customWidth={customWidth} fields={fields} preset={preset} style={style} t={t} onCustomHeight={setCustomHeight} onCustomWidth={setCustomWidth} onFields={setFields} onLayout={chooseLayout} onPreset={setPreset} onStyle={setStyle}/>
          <JobSummary layout={style.layout} productCount={products.length} size={size} t={t} total={job.overLimit ? 0 : job.total} units={selectedUnits}/>
          {sample ? <ShelfCard fields={fields} heightMm={size.heightMm} line={sample} localeName={sample.localeName} override={overrides[sample.key]} preview style={style} widthMm={size.widthMm}/> : null}
          {sample ? <button className="h-8 w-fit rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-edit-sample" type="button" onClick={() => setEditingKey(sample.key)}>{t("printEditLabel")}</button> : null}
          {editingKey ? <OverrideEditor fields={fields} line={lines.find((line) => line.key === editingKey)} override={overrides[editingKey]} style={style} t={t} onChange={(patch) => setOverrides((current) => ({ ...current, [editingKey]: { ...current[editingKey], ...patch } }))} onClose={() => setEditingKey("")} onReset={() => { setOverrides((current) => { const next = { ...current }; delete next[editingKey]; return next; }); setEditingKey(""); }}/> : null}
          <p className="text-sm font-semibold" data-testid="products-shelf-total">{t("printTotalLabels")}: {job.overLimit ? 0 : job.total}</p>
          {qtyError || (preset === "custom" && !customValid) ? <p className="text-sm font-semibold text-danger">{t("printQtyInvalid")}</p> : null}
          {job.overLimit ? <p className="text-sm font-semibold text-danger">{t("printTooMany")}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-shelf-preview" disabled={job.total < 1 || qtyError || job.overLimit || !customValid} type="button" onClick={() => setPhase("preview")}>{t("preview")}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <JobSummary layout={style.layout} productCount={products.length} size={size} t={t} total={job.total} units={selectedUnits}/>
            <div className="flex gap-2">
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-shelf-back" type="button" onClick={() => setPhase("choose")}>{t("printBack")}</button>
              <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" data-testid="products-shelf-confirm" type="button" onClick={() => window.print()}>{t("printAction")}</button>
            </div>
          </div>
          <div className="grid gap-2 print:hidden">
            {lines.filter((line) => line.included && !line.missingPrice).map((line) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-testid="products-shelf-job-row" key={line.key}>
                <span className="text-sm font-semibold">{line.localeName} {line.unitName} ×{line.copies}</span>
                <span className="flex gap-1">
                  <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" type="button" onClick={() => updateDraft(line.key, { included: false })}>{t("printRemoveProduct")}</button>
                  <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-shelf-edit" type="button" onClick={() => { setEditingKey(line.key); setPhase("choose"); }}>{t("printEditLabel")}</button>
                </span>
              </div>
            ))}
          </div>
          <div className="shelf-print-sheet grid gap-3 print:block" data-testid="products-shelf-sheet">
            {job.printable.flatMap((line) => {
              const source = lines.find((item) => item.productId === line.productId && item.unitName === line.unitName && item.barcode === line.barcode);
              return Array.from({ length: line.copies }, (_, copy) => (
                <ShelfCard copy={copy} fields={fields} heightMm={size.heightMm} key={`${line.productId}-${line.unitName}-${line.barcode}-${copy}`} line={line} localeName={source?.localeName || localizedProductName(line, locale)} override={source ? overrides[source.key] : undefined} style={style} widthMm={size.widthMm}/>
              ));
            })}
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
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card p-3 md:grid-cols-[auto_1fr_auto] md:items-center" data-barcode={line.barcode} data-price={line.priceLak ?? ""} data-role={unitPrintRole(line.unitName)} data-testid={line.missingPrice ? "products-shelf-missing" : "products-shelf-unit"} data-unit={line.unitName}>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input checked={line.included} data-testid="products-shelf-include" disabled={line.missingPrice} type="checkbox" onChange={(event) => onChange(line.key, { included: event.target.checked })}/>
        {line.unitName}
      </label>
      <div className="text-xs">
        {line.missingPrice ? <span className="font-semibold text-danger">{t("printMissingPrice")}</span> : <span className="font-semibold">{formatLak(line.priceLak ?? 0)}</span>}
        {line.missingPrice ? <Link className="ml-2 font-semibold text-primary" href={`/products/${productId}/edit`}>{t("auditOpenProduct")}</Link> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-semibold">{t("printQuantity")}</span>
        {[1, 5, 10].map((qty) => <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold disabled:opacity-40" disabled={line.missingPrice} key={qty} type="button" onClick={() => onChange(line.key, { qty: String(qty) })}>{qty}</button>)}
        <input className="h-8 w-16 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-qty" disabled={line.missingPrice} inputMode="numeric" value={line.qty} onChange={(event) => onChange(line.key, { qty: event.target.value })}/>
      </div>
    </div>
  );
}

function ShelfSettings({ customHeight, customWidth, fields, onCustomHeight, onCustomWidth, onFields, onLayout, onPreset, onStyle, preset, style, t }: {
  customHeight: string;
  customWidth: string;
  fields: ShelfLabelFields;
  onCustomHeight: (value: string) => void;
  onCustomWidth: (value: string) => void;
  onFields: (value: ShelfLabelFields) => void;
  onLayout: (layout: ShelfLayoutId) => void;
  onPreset: (value: ShelfLabelPresetId) => void;
  onStyle: (value: ShelfLabelStyle) => void;
  preset: ShelfLabelPresetId;
  style: ShelfLabelStyle;
  t: (key: string) => string;
}) {
  const toggles: Array<{ key: keyof ShelfLabelFields; label: string; testId: string }> = [
    { key: "productName", label: t("productName"), testId: "products-shelf-field-name" },
    { key: "unitName", label: t("printUnitName"), testId: "products-shelf-field-unit" },
    { key: "sellingPrice", label: t("sellingPrice"), testId: "products-shelf-field-price" },
    { key: "barcodeGraphic", label: t("printBarcodeGraphic"), testId: "products-shelf-field-graphic" },
    { key: "barcodeText", label: t("printBarcodeNumber"), testId: "products-shelf-field-text" },
    { key: "sku", label: t("sku"), testId: "products-shelf-field-sku" },
  ];
  const layouts: Array<{ id: ShelfLayoutId; label: string }> = [
    { id: "price", label: t("shelfPriceFocus") },
    { id: "balanced", label: t("shelfBalanced") },
    { id: "compact", label: t("shelfCompact") },
  ];
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4" data-testid="products-shelf-settings">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("printLabelSizeTitle")}</p>
      <div className="flex flex-wrap gap-2">
        {(["50x30", "60x40", "70x40"] as const).map((id) => (
          <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${preset === id ? "border-primary bg-primary/10" : "border-border"}`} data-testid={`products-shelf-size-${id}`} key={id} type="button" onClick={() => onPreset(id)}>{id.replace("x", " × ")} mm</button>
        ))}
        <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${preset === "custom" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-shelf-size-custom" type="button" onClick={() => onPreset("custom")}>{t("printCustomSize")}</button>
      </div>
      {preset === "custom" ? (
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs font-semibold">{t("printCustomWidth")}<input className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-custom-width" inputMode="numeric" value={customWidth} onChange={(event) => onCustomWidth(event.target.value)}/></label>
          <label className="grid gap-1 text-xs font-semibold">{t("printCustomHeight")}<input className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-custom-height" inputMode="numeric" value={customHeight} onChange={(event) => onCustomHeight(event.target.value)}/></label>
        </div>
      ) : null}
      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("shelfLayout")}</p>
      <div className="flex flex-wrap gap-2">
        {layouts.map((layout) => (
          <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${style.layout === layout.id ? "border-primary bg-primary/10" : "border-border"}`} data-testid={`products-shelf-layout-${layout.id}`} key={layout.id} type="button" onClick={() => onLayout(layout.id)}>{layout.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {toggles.map((toggle) => (
          <label className="flex items-center gap-2 text-sm" key={toggle.key}>
            <input checked={fields[toggle.key]} data-testid={toggle.testId} type="checkbox" onChange={(event) => onFields({ ...fields, [toggle.key]: event.target.checked })}/>
            {toggle.label}
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <NumberField label={t("printNameSize")} max={28} min={8} testId="products-shelf-name-size" value={style.nameFontPx} onChange={(value) => onStyle({ ...style, nameFontPx: clamp(value, 8, 28) })}/>
        <NumberField label={t("printPriceSize")} max={48} min={12} testId="products-shelf-price-size" value={style.priceFontPx} onChange={(value) => onStyle({ ...style, priceFontPx: clamp(value, 12, 48) })}/>
        <NumberField label={t("shelfUnitSize")} max={20} min={8} testId="products-shelf-unit-size" value={style.unitFontPx} onChange={(value) => onStyle({ ...style, unitFontPx: clamp(value, 8, 20) })}/>
        <NumberField label={t("printSpacing")} max={8} min={0} testId="products-shelf-spacing" value={style.spacingPx} onChange={(value) => onStyle({ ...style, spacingPx: clamp(value, 0, 8) })}/>
        {fields.barcodeGraphic ? <NumberField label={t("printBarcodeSize")} testId="products-shelf-barcode-size" value={style.barcodeScale} onChange={(value) => onStyle({ ...style, barcodeScale: value <= 1 ? 1 : value >= 3 ? 3 : 2 })}/> : null}
        <label className="grid gap-1 text-xs font-semibold">{t("printAlign")}<select className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-align" value={style.align} onChange={(event) => onStyle({ ...style, align: event.target.value === "left" ? "left" : "center" })}><option value="center">{t("printAlignCenter")}</option><option value="left">{t("printAlignLeft")}</option></select></label>
      </div>
    </section>
  );
}

function NumberField({ label, max, min, onChange, testId, value }: { label: string; max?: number; min?: number; onChange: (value: number) => void; testId: string; value: number }) {
  return <label className="grid gap-1 text-xs font-semibold">{label}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid={testId} max={max} min={min} type="number" value={value} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }}/></label>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function JobSummary({ layout, productCount, size, t, total, units }: {
  layout: ShelfLayoutId;
  productCount: number;
  size: { heightMm: number; widthMm: number };
  t: (key: string) => string;
  total: number;
  units: number;
}) {
  const layoutLabel = layout === "balanced" ? t("shelfBalanced") : layout === "compact" ? t("shelfCompact") : t("shelfPriceFocus");
  return (
    <p className="text-sm font-semibold" data-layout={layout} data-size={`${size.widthMm}x${size.heightMm}`} data-testid="products-shelf-summary">
      {productCount} {t("shelfProducts")} · {units} {t("shelfUnits")} · {total} {t("printTotalLabels")} · {size.widthMm} × {size.heightMm} mm · {layoutLabel}
    </p>
  );
}

function OverrideEditor({ fields, line, onChange, onClose, onReset, override, style, t }: {
  fields: ShelfLabelFields;
  line?: { localeName: string };
  onChange: (patch: Partial<ShelfLabelOverride>) => void;
  onClose: () => void;
  onReset: () => void;
  override?: ShelfLabelOverride;
  style: ShelfLabelStyle;
  t: (key: string) => string;
}) {
  if (!line) return null;
  const current = override ?? {};
  return (
    <section className="grid gap-2 rounded-lg border border-border p-4" data-testid="products-shelf-override">
      <p className="text-sm font-semibold">{t("printEditLabel")}</p>
      <p className="text-xs text-muted-foreground">{t("printLabelOnly")}</p>
      <label className="grid gap-1 text-xs font-semibold">{t("productName")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-override-name" value={current.displayName ?? line.localeName} onChange={(event) => onChange({ displayName: event.target.value })}/></label>
      <div className="flex flex-wrap gap-2">
        <NumberField label={t("printNameSize")} max={28} min={8} testId="products-shelf-override-name-size" value={current.nameFontPx ?? style.nameFontPx} onChange={(value) => onChange({ nameFontPx: clamp(value, 8, 28) })}/>
        <NumberField label={t("printPriceSize")} max={48} min={12} testId="products-shelf-override-price-size" value={current.priceFontPx ?? style.priceFontPx} onChange={(value) => onChange({ priceFontPx: clamp(value, 12, 48) })}/>
        <NumberField label={t("shelfUnitSize")} max={20} min={8} testId="products-shelf-override-unit-size" value={current.unitFontPx ?? style.unitFontPx} onChange={(value) => onChange({ unitFontPx: clamp(value, 8, 20) })}/>
        <label className="grid gap-1 text-xs font-semibold">{t("printAlign")}<select className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-shelf-override-align" value={current.align ?? style.align} onChange={(event) => onChange({ align: event.target.value === "left" ? "left" : "center" })}><option value="center">{t("printAlignCenter")}</option><option value="left">{t("printAlignLeft")}</option></select></label>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <Flag checked={current.productName ?? fields.productName} label={t("productName")} onChange={(value) => onChange({ productName: value })}/>
        <Flag checked={current.unitName ?? fields.unitName} label={t("printUnitName")} onChange={(value) => onChange({ unitName: value })}/>
        <Flag checked={current.price ?? fields.sellingPrice} label={t("sellingPrice")} onChange={(value) => onChange({ price: value })}/>
        <Flag checked={current.barcodeGraphic ?? fields.barcodeGraphic} label={t("printBarcodeGraphic")} onChange={(value) => onChange({ barcodeGraphic: value })}/>
        <Flag checked={current.barcodeText ?? fields.barcodeText} label={t("printBarcodeNumber")} onChange={(value) => onChange({ barcodeText: value })}/>
        <Flag checked={current.sku ?? fields.sku} label={t("sku")} onChange={(value) => onChange({ sku: value })}/>
      </div>
      <div className="flex gap-2">
        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" data-testid="products-shelf-reset" type="button" onClick={onReset}>{t("printResetOverride")}</button>
        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={onClose}>{t("printBack")}</button>
      </div>
    </section>
  );
}

function Flag({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2"><input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)}/>{label}</label>;
}

function ShelfCard({ copy = 0, fields, heightMm, line, localeName, override, preview = false, style, widthMm }: {
  copy?: number;
  fields: ShelfLabelFields;
  heightMm: number;
  line: ShelfPrintChoice;
  localeName: string;
  override?: ShelfLabelOverride;
  preview?: boolean;
  style: ShelfLabelStyle;
  widthMm: number;
}) {
  const locale = useAppLocale();
  const view = resolveShelfLabelView({ fields, graphic: line.graphic, line, localeName, override, style });
  const fit = view.showName ? fitBarcodeLabelName(view.displayName, widthMm, view.nameFontPx) : { fontPx: view.nameFontPx, overflow: false };
  const modules = view.showBarcode ? encodeCode128B(view.barcode) : null;
  return (
    <article className="shelf-label grid overflow-hidden rounded-md border border-neutral-300 bg-white text-neutral-950" data-barcode={view.showBarcodeText ? view.barcode : ""} data-copy={copy} data-name={view.displayName} data-overflow={fit.overflow ? "1" : "0"} data-price={view.showPrice ? view.priceLak ?? "" : ""} data-sku={view.showSku ? view.sku : ""} data-testid={preview ? "products-shelf-live-preview" : "products-shelf-label"} data-unit={view.showUnit ? view.unitName : ""} style={{ gap: view.spacingPx, height: `${heightMm}mm`, padding: "1.5mm", textAlign: view.align, width: `${widthMm}mm` }}>
      {view.showName ? <div className="shelf-name font-semibold" style={{ WebkitBoxOrient: "vertical", WebkitLineClamp: 2, display: "-webkit-box", fontSize: `${fit.fontPx}px`, lineHeight: 1.15, overflow: "hidden" }}>{view.displayName}</div> : null}
      {fit.overflow ? <p className="text-[9px] font-semibold text-danger print:hidden" data-testid="products-shelf-name-warning">{tProducts("printNameOverflow", locale)}</p> : null}
      {view.showUnit ? <div style={{ fontSize: `${view.unitFontPx}px` }}>{view.unitName}</div> : null}
      {view.showPrice ? <div className="shelf-price font-black leading-none" style={{ fontSize: `${view.priceFontPx}px` }}>{formatLak(view.priceLak ?? 0)}</div> : null}
      {modules ? <BarcodeSvg modules={modules} scale={style.barcodeScale}/> : null}
      {view.showNoBarcode ? <p className="text-[9px] text-neutral-500 print:hidden" data-testid="products-shelf-no-barcode">{tProducts("shelfNoBarcode", locale)}</p> : null}
      {view.showBarcodeText ? <div className="truncate font-mono text-[10px]">{view.barcode}</div> : null}
      {view.showSku ? <div className="truncate text-[10px]">{view.sku}</div> : null}
    </article>
  );
}

function BarcodeSvg({ modules, scale }: { modules: BarcodeModule[]; scale: 1 | 2 | 3 }) {
  const width = modules.reduce((sum, module) => sum + module.width, 0);
  let x = 0;
  const height = 12 + scale * 6;
  const bars = modules.map((module, index) => {
    const rect = module.ink ? <rect fill="#000" height={height} key={index} width={module.width} x={x} y="0"/> : null;
    x += module.width;
    return rect;
  });
  return <svg aria-hidden="true" className="mx-auto w-3/5" style={{ height: `${height / 4}mm` }} viewBox={`0 0 ${width} ${height}`}>{bars}</svg>;
}

function lineKey(productId: string, index: number) {
  return `${productId}:${index}`;
}

function readSavedDesign(): { height: string; layout: ShelfLayoutId; preset: ShelfLabelPresetId; width: string } {
  const fallback = { height: String(SHELF_LABEL_HEIGHT_MM), layout: "price" as const, preset: "70x40" as const, width: String(SHELF_LABEL_WIDTH_MM) };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SIZE_KEY) ?? "") as { height?: string; layout?: string; preset?: string; width?: string };
    const preset = parsed.preset === "50x30" || parsed.preset === "60x40" || parsed.preset === "70x40" || parsed.preset === "custom" ? parsed.preset : "70x40";
    const layout = parsed.layout === "balanced" || parsed.layout === "compact" || parsed.layout === "price" ? parsed.layout : "price";
    return { height: parsed.height || fallback.height, layout, preset, width: parsed.width || fallback.width };
  } catch {
    return fallback;
  }
}

function printCss(widthMm: number, heightMm: number) {
  return `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 1.5mm; }
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
    width: ${widthMm - 3}mm;
    height: ${heightMm - 3}mm;
    break-after: page;
    page-break-after: always;
    border: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }
  .shelf-label:last-child { break-after: auto; page-break-after: auto; }
}
`;
}
