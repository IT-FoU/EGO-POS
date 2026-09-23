"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { tInventory } from "@/lib/i18n/inventory-copy";
import { tProducts } from "@/lib/i18n/products-copy";
import { bulkReorderSettingsAction } from "@/features/products/actions";

type SettingsProduct = {
  barcode: string | null;
  categoryId: string | null;
  categoryName: string;
  id: string;
  minStock: number;
  name: string;
  reorderQtyMode: "AUTO" | "MANUAL";
  targetStock: number;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldClass = `h-10 rounded-md border border-border bg-background px-3 text-sm ${focusRing}`;
const btnPrimary = `inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground ${focusRing}`;
const btnSecondary = `inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-semibold ${focusRing}`;

export function ReorderSettingsClient({
  categories,
  locale: localeProp,
  products,
}: {
  categories: Array<{ id: string; name: string }>;
  locale: SupportedLocale;
  products: SettingsProduct[];
}) {
  const locale = useAppLocale(localeProp);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = (key: string) => tInventory(key, locale);
  const tp = (key: string) => tProducts(key, locale);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [missingReorderLevel, setMissingReorderLevel] = useState(false);
  const [missingTargetStock, setMissingTargetStock] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [minStock, setMinStock] = useState("");
  const [targetStock, setTargetStock] = useState("");
  const [reorderQtyMode, setReorderQtyMode] = useState<"" | "AUTO" | "MANUAL">("");
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryId && product.categoryId !== categoryId) return false;
      if (missingReorderLevel && product.minStock > 0) return false;
      if (missingTargetStock && product.targetStock > 0) return false;
      if (!q) return true;
      const hay = `${product.name} ${product.barcode ?? ""} ${product.categoryName}`.toLowerCase();
      return hay.includes(q);
    });
  }, [categoryId, missingReorderLevel, missingTargetStock, products, search]);

  const selectedIds = useMemo(
    () => filtered.filter((product) => selected[product.id]).map((product) => product.id),
    [filtered, selected],
  );

  const selectAllVisible = () => {
    const next = { ...selected };
    for (const product of filtered) next[product.id] = true;
    setSelected(next);
  };

  const clearSelection = () => {
    const next = { ...selected };
    for (const product of filtered) next[product.id] = false;
    setSelected(next);
  };

  async function onSave() {
    setMessage("");
    if (!selectedIds.length) {
      setMessage(t("selectProducts"));
      return;
    }
    const payload: {
      minStock?: number;
      productIds: string[];
      reorderQtyMode?: "AUTO" | "MANUAL";
      targetStock?: number;
    } = { productIds: selectedIds };

    if (minStock.trim() !== "") {
      const value = Number(minStock);
      if (!(value >= 0)) {
        setMessage(tp("minStockInvalid"));
        return;
      }
      payload.minStock = value;
    }
    if (targetStock.trim() !== "") {
      const value = Number(targetStock);
      if (!(value >= 0)) {
        setMessage(tp("targetStockInvalid"));
        return;
      }
      payload.targetStock = value;
    }
    if (reorderQtyMode === "AUTO" || reorderQtyMode === "MANUAL") {
      payload.reorderQtyMode = reorderQtyMode;
    }
    if (payload.minStock == null && payload.targetStock == null && !payload.reorderQtyMode) {
      setMessage(t("reorderSettingsFailed"));
      return;
    }

    startTransition(async () => {
      const result = await bulkReorderSettingsAction(payload);
      if (!result.ok) {
        setMessage(result.error || t("reorderSettingsFailed"));
        return;
      }
      setMessage(`${t("reorderSettingsSaved")} (${result.data?.updatedProducts ?? selectedIds.length})`);
      setSelected({});
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{t("inventoryManagement")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("reorderSettings")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("reorderSettingsSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className={btnSecondary} href="/inventory">{t("backToInventory")}</Link>
            <Link className={btnSecondary} href="/inventory/reorder">{t("reorder")}</Link>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("scanOrSearch")}
            <input
              className={fieldClass}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchPlaceholder")}
              value={search}
            />
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t("category")}
            <select className={fieldClass} onChange={(event) => setCategoryId(event.target.value)} value={categoryId}>
              <option value="">{t("all")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              checked={missingReorderLevel}
              onChange={(event) => setMissingReorderLevel(event.target.checked)}
              type="checkbox"
            />
            {t("missingReorderLevel")}
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              checked={missingTargetStock}
              onChange={(event) => setMissingTargetStock(event.target.checked)}
              type="checkbox"
            />
            {t("missingTargetStock")}
          </label>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-base font-semibold">{t("applyToSelected")}</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            {tp("reorderLevel")}
            <input className={fieldClass} inputMode="decimal" onChange={(e) => setMinStock(e.target.value)} placeholder="—" value={minStock} />
          </label>
          <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            {tp("targetStock")}
            <input className={fieldClass} inputMode="decimal" onChange={(e) => setTargetStock(e.target.value)} placeholder="—" value={targetStock} />
          </label>
          <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-muted-foreground">
            {tp("reorderQtyMode")}
            <select className={fieldClass} onChange={(e) => setReorderQtyMode(e.target.value as "" | "AUTO" | "MANUAL")} value={reorderQtyMode}>
              <option value="">—</option>
              <option value="AUTO">{tp("reorderQtyModeAuto")}</option>
              <option value="MANUAL">{tp("reorderQtyModeManual")}</option>
            </select>
          </label>
          <button className={btnSecondary} onClick={selectAllVisible} type="button">{t("all")}</button>
          <button className={btnSecondary} onClick={clearSelection} type="button">{t("cancel")}</button>
          <button className={btnPrimary} disabled={pending || !selectedIds.length} onClick={() => void onSave()} type="button">
            {pending ? t("saving") : t("save")}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-muted-foreground">{message}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {t("selectProducts")}: {selectedIds.length} / {filtered.length}
        </p>
      </section>

      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">☐</th>
              <th className="px-3 py-2">{t("product")}</th>
              <th className="px-3 py-2">{t("barcode")}</th>
              <th className="px-3 py-2">{t("category")}</th>
              <th className="px-3 py-2 text-right">{tp("reorderLevel")}</th>
              <th className="px-3 py-2 text-right">{tp("targetStock")}</th>
              <th className="px-3 py-2">{tp("reorderQtyMode")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-muted-foreground" colSpan={7}>{t("noProductsMatch")}</td>
              </tr>
            ) : (
              filtered.map((product) => (
                <tr className="border-t border-border" key={product.id}>
                  <td className="px-3 py-2">
                    <input
                      checked={Boolean(selected[product.id])}
                      onChange={(event) => setSelected((prev) => ({ ...prev, [product.id]: event.target.checked }))}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">{product.name}</td>
                  <td className="px-3 py-2">{product.barcode || "—"}</td>
                  <td className="px-3 py-2">{product.categoryName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.minStock}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.targetStock}</td>
                  <td className="px-3 py-2">{product.reorderQtyMode}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
