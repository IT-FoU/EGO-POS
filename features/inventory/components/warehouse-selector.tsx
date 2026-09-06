"use client";

import { useEffect, useState } from "react";
import type { Warehouse } from "@/features/inventory/types";
import { tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { isSupportedLocale, LOCALE_CHANGE_EVENT, readClientLocale } from "@/lib/i18n/locale";

export function WarehouseSelector({
  selectedWarehouseId,
  warehouses,
  onChange,
  locale: localeProp,
}: {
  selectedWarehouseId: string;
  warehouses: Warehouse[];
  onChange: (warehouseId: string) => void;
  locale?: SupportedLocale;
}) {
  const [locale, setLocale] = useState<SupportedLocale>(localeProp ?? readClientLocale());
  const t = (key: string) => tInventory(key, locale);

  useEffect(() => {
    if (localeProp) {
      setLocale(localeProp);
    }
  }, [localeProp]);

  useEffect(() => {
    function handleLocaleChange(event: Event) {
      const detail = (event as CustomEvent<{ locale?: SupportedLocale }>).detail;
      if (isSupportedLocale(detail?.locale)) {
        setLocale(detail.locale);
      }
    }
    window.addEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, handleLocaleChange);
  }, []);

  return (
    <label className="flex min-w-64 flex-col gap-2 text-sm font-medium">{t("warehouse")}
      <select
        className="field-input"
        value={selectedWarehouseId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">{t("allWarehouses")}</option>
        {warehouses.map((warehouse) => (
          <option value={warehouse.id} key={warehouse.id}>
            {warehouse.name} - {warehouse.branchName}
          </option>
        ))}
      </select>
    </label>
  );
}
