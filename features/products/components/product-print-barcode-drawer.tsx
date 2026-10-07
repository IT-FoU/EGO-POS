"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { searchBarcodePrintProductsAction } from "@/features/products/actions";
import {
  BARCODE_LABEL_HEIGHT_MM,
  BARCODE_LABEL_WIDTH_MM,
  BARCODE_NAME_MAX_FONT_PX,
  BARCODE_NAME_MIN_FONT_PX,
  BARCODE_PRICE_MAX_FONT_PX,
  BARCODE_PRICE_MIN_FONT_PX,
  BARCODE_SCALE_MAX,
  DEFAULT_BARCODE_LABEL_FIELDS,
  DEFAULT_BARCODE_LABEL_LAYOUT,
  applyLabelFit,
  barcodePrintUnits,
  buildBarcodePrintJob,
  encodeCode128B,
  parseLabelMillimetres,
  parsePrintQuantity,
  resolveBarcodeLabelSize,
  resolveBarcodeLabelView,
  unitPrintRole,
  type BarcodeLabelFields,
  type BarcodeLabelLayout,
  type BarcodeLabelOverride,
  type BarcodeLabelPresetId,
  type BarcodeModule,
  type BarcodePrintChoice,
  type BarcodePrintProduct,
} from "@/features/products/barcode-print";
import { formatLak } from "@/features/products/format";
import { SelectedProductsList, selectedProductsPrintGridClassName, selectedProductsRowClassName } from "@/features/products/components/selected-products-list";
import { localizedProductName } from "@/features/pos/product-display-name";
import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type Draft = { included: boolean; qty: string };
type Locale = ReturnType<typeof useAppLocale>;

const SIZE_KEY = "ego-pos-barcode-label-size";

