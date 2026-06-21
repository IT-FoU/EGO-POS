"use client";

import type { Warehouse } from "@/features/inventory/types";
import { t } from "@/lib/i18n/ui";

export function WarehouseSelector({
  selectedWarehouseId,
  warehouses,
  onChange,
}: {
  selectedWarehouseId: string;
  warehouses: Warehouse[];
  onChange: (warehouseId: string) => void;
}) {
  return (
    <label className="flex min-w-64 flex-col gap-2 text-sm font-medium">{t("ui.warehouse")}
      <select
        className="field-input"
        value={selectedWarehouseId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">{t("ui.all.warehouses")}</option>
        {warehouses.map((warehouse) => (
          <option value={warehouse.id} key={warehouse.id}>
            {warehouse.name} - {warehouse.branchName}
          </option>
        ))}
      </select>
    </label>
  );
}
