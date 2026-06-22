export type ReportDatePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "custom"
  | "all";

export type ReportFilters = {
  branchId?: string;
  cashierId?: string;
  categoryId?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  datePreset: ReportDatePreset;
  paymentMethod?: string;
  supplierId?: string;
  warehouseId?: string;
};

export type ReportFilterOptions = {
  branches: Array<{ id: string; label: string }>;
  cashiers: Array<{ id: string; label: string }>;
  categories: Array<{ id: string; label: string }>;
  customers: Array<{ id: string; label: string }>;
  suppliers: Array<{ id: string; label: string }>;
  warehouses: Array<{ id: string; label: string }>;
};

const ALL = "all";

function startOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date = new Date()) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfWeek(date = new Date()) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function resolveReportDateRange(preset: ReportDatePreset, now = new Date()) {
  switch (preset) {
    case "today":
      return { dateFrom: startOfDay(now), dateTo: endOfDay(now) };
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { dateFrom: startOfDay(yesterday), dateTo: endOfDay(yesterday) };
    }
    case "this_week":
      return { dateFrom: startOfWeek(now), dateTo: endOfDay(now) };
    case "this_month":
      return { dateFrom: startOfMonth(now), dateTo: endOfDay(now) };
    case "all":
      return {};
    case "custom":
    default:
      return {};
  }
}

function parseDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function presetFromLabel(label: string | null): ReportDatePreset {
  switch ((label ?? "").trim().toLowerCase()) {
    case "today":
      return "today";
    case "yesterday":
      return "yesterday";
    case "this week":
      return "this_week";
    case "this month":
      return "this_month";
    case "custom":
      return "custom";
    case "all":
    case "all time":
      return "all";
    default:
      return "this_month";
  }
}

function idFromOption(value: string | null) {
  if (!value || value.startsWith("All ")) return undefined;
  return value;
}

export function parseReportFilters(input: URLSearchParams | Record<string, string | undefined>): ReportFilters {
  const get = (key: string) => {
    if (input instanceof URLSearchParams) return input.get(key);
    return input[key] ?? null;
  };

  const datePreset = (get("datePreset") as ReportDatePreset | null) ?? presetFromLabel(get("dateRange"));
  const customFrom = parseDate(get("dateFrom"));
  const customTo = parseDate(get("dateTo"));
  const presetRange = resolveReportDateRange(datePreset);

  return {
    branchId: idFromOption(get("branchId") ?? get("branch")),
    cashierId: idFromOption(get("cashierId") ?? get("cashier")),
    categoryId: idFromOption(get("categoryId") ?? get("category")),
    customerId: idFromOption(get("customerId") ?? get("customer")),
    dateFrom: customFrom ?? presetRange.dateFrom,
    dateTo: customTo ?? presetRange.dateTo,
    datePreset,
    paymentMethod: idFromOption(get("paymentMethod")),
    supplierId: idFromOption(get("supplierId") ?? get("supplier")),
    warehouseId: idFromOption(get("warehouseId") ?? get("warehouse")),
  };
}

export function reportFiltersToSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.datePreset !== "this_month") params.set("datePreset", filters.datePreset);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom.toISOString());
  if (filters.dateTo) params.set("dateTo", filters.dateTo.toISOString());
  if (filters.branchId) params.set("branchId", filters.branchId);
  if (filters.warehouseId) params.set("warehouseId", filters.warehouseId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.supplierId) params.set("supplierId", filters.supplierId);
  if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters.cashierId) params.set("cashierId", filters.cashierId);
  if (filters.customerId) params.set("customerId", filters.customerId);
  return params;
}

export const REPORT_FILTER_ALL = ALL;
