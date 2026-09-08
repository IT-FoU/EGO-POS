"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, PackagePlus, Plus, Save, Search, Trash2 } from "lucide-react";
import type { Product } from "@/features/products/types";
import type { CurrencyCode, Supplier } from "@/features/purchasing/types";
import type { Warehouse } from "@/features/inventory/types";
import { convertToLak, formatMoney } from "@/features/purchasing/format";
import { WarehouseSelector } from "@/features/inventory/components/warehouse-selector";
import { createPurchaseOrderAction } from "@/features/purchasing/actions";
import { localizedProductName } from "@/features/pos/product-display-name";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { fillPurchasingCopy, localizePurchasingError, tPurchasing } from "@/lib/i18n/purchasing-copy";

type DraftLine = {
  barcode: string;
  expiryDate: string;
  id: string;
  lotNumber: string;
  productId: string;
  productNameEn: string;
  productNameLo: string;
  quantity: number;
  sku: string;
  unitCost: number;
  unitName: string;
};

const exchangeRates: Record<CurrencyCode, number> = {
  LAK: 1,
  THB: 750,
  USD: 22000,
};

export function PurchaseOrderForm({
  locale: localeProp,
  products,
  suppliers,
  warehouses,
}: {
  locale?: SupportedLocale;
  products: Product[];
  suppliers: Supplier[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const locale = useAppLocale(localeProp);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [currency, setCurrency] = useState<CurrencyCode>("LAK");
  const [exchangeRate, setExchangeRate] = useState(exchangeRates.LAK);
  const [paidAmount, setPaidAmount] = useState(0);
  const [productQuery, setProductQuery] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const t = (key: string) => tPurchasing(key, locale);

  const filteredProducts = useMemo(() => {
    const normalized = productQuery.toLowerCase();
    return products.filter(
      (product) =>
        product.nameEn.toLowerCase().includes(normalized) ||
        product.nameLo.toLowerCase().includes(normalized) ||
        product.sku.toLowerCase().includes(normalized) ||
        product.barcode.includes(productQuery),
    );
  }, [productQuery, products]);

  const subtotal = lines.reduce((total, line) => total + line.quantity * line.unitCost, 0);
  const subtotalLak = convertToLak(subtotal, exchangeRate);
  const paidLak = convertToLak(paidAmount, exchangeRate);
  const unpaidLak = Math.max(subtotalLak - paidLak, 0);

  function selectCurrency(nextCurrency: CurrencyCode) {
    setCurrency(nextCurrency);
    setExchangeRate(exchangeRates[nextCurrency]);
  }

  function addProduct(product: Product) {
    const unit = product.units[0];
    setLines((current) => [
      ...current,
      {
        barcode: product.barcode,
        expiryDate: "",
        id: `line-${Date.now()}-${product.id}`,
        lotNumber: "",
        productId: product.id,
        productNameEn: product.nameEn,
        productNameLo: product.nameLo,
        quantity: 1,
        sku: product.sku,
        unitCost: currency === "LAK" ? product.costPriceLak : Math.round(product.costPriceLak / exchangeRate),
        unitName: unit?.unitName ?? "Piece",
      },
    ]);
  }

  function updateLine(lineId: string, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lines.length === 0) {
      setMessage(t("addAtLeastOneLine"));
      return;
    }
    startTransition(async () => {
      const result = await createPurchaseOrderAction({
        currency,
        exchangeRate,
        items: lines.map((line) => ({
          expiryDate: line.expiryDate || undefined,
          lotNumber: line.lotNumber || undefined,
          productId: line.productId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
        paidAmount,
        supplierId,
        warehouseId,
      });
      if (!result.ok) {
        setMessage(localizePurchasingError(result.error ?? t("purchaseOrderSaveFailed"), locale));
        return;
      }
      setMessage(t("purchaseOrderSaved"));
      router.refresh();
      router.push("/purchasing");
    });
  }

  return (
    <form className="flex min-w-0 flex-col gap-6 overflow-x-hidden" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/purchasing">
          <ArrowLeft aria-hidden="true" />
          {t("backToPurchasing")}
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <PackagePlus aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{t("newPurchaseOrderTitle")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("newPurchaseOrderSubtitle")}</p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            disabled={isPending}
            type="submit"
          >
            <Save aria-hidden="true" />
            {isPending ? t("saving") : t("save")}
          </button>
        </div>
      </section>

      {message ? <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">{message}</div> : null}

      <section className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("orderDetails")}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label={t("supplier")}>
                <select className="field-input" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </Field>
              <WarehouseSelector locale={locale} selectedWarehouseId={warehouseId} warehouses={warehouses} onChange={setWarehouseId} />
              <Field label={t("costCurrency")}>
                <select className="field-input" value={currency} onChange={(event) => selectCurrency(event.target.value as CurrencyCode)}>
                  <option value="LAK">LAK</option>
                  <option value="THB">THB</option>
                  <option value="USD">USD</option>
                </select>
              </Field>
              <Field label={t("exchangeRateToLak")}>
                <input
                  className="field-input"
                  min="1"
                  type="number"
                  value={exchangeRate}
                  onChange={(event) => setExchangeRate(Number(event.target.value))}
                />
              </Field>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("productSearch")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("productSearchHint")}</p>
              </div>
              <label className="relative w-full md:w-80">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  aria-label={t("searchProducts")}
                  className="field-input pl-10"
                  placeholder={t("searchProducts")}
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">
              {filteredProducts.map((product) => {
                const primaryName = localizedProductName(product, locale);
                const secondaryName = locale === "lo" ? product.nameEn : product.nameLo;
                return (
                  <button
                    className="min-w-0 rounded-md border border-border p-4 text-left transition hover:border-primary"
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold" title={primaryName}>
                          {primaryName}
                        </div>
                        {secondaryName && secondaryName !== primaryName ? (
                          <div className="mt-1 truncate text-xs text-muted-foreground" title={secondaryName}>
                            {secondaryName}
                          </div>
                        ) : null}
                      </div>
                      <Plus aria-hidden="true" className="text-primary" />
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Barcode aria-hidden="true" />
                      {product.barcode} / {product.sku}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("orderLines")}</h2>
            <div className="mt-5 max-w-full overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">{t("product")}</th>
                    <th className="px-3 py-3">{t("unit")}</th>
                    <th className="px-3 py-3">{t("qty")}</th>
                    <th className="px-3 py-3">{t("unitCost")}</th>
                    <th className="px-3 py-3">{t("lotNumber")}</th>
                    <th className="px-3 py-3">{t("expiryDate")}</th>
                    <th className="px-3 py-3">{t("lineTotal")}</th>
                    <th className="px-3 py-3 text-right">{t("action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr className="border-b border-border last:border-b-0" key={line.id}>
                      <td className="px-3 py-3">
                        <div className="font-semibold">
                          {localizedProductName({ nameEn: line.productNameEn, nameLo: line.productNameLo }, locale)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">{line.sku}</div>
                      </td>
                      <td className="px-3 py-3">
                        <select
                          className="field-input h-10"
                          value={line.unitName}
                          onChange={(event) => updateLine(line.id, { unitName: event.target.value })}
                        >
                          <option>Piece</option>
                          <option>Pack</option>
                          <option>Carton</option>
                          <option>Bag</option>
                          <option>Bottle</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="field-input h-10"
                          min="1"
                          type="number"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="field-input h-10"
                          min="0"
                          type="number"
                          value={line.unitCost}
                          onChange={(event) => updateLine(line.id, { unitCost: Number(event.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="field-input h-10 font-mono"
                          placeholder="LOT-001"
                          value={line.lotNumber}
                          onChange={(event) => updateLine(line.id, { lotNumber: event.target.value })}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          className="field-input h-10"
                          type="date"
                          value={line.expiryDate}
                          onChange={(event) => updateLine(line.id, { expiryDate: event.target.value })}
                        />
                      </td>
                      <td className="px-3 py-3 font-semibold">{formatMoney(line.quantity * line.unitCost, currency)}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          aria-label={t("removeLine")}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-danger transition hover:border-danger"
                          type="button"
                          onClick={() => removeLine(line.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-muted-foreground" colSpan={8}>
                        {t("addProductsHint")}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="min-w-0 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("paymentSummary")}</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label={t("subtotal")} value={formatMoney(subtotal, currency)} />
            <Summary label={t("subtotalLak")} value={formatMoney(subtotalLak, "LAK")} />
            <div>
              <dt className="text-muted-foreground">{fillPurchasingCopy(t("paidAmount"), { currency })}</dt>
              <dd className="mt-1">
                <input
                  className="field-input"
                  min="0"
                  type="number"
                  value={paidAmount}
                  onChange={(event) => setPaidAmount(Number(event.target.value))}
                />
              </dd>
            </div>
            <Summary label={t("paidLak")} value={formatMoney(paidLak, "LAK")} />
            <Summary label={t("unpaidLak")} value={formatMoney(unpaidLak, "LAK")} />
            <Summary label={t("mode")} value={t("realDatabase")} />
          </dl>
        </aside>
      </section>
    </form>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
