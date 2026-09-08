"use client";

import type { Warehouse } from "@/features/inventory/types";
import { tInventory } from "@/lib/i18n/inventory-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

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
  const locale = useAppLocale(localeProp);
  const t = (key: string) => tInventory(key, locale);

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