export function PrintBarcodeDrawer({ onClose, selectedIds }: { onClose: () => void; selectedIds: string[] }) {
  const locale = useAppLocale();
  const t = (key: string) => tProducts(key, locale);
  const [products, setProducts] = useState<BarcodePrintProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [overrides, setOverrides] = useState<Record<string, BarcodeLabelOverride>>({});
  const [fields, setFields] = useState<BarcodeLabelFields>(DEFAULT_BARCODE_LABEL_FIELDS);
  const [layout, setLayout] = useState<BarcodeLabelLayout>(DEFAULT_BARCODE_LABEL_LAYOUT);
  const [preset, setPreset] = useState<BarcodeLabelPresetId>("50x30");
  const [customWidth, setCustomWidth] = useState(String(BARCODE_LABEL_WIDTH_MM));
  const [customHeight, setCustomHeight] = useState(String(BARCODE_LABEL_HEIGHT_MM));
  const [sizeReady, setSizeReady] = useState(false);
  const [bulkQty, setBulkQty] = useState("1");
  const [editingKey, setEditingKey] = useState("");
  const [phase, setPhase] = useState<"choose" | "preview">("choose");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(selectedIds.length > 0);
  const selectionKey = selectedIds.join("\n");
  const size = resolveBarcodeLabelSize(preset, customWidth, customHeight);
  const customValid = preset !== "custom" || (parseLabelMillimetres(customWidth) !== null && parseLabelMillimetres(customHeight) !== null);

  useEffect(() => {
    if (!selectionKey) return;
    let cancelled = false;
    const ids = selectionKey.split("\n").filter(Boolean);
    void searchBarcodePrintProductsAction({ productIds: ids }).then((response) => {
      if (cancelled) return;
      if (!response.ok || !response.data) {
        const error = response.error ?? "";
        setMessage(error.includes("Permission denied") ? t("printPermissionDenied") : error);
        setLoading(false);
        return;
      }
      const rows = response.data as BarcodePrintProduct[];
      setProducts(rows);
      setDrafts((current) => {
        const next = { ...current };
        for (const product of rows) {
          barcodePrintUnits(product).forEach((unit, index) => {
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
    const saved = readSavedSize();
    setPreset(saved.preset);
    setCustomWidth(saved.width);
    setCustomHeight(saved.height);
    setSizeReady(true);
  }, []);

  useEffect(() => {
    if (!sizeReady) return;
    sessionStorage.setItem(SIZE_KEY, JSON.stringify({ height: customHeight, preset, width: customWidth }));
  }, [customHeight, customWidth, preset, sizeReady]);

  const lines = useMemo(() => products.flatMap((product) => barcodePrintUnits(product).map((unit, index) => {
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

  const job = buildBarcodePrintJob(lines.filter((line) => line.included).map((line) => ({ ...line, copies: line.copies })));
  const qtyError = lines.some((line) => line.included && !line.qtyValid);
  const sample = lines.find((line) => line.included && !line.missing && line.encodable);

  function updateDraft(key: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] ?? { included: false, qty: "1" }), ...patch } }));
  }

  function selectRole(role: "box" | "pack" | "piece") {
    setDrafts((current) => {
      const next = { ...current };
      for (const line of lines) {
        if (unitPrintRole(line.unitName) !== role || line.missing || !line.encodable) continue;
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

  function removeProduct(productId: string) {
    setProducts((current) => current.filter((product) => product.id !== productId));
    setEditingKey("");
  }

  function printLabels() {
    window.print();
  }

  return (
    <div className="grid gap-5" data-loaded={loading ? "0" : "1"} data-preset={preset} data-product-count={products.length} data-selected-count={selectedIds.length} data-testid="products-print-barcode">
      <style dangerouslySetInnerHTML={{ __html: printCss(size.widthMm, size.heightMm) }}/>
      <p className="text-sm text-muted-foreground print:hidden">{t("printLabelSize")} {t("printOnePerPage")}</p>
      {phase === "choose" ? (
        <div className="grid gap-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" data-testid="products-print-selected">{t("printSelectedLoaded")}: {products.length}</p>
            <div className="flex flex-wrap gap-1">
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-all-piece" type="button" onClick={() => selectRole("piece")}>{t("printSelectAllPiece")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-all-pack" type="button" onClick={() => selectRole("pack")}>{t("printSelectAllPack")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-all-box" type="button" onClick={() => selectRole("box")}>{t("printSelectAllBox")}</button>
              <button className="h-9 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-clear-units" type="button" onClick={clearUnits}>{t("printClearUnits")}</button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs font-semibold">
              {t("printSetQtyAll")}
              <input className="h-9 w-20 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-qty-all" inputMode="numeric" value={bulkQty} onChange={(event) => setBulkQty(event.target.value)}/>
            </label>
            <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" data-testid="products-print-qty-all-apply" type="button" onClick={setQuantityForIncluded}>{t("quantityOk")}</button>
          </div>
          {loading ? <p className="text-sm text-muted-foreground">{t("printBusy")}</p> : null}
          {message ? <p className="text-sm font-semibold text-danger">{message}</p> : null}
          <SelectedProductsList>
            <div className={`${selectedProductsRowClassName} ${selectedProductsPrintGridClassName} sticky top-0 z-10 text-xs font-semibold uppercase text-muted-foreground`}>
              <span>{t("productName")}</span>
              <span>{t("unit")}</span>
              <span>{t("barcode")}</span>
              <span>{t("printQuantity")}</span>
              <span/>
            </div>
            {products.map((product) => (
              <div data-testid="products-print-product" key={product.id}>
                {lines.filter((line) => line.productId === product.id).map((line) => (
                  <UnitRow key={line.key} line={line} productId={product.id} productName={localizedProductName(product, locale)} t={t} onChange={updateDraft} onRemove={() => removeProduct(product.id)}/>
                ))}
              </div>
            ))}
          </SelectedProductsList>
          <LabelSettings customHeight={customHeight} customWidth={customWidth} fields={fields} layout={layout} preset={preset} t={t} onCustomHeight={setCustomHeight} onCustomWidth={setCustomWidth} onFields={setFields} onLayout={setLayout} onPreset={setPreset}/>
          {sample ? <LivePreview fields={fields} layout={layout} line={sample} locale={locale} override={overrides[sample.key]} size={size} t={t} onEdit={() => setEditingKey(sample.key)}/> : null}
          {editingKey ? <OverrideEditor fields={fields} line={lines.find((line) => line.key === editingKey)} override={overrides[editingKey]} t={t} onChange={(patch) => setOverrides((current) => ({ ...current, [editingKey]: { ...current[editingKey], ...patch } }))} onClose={() => setEditingKey("")} onReset={() => { setOverrides((current) => { const next = { ...current }; delete next[editingKey]; return next; }); setEditingKey(""); }}/> : null}
          <p className="text-sm font-semibold" data-testid="products-print-total">{t("printTotalLabels")}: {job.overLimit ? 0 : job.total}</p>
          {qtyError || (preset === "custom" && !customValid) ? <p className="text-sm font-semibold text-danger">{t("printQtyInvalid")}</p> : null}
          {job.overLimit ? <p className="text-sm font-semibold text-danger">{t("printTooMany")}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
            <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="products-print-preview" disabled={job.total < 1 || qtyError || job.overLimit || !customValid} type="button" onClick={() => setPhase("preview")}>{t("preview")}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <p className="text-sm font-semibold" data-testid="products-print-total">{t("printTotalLabels")}: {job.total}</p>
            <div className="flex gap-2">
              <button className="h-11 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-print-back" type="button" onClick={() => setPhase("choose")}>{t("printBack")}</button>
              <button className="h-11 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" data-testid="products-print-confirm" type="button" onClick={printLabels}>{t("printAction")}</button>
            </div>
          </div>
          <div className="grid gap-2 print:hidden">
            {lines.filter((line) => line.included && !line.missing && line.encodable).map((line) => (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-testid="products-print-job-row" key={line.key}>
                <span className="text-sm font-semibold">{line.localeName} {line.unitName} ×{line.copies}</span>
                <span className="flex gap-1">
                  <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" type="button" onClick={() => updateDraft(line.key, { included: false })}>{t("printRemoveProduct")}</button>
                  <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-edit" type="button" onClick={() => { setEditingKey(line.key); setPhase("choose"); }}>{t("printEditLabel")}</button>
                </span>
              </div>
            ))}
          </div>
          <div className="barcode-print-sheet grid gap-3 print:block" data-testid="products-print-sheet">
            {job.printable.flatMap((line) => {
              const source = lines.find((item) => item.productId === line.productId && item.unitName === line.unitName && item.barcode === line.barcode);
              return Array.from({ length: line.copies }, (_, copy) => (
                <LabelCard copy={copy} fields={fields} heightMm={size.heightMm} key={`${line.productId}-${line.unitName}-${line.barcode}-${copy}`} layout={layout} line={line} localeName={source?.localeName || localizedProductName(line, locale)} override={source ? overrides[source.key] : undefined} widthMm={size.widthMm}/>
              ));
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitRow({ line, onChange, onRemove, productId, productName, t }: {
  line: BarcodePrintChoice & { included: boolean; key: string; qty: string; qtyValid: boolean };
  onChange: (key: string, patch: Partial<Draft>) => void;
  onRemove: () => void;
  productId: string;
  productName: string;
  t: (key: string) => string;
}) {
  const blocked = line.missing || !line.encodable;
  return (
    <div className={`${selectedProductsRowClassName} ${selectedProductsPrintGridClassName}`} data-barcode={line.barcode} data-role={unitPrintRole(line.unitName)} data-testid={blocked ? "products-print-missing" : "products-print-unit"} data-unit={line.unitName}>
      <span className="truncate font-semibold">{productName}</span>
      <label className="flex items-center gap-2 font-semibold">
        <input checked={line.included} data-testid="products-print-include" disabled={blocked} type="checkbox" onChange={(event) => onChange(line.key, { included: event.target.checked })}/>
        <span className="truncate">{line.unitName}</span>
      </label>
      <span className="truncate text-xs">
        {line.missing ? <span className="font-semibold text-danger">{t("printMissingBarcode")}</span> : null}
        {!line.missing && !line.encodable ? <span className="font-semibold text-danger">{t("printUnencodable")}</span> : null}
        {!blocked ? <span className="font-mono">{line.barcode}</span> : null}
        {blocked ? <Link className="ml-2 font-semibold text-primary" href={`/products/${productId}/edit`}>{t("auditOpenProduct")}</Link> : null}
      </span>
      <input className="h-8 w-full rounded-md border border-border bg-white px-2 text-sm" data-testid="products-print-qty" disabled={blocked} inputMode="numeric" value={line.qty} onChange={(event) => onChange(line.key, { qty: event.target.value })}/>
      <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-remove-product" type="button" onClick={onRemove}>{t("printRemoveProduct")}</button>
    </div>
  );
}

function LabelSettings({ customHeight, customWidth, fields, layout, onCustomHeight, onCustomWidth, onFields, onLayout, onPreset, preset, t }: {
  customHeight: string;
  customWidth: string;
  fields: BarcodeLabelFields;
  layout: BarcodeLabelLayout;
  onCustomHeight: (value: string) => void;
  onCustomWidth: (value: string) => void;
  onFields: (value: BarcodeLabelFields) => void;
  onLayout: (value: BarcodeLabelLayout) => void;
  onPreset: (value: BarcodeLabelPresetId) => void;
  preset: BarcodeLabelPresetId;
  t: (key: string) => string;
}) {
  const toggles: Array<{ key: keyof BarcodeLabelFields; label: string; testId: string }> = [
    { key: "productName", label: t("productName"), testId: "products-print-field-name" },
    { key: "unitName", label: t("printUnitName"), testId: "products-print-field-unit" },
    { key: "barcodeGraphic", label: t("printBarcodeGraphic"), testId: "products-print-field-graphic" },
    { key: "barcodeText", label: t("printBarcodeNumber"), testId: "products-print-field-text" },
    { key: "sku", label: t("sku"), testId: "products-print-field-sku" },
    { key: "sellingPrice", label: t("sellingPrice"), testId: "products-print-field-price" },
  ];
  return (
    <section className="grid gap-3 rounded-lg border border-border p-4" data-testid="products-print-settings">
      <div className="flex flex-wrap gap-2">
        {(["40x25", "50x30", "60x40"] as const).map((id) => (
          <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${preset === id ? "border-primary bg-primary/10" : "border-border"}`} data-testid={`products-print-size-${id}`} key={id} type="button" onClick={() => onPreset(id)}>{id.replace("x", " × ")} mm</button>
        ))}
        <button className={`h-9 rounded-md border px-3 text-xs font-semibold ${preset === "custom" ? "border-primary bg-primary/10" : "border-border"}`} data-testid="products-print-size-custom" type="button" onClick={() => onPreset("custom")}>{t("printCustomSize")}</button>
      </div>
      {preset === "custom" ? (
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-xs font-semibold">{t("printCustomWidth")}<input className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-custom-width" inputMode="numeric" value={customWidth} onChange={(event) => onCustomWidth(event.target.value)}/></label>
          <label className="grid gap-1 text-xs font-semibold">{t("printCustomHeight")}<input className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-custom-height" inputMode="numeric" value={customHeight} onChange={(event) => onCustomHeight(event.target.value)}/></label>
        </div>
      ) : null}
      <p className="text-xs font-semibold uppercase text-muted-foreground">{t("printLabelSizeTitle")}</p>
      <div className="flex flex-wrap gap-3">
        {toggles.map((toggle) => (
          <label className="flex items-center gap-2 text-sm" key={toggle.key}>
            <input checked={fields[toggle.key]} data-testid={toggle.testId} type="checkbox" onChange={(event) => onFields({ ...fields, [toggle.key]: event.target.checked })}/>
            {toggle.label}
          </label>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold">{t("printNameSize")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-name-size" max={BARCODE_NAME_MAX_FONT_PX} min={BARCODE_NAME_MIN_FONT_PX} type="number" value={layout.nameFontPx} onChange={(event) => onLayout({ ...layout, nameFontPx: clampFont(Number(event.target.value), BARCODE_NAME_MIN_FONT_PX, BARCODE_NAME_MAX_FONT_PX, layout.nameFontPx) })}/></label>
        <label className="grid gap-1 text-xs font-semibold">{t("printBarcodeSize")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-barcode-size" max={BARCODE_SCALE_MAX} min={1} type="number" value={layout.barcodeScale} onChange={(event) => onLayout({ ...layout, barcodeScale: clampScale(Number(event.target.value)) })}/></label>
        <label className="grid gap-1 text-xs font-semibold">{t("printSpacing")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-spacing" max={8} min={0} type="number" value={layout.spacingPx} onChange={(event) => onLayout({ ...layout, spacingPx: Math.max(0, Math.min(8, Number(event.target.value) || 0)) })}/></label>
        <label className="grid gap-1 text-xs font-semibold">{t("printAlign")}<select className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-align" value={layout.align} onChange={(event) => onLayout({ ...layout, align: event.target.value === "left" ? "left" : "center" })}><option value="center">{t("printAlignCenter")}</option><option value="left">{t("printAlignLeft")}</option></select></label>
        {fields.sellingPrice ? <label className="grid gap-1 text-xs font-semibold">{t("printPriceSize")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-price-size" max={BARCODE_PRICE_MAX_FONT_PX} min={BARCODE_PRICE_MIN_FONT_PX} type="number" value={layout.priceFontPx} onChange={(event) => onLayout({ ...layout, priceFontPx: clampFont(Number(event.target.value), BARCODE_PRICE_MIN_FONT_PX, BARCODE_PRICE_MAX_FONT_PX, layout.priceFontPx) })}/></label> : null}
      </div>
    </section>
  );
}

function LivePreview({ fields, layout, line, locale, onEdit, override, size, t }: {
  fields: BarcodeLabelFields;
  layout: BarcodeLabelLayout;
  line: BarcodePrintChoice & { localeName: string };
  locale: Locale;
  onEdit: () => void;
  override?: BarcodeLabelOverride;
  size: { heightMm: number; widthMm: number };
  t: (key: string) => string;
}) {
  return (
    <div className="grid justify-items-start gap-2">
      <LabelCard copy={0} fields={fields} heightMm={size.heightMm} layout={layout} line={line} localeName={line.localeName || localizedProductName(line, locale)} override={override} preview widthMm={size.widthMm}/>
      <button className="h-8 rounded-md border border-border px-2 text-xs font-semibold" data-testid="products-print-edit-sample" type="button" onClick={onEdit}>{t("printEditLabel")}</button>
    </div>
  );
}

function OverrideEditor({ fields, line, onChange, onClose, onReset, override, t }: {
  fields: BarcodeLabelFields;
  line?: { key: string; localeName: string };
  onChange: (patch: Partial<BarcodeLabelOverride>) => void;
  onClose: () => void;
  onReset: () => void;
  override?: BarcodeLabelOverride;
  t: (key: string) => string;
}) {
  if (!line) return null;
  const current = override ?? {};
  return (
    <section className="grid gap-2 rounded-lg border border-border p-4" data-testid="products-print-override">
      <p className="text-sm font-semibold">{t("printEditLabel")}</p>
      <p className="text-xs text-muted-foreground">{t("printLabelOnly")}</p>
      <label className="grid gap-1 text-xs font-semibold">{t("productName")}<input className="h-9 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-override-name" value={current.displayName ?? line.localeName} onChange={(event) => onChange({ displayName: event.target.value })}/></label>
      <label className="grid gap-1 text-xs font-semibold">{t("printNameSize")}<input className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm" data-testid="products-print-override-font" max={BARCODE_NAME_MAX_FONT_PX} min={BARCODE_NAME_MIN_FONT_PX} type="number" value={current.nameFontPx ?? 12} onChange={(event) => onChange({ nameFontPx: clampFont(Number(event.target.value), BARCODE_NAME_MIN_FONT_PX, BARCODE_NAME_MAX_FONT_PX, current.nameFontPx ?? 12) })}/></label>
      <div className="flex flex-wrap gap-3 text-sm">
        <OverrideFlag checked={current.productName ?? fields.productName} label={t("productName")} testId="products-print-override-name-toggle" onChange={(value) => onChange({ productName: value })}/>
        <OverrideFlag checked={current.unitName ?? fields.unitName} label={t("printUnitName")} onChange={(value) => onChange({ unitName: value })}/>
        <OverrideFlag checked={current.barcodeText ?? fields.barcodeText} label={t("printBarcodeNumber")} onChange={(value) => onChange({ barcodeText: value })}/>
        <OverrideFlag checked={current.sku ?? fields.sku} label={t("sku")} onChange={(value) => onChange({ sku: value })}/>
        <OverrideFlag checked={current.price ?? fields.sellingPrice} label={t("sellingPrice")} onChange={(value) => onChange({ price: value })}/>
      </div>
      <div className="flex gap-2">
        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" data-testid="products-print-reset" type="button" onClick={onReset}>{t("printResetOverride")}</button>
        <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={onClose}>{t("printBack")}</button>
      </div>
    </section>
  );
}

function OverrideFlag({ checked, label, onChange, testId }: { checked: boolean; label: string; onChange: (value: boolean) => void; testId?: string }) {
  return (
    <label className="flex items-center gap-2">
      <input checked={checked} data-testid={testId} type="checkbox" onChange={(event) => onChange(event.target.checked)}/>
      {label}
    </label>
  );
}

function LabelCard({ copy, fields, heightMm, layout, line, localeName, override, preview = false, widthMm }: {
  copy: number;
  fields: BarcodeLabelFields;
  heightMm: number;
  layout: BarcodeLabelLayout;
  line: BarcodePrintChoice;
  localeName: string;
  override?: BarcodeLabelOverride;
  preview?: boolean;
  widthMm: number;
}) {
  const locale = useAppLocale();
  const view = applyLabelFit(resolveBarcodeLabelView({ fields, layout, line, localeName, override }), widthMm);
  const modules = view.showBarcode ? encodeCode128B(view.barcode) : null;
  const pricePx = clampFont(layout.priceFontPx, BARCODE_PRICE_MIN_FONT_PX, BARCODE_PRICE_MAX_FONT_PX, layout.priceFontPx);
  const barcodeMm = modules ? (18 + layout.barcodeScale * 10) / 3 : 0;
  const nameMm = view.showName ? (view.fontPx * 1.15) / 3.78 : 0;
  const priceMm = view.showPrice ? pricePx / 3.78 : 0;
  const priceTight = barcodeMm + nameMm + priceMm + 4 > heightMm;
  return (
    <article className="barcode-label grid overflow-hidden rounded-md border border-neutral-300 bg-white text-neutral-950" data-barcode={view.barcode} data-copy={copy} data-name={view.displayName} data-overflow={view.overflow || priceTight ? "1" : "0"} data-price={view.showPrice ? view.priceLak : ""} data-sku={view.showSku ? view.sku : ""} data-testid={preview ? "products-print-live-preview" : "products-print-label"} data-unit={view.showUnit ? view.unitName : ""} style={{ gap: view.spacingPx, height: `${heightMm}mm`, padding: "1.5mm", textAlign: view.align, width: `${widthMm}mm` }}>
      {view.showName ? <div className="font-semibold" style={{ WebkitBoxOrient: "vertical", WebkitLineClamp: 3, display: "-webkit-box", fontSize: `${view.fontPx}px`, lineHeight: 1.15, overflow: "hidden" }}>{view.displayName}</div> : null}
      {view.overflow ? <p className="text-[9px] font-semibold text-danger print:hidden" data-testid="products-print-name-warning">{tProducts("printNameOverflow", locale)}</p> : null}
      {view.showUnit ? <div className="text-[10px]">{view.unitName}</div> : null}
      {modules ? <BarcodeSvg modules={modules} scale={layout.barcodeScale}/> : null}
      {view.showBarcodeText ? <div className="truncate font-mono text-[10px]">{view.barcode}</div> : null}
      {view.showSku ? <div className="truncate text-[10px]">{view.sku}</div> : null}
      {view.showPrice ? <div className="overflow-hidden font-semibold leading-none" style={{ fontSize: `${pricePx}px` }}>{formatLak(view.priceLak)}</div> : null}
      {priceTight ? <p className="text-[9px] font-semibold text-danger print:hidden" data-testid="products-print-size-warning">{tProducts("printSizeOverflow", locale)}</p> : null}
    </article>
  );
}

function BarcodeSvg({ modules, scale }: { modules: BarcodeModule[]; scale: 1 | 2 | 3 | 4 | 5 }) {
  const width = modules.reduce((sum, module) => sum + module.width, 0);
  let x = 0;
  const height = 18 + scale * 10;
  const bars = modules.map((module, index) => {
    const rect = module.ink ? <rect fill="#000" height={height} key={index} width={module.width} x={x} y="0"/> : null;
    x += module.width;
    return rect;
  });
  return <svg aria-hidden="true" className="w-full" style={{ height: `${height / 3}mm` }} viewBox={`0 0 ${width} ${height}`}>{bars}</svg>;
}

function clampScale(value: number): 1 | 2 | 3 | 4 | 5 {
  const scale = Math.round(value);
  if (!Number.isFinite(scale) || scale <= 1) return 1;
  if (scale >= BARCODE_SCALE_MAX) return BARCODE_SCALE_MAX;
  return scale as 1 | 2 | 3 | 4 | 5;
}

function clampFont(value: number, min: number, max: number, fallback: number) {
  const next = Math.round(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
}

function lineKey(productId: string, index: number) {
  return `${productId}:${index}`;
}

function readSavedSize(): { height: string; preset: BarcodeLabelPresetId; width: string } {
  const fallback = { height: String(BARCODE_LABEL_HEIGHT_MM), preset: "50x30" as const, width: String(BARCODE_LABEL_WIDTH_MM) };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SIZE_KEY) ?? "") as { height?: string; preset?: string; width?: string };
    const preset = parsed.preset === "40x25" || parsed.preset === "50x30" || parsed.preset === "60x40" || parsed.preset === "custom" ? parsed.preset : "50x30";
    return { height: parsed.height || fallback.height, preset, width: parsed.width || fallback.width };
  } catch {
    return fallback;
  }
}

function printCss(widthMm: number, heightMm: number) {
  return `
@media print {
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 1mm; }
  body * { visibility: hidden !important; }
  .barcode-print-sheet, .barcode-print-sheet * { visibility: visible !important; }
  .barcode-print-sheet {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    display: block !important;
    width: auto !important;
  }
  .barcode-label {
    width: ${widthMm - 2}mm;
    height: ${heightMm - 2}mm;
    break-after: page;
    page-break-after: always;
    border: 0 !important;
    box-shadow: none !important;
    overflow: hidden !important;
  }
  .barcode-label:last-child { break-after: auto; page-break-after: auto; }
}
`;
}
