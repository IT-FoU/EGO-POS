"use client";

import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";

export type EmployeePickerOption = {
  branchName?: string;
  fullName: string;
  status?: "active" | "disabled" | "inactive";
  userId: string;
  username?: string;
};

const COMPANY_DEFAULT_VALUE = "__company_default__";

export function EmployeePicker({
  allowCompanyDefault = false,
  employees,
  id,
  locale,
  onChange,
  preferActive = true,
  value,
}: {
  allowCompanyDefault?: boolean;
  employees: EmployeePickerOption[];
  id?: string;
  locale: SupportedLocale;
  onChange: (userId: string | null) => void;
  preferActive?: boolean;
  value: string | null;
}) {
  const sorted = [...employees].sort((a, b) => {
    if (preferActive) {
      const aActive = a.status === "active" || !a.status ? 0 : 1;
      const bActive = b.status === "active" || !b.status ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
    }
    return a.fullName.localeCompare(b.fullName);
  });
  const selectValue = value == null || value === "" ? (allowCompanyDefault ? COMPANY_DEFAULT_VALUE : "") : value;

  return (
    <label className="grid gap-2 text-sm" htmlFor={id}>
      <span className="font-medium">{tSettings("employee", locale)}</span>
      <select
        className="field-input"
        id={id}
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === COMPANY_DEFAULT_VALUE || next === "") {
            onChange(null);
            return;
          }
          onChange(next);
        }}
      >
        {!allowCompanyDefault ? (
          <option value="">{tSettings("selectEmployee", locale)}</option>
        ) : (
          <option value={COMPANY_DEFAULT_VALUE}>{tSettings("companyDefault", locale)}</option>
        )}
        {sorted.map((employee) => {
          const secondary = [employee.username, employee.branchName].filter(Boolean).join(" · ");
          const inactive = employee.status && employee.status !== "active" ? ` (${tSettings("disabled", locale)})` : "";
          return (
            <option key={employee.userId} value={employee.userId}>
              {employee.fullName}
              {secondary ? ` — ${secondary}` : ""}
              {inactive}
            </option>
          );
        })}
      </select>
      <span className="text-xs text-muted-foreground">{tSettings("employeePickerHelp", locale)}</span>
    </label>
  );
}
