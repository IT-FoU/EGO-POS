"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarClock, ChevronDown, Download, Eye, FileSpreadsheet, FileText, HeartPulse, Printer, RefreshCcw, Search, Send, Star, TrendingUp, type LucideIcon, } from "lucide-react";
import type { ReportsAnalyticsHub } from "@/features/reports/build-analytics-hub";
import { currencyRates, type ReportCurrency } from "@/features/reports/currency-rates";
import { executiveReports, reportCategories, type ReportCategory } from "@/features/reports/report-catalog";
import type { ReportFilterOptions, ReportFilters } from "@/features/reports/report-filters";
import { reportFiltersToSearchParams } from "@/features/reports/report-filters";
import { formatLak, formatNumber } from "@/features/reports/format";
import type { ProductReportRow, ReportKpiKey } from "@/features/reports/types";
import { formatBusinessMediumDateTime } from "@/lib/datetime/business-timezone";
const datePresetLabels = {
    all: "All Time",
    custom: "Custom",
    this_month: "This Month",
    this_week: "This Week",
    today: "Today",
    yesterday: "Yesterday",
} as const;

type TabKey = "dashboard" | "center";

function buildSelectOptions(allLabel: string, options: Array<{ id: string; label: string }>) {
    if (options.length <= 1) {
        return options.map((option) => ({ label: option.label, value: option.id }));
    }
    return [{ label: allLabel, value: "" }, ...options.map((option) => ({ label: option.label, value: option.id }))];
}
type ModalKind = "kpi" | "health" | "daily" | "hour" | "category" | "inventory" | "product" | "deadstock" | "report" | "export" | "schedule" | "favorites" | "dataSource";
type DataSourceStatus = {
    count: number;
    name: string;
    reports: string[];
    status: string;
};
function buildDataSourceStatuses(hub: ReportsAnalyticsHub): DataSourceStatus[] {
    const transactions = hub.kpis.find((kpi) => kpi.key === "transactions")?.value ?? 0;
    const customers = hub.kpis.find((kpi) => kpi.key === "customers")?.value ?? 0;
    const inventoryAlertCount = hub.inventoryAlerts.reduce((total, alert) => total + alert.count, 0);
    const lowStockCount = hub.inventoryAlerts.find((alert) => alert.key === "low_stock")?.count ?? 0;
    const deadStockCount = hub.deadStockProducts.length;
    const paymentChannelCount = hub.paymentBreakdown.length;
    return [
        { count: transactions, name: "Sales", reports: ["Sales Summary", "Sales by Hour"], status: "Synced" },
        { count: inventoryAlertCount, name: "Inventory", reports: ["Current Stock", "Low Stock", "Dead Stock"], status: "Synced" },
        { count: lowStockCount, name: "Purchasing", reports: ["Purchase Orders", "Supplier Payables"], status: "Synced" },
        { count: 0, name: "Promotions", reports: ["Promotion Performance"], status: "Not implemented" },
        { count: customers, name: "Customers", reports: ["Customer List", "Top Customers"], status: "Synced" },
        { count: customers, name: "Membership", reports: ["Tier Analysis", "Points Activity"], status: "Synced" },
        { count: paymentChannelCount, name: "Finance", reports: ["Payment Breakdown", "Cash Drawer"], status: "Synced" },
        { count: deadStockCount, name: "Audit", reports: ["Inventory Movements", "Adjustment History"], status: "Synced" },
    ];
}
function peakHourLabel(hourlySales: ReportsAnalyticsHub["hourlySales"]) {
    if (hourlySales.length === 0)
        return "No sales yet";
    const peak = [...hourlySales].sort((left, right) => right.transactions - left.transactions)[0];
    return `Peak hour: ${peak.hour}`;
}
const reportCopy = {
    en: {
        aiInsights: "AI Insights",
        apply: "Apply",
        businessHealth: "Business Health Score",
        createPo: "Create Purchase Order",
        createPromotion: "Create Promotion",
        dashboard: "Dashboard",
        dataSourceStatus: "Data Source Status",
        dayDetail: "Day Detail",
        excellent: "Excellent",
        good: "Good",
        healthSubtitle: t("ui.ai.insight.sales.growth.is.healthy.margin.is"),
        highHour: "Green: High sales",
        highRevenue: "Green: High revenue",
        hourDetail: "Hour Detail",
        lastUpdated: "Last updated",
        lowHour: "Red: Low or no sales",
        lowRevenue: "Red: Low revenue",
        noReports: "No reports found",
        normalHour: "Orange: Normal sales",
        normalRevenue: "Orange: Normal revenue",
        pageTitle: t("ui.reports.analytics"),
        reportCenter: "Report Center",
        searchReports: t("ui.search.reports"),
        statusCritical: "Critical",
        statusWarning: "Warning",
        viewInsights: "View Insights",
        viewInventory: "View Inventory Report",
        viewProduct: "View Product Report",
        viewSales: "View Sales Report",
    },
    th: {
        aiInsights: "AI Insights",
        apply: "Apply filters",
        businessHealth: "Business Health Score",
        createPo: "Create purchase order",
        createPromotion: "Create promotion",
        dashboard: "Dashboard",
        dataSourceStatus: "Data Source Status",
        dayDetail: "Daily Detail",
        excellent: "Excellent",
        good: "Good",
        healthSubtitle: "AI insights: Sales are growing, profit is stable, but dead stock and low-stock items need attention this week.",
        highHour: "Green: high sales",
        highRevenue: "Green: high revenue",
        hourDetail: "Hourly Detail",
        lastUpdated: "Last updated",
        lowHour: "Yellow: low or no sales",
        lowRevenue: "Yellow: low revenue",
        noReports: "No reports found",
        normalHour: "Purple: normal sales",
        normalRevenue: "Purple: normal revenue",
        pageTitle: "Reports and Analytics",
        reportCenter: "Report Center",
        searchReports: "Search reports...",
        statusCritical: "Critical",
        statusWarning: "Warning",
        viewInsights: "View insights",
        viewInventory: "View inventory report",
        viewProduct: "View product report",
        viewSales: "View sales report",
    },
};
export function ReportsAnalyticsClient({
    filterOptions,
    filters,
    generatedAt,
    hub,
    productRows,
}: {
    filterOptions: ReportFilterOptions;
    filters: ReportFilters;
    generatedAt: string;
    hub: ReportsAnalyticsHub;
    productRows: ProductReportRow[];
}) {
    const router = useRouter();
    const [locale, setLocale] = useState<"en" | "th">("en");
    const [tab, setTab] = useState<TabKey>("dashboard");
    const [reportQuery, setReportQuery] = useState("");
    const [datePreset, setDatePreset] = useState(filters.datePreset);
    const [branchId, setBranchId] = useState(
        filters.branchId ?? (filterOptions.branches.length === 1 ? filterOptions.branches[0].id : ""),
    );
    const [warehouseId, setWarehouseId] = useState(filters.warehouseId ?? "");
    const [categoryId, setCategoryId] = useState(filters.categoryId ?? "");
    const [supplierId, setSupplierId] = useState(filters.supplierId ?? "");
    const [cashierId, setCashierId] = useState(filters.cashierId ?? "");
    const [currency, setCurrency] = useState<ReportCurrency>("LAK");
    const [modal, setModal] = useState<ModalKind | null>(null);
    const [modalTitle, setModalTitle] = useState("");
    const [activeKpi, setActiveKpi] = useState<ReportKpiKey>("revenue");
    const [activeReport, setActiveReport] = useState("Sales Summary");
    const [activeSource, setActiveSource] = useState("Sales");
    const [favorites, setFavorites] = useState<string[]>(["Sales Summary", t("ui.profit.loss"), "Inventory Valuation"]);
    const copy = reportCopy[locale];
    const dataSourceStatuses = useMemo(() => buildDataSourceStatuses(hub), [hub]);
    useEffect(() => {
        const datasetLocale = document.documentElement.dataset.locale;
        setLocale(datasetLocale === "th" ? "th" : "en");
    }, []);
    const kpis = hub.kpis;
    const healthScore = hub.healthScore;
    const healthStatusKey = hub.healthStatus;
    function valueText(value: number, valueType: "currency" | "number" | "percent") {
        if (valueType === "percent")
            return `${value.toFixed(1)}%`;
        if (valueType === "currency")
            return `${formatCurrency(value, currency)} ${currency}`;
        return formatNumber(value);
    }
    function openKpi(key: ReportKpiKey, title: string) {
        setActiveKpi(key);
        setModalTitle(title);
        setModal("kpi");
    }
    function openReport(reportName: string) {
        setActiveReport(reportName);
        setModalTitle(reportName);
        setModal("report");
    }
    function applyFilters() {
        const params = reportFiltersToSearchParams({
            branchId: branchId || undefined,
            cashierId: cashierId || undefined,
            categoryId: categoryId || undefined,
            dateFrom: filters.dateFrom,
            datePreset,
            dateTo: filters.dateTo,
            supplierId: supplierId || undefined,
            warehouseId: warehouseId || undefined,
        });
        router.push(`/reports?${params.toString()}`);
        router.refresh();
    }
    function resetFilters() {
        setDatePreset("this_month");
        setBranchId("");
        setWarehouseId("");
        setCategoryId("");
        setSupplierId("");
        setCashierId("");
        setCurrency("LAK");
        router.push("/reports");
        router.refresh();
    }
    return (<div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
      {modal === "kpi" ? <KpiDetailModal activeKpi={activeKpi} currency={currency} hub={hub} onClose={() => setModal(null)} title={modalTitle}/> : null}
      {modal === "health" ? <HealthModal inventoryAlerts={hub.inventoryAlerts} onClose={() => setModal(null)}/> : null}
      {modal === "daily" ? <DayDetailModal hub={hub} locale={locale} onClose={() => setModal(null)} paymentBreakdown={hub.paymentBreakdown} title={modalTitle || copy.dayDetail} topSellers={hub.topSellers}/> : null}
      {modal === "hour" ? <HourDetailModal hub={hub} locale={locale} onClose={() => setModal(null)} paymentBreakdown={hub.paymentBreakdown} title={modalTitle || copy.hourDetail} topSellers={hub.topSellers}/> : null}
      {modal === "category" ? <CategoryModal currency={currency} onClose={() => setModal(null)} title={modalTitle} topSellers={hub.topSellers}/> : null}
      {modal === "inventory" ? <InventoryAlertModal onClose={() => setModal(null)} productRows={productRows} title={modalTitle}/> : null}
      {modal === "product" ? <ProductAnalyticsModal currency={currency} onClose={() => setModal(null)} revenueProfitTrend={hub.revenueProfitTrend} title={modalTitle}/> : null}
      {modal === "deadstock" ? <DeadStockModal deadStockProducts={hub.deadStockProducts} onClose={() => setModal(null)}/> : null}
      {modal === "report" ? <ReportDetailModal categoryBreakdown={hub.categoryBreakdown} currency={currency} onClose={() => setModal(null)} productRows={productRows} reportName={activeReport}/> : null}
      {modal === "export" ? <ExportModal onClose={() => setModal(null)}/> : null}
      {modal === "schedule" ? <ScheduleModal onClose={() => setModal(null)} reportName={activeReport}/> : null}
      {modal === "favorites" ? <FavoritesModal favorites={favorites} onClose={() => setModal(null)} onOpen={openReport}/> : null}
      {modal === "dataSource" ? <DataSourceModal dataSourceStatuses={dataSourceStatuses} locale={locale} onClose={() => setModal(null)} source={activeSource}/> : null}

      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">EGO POS Analytics</p>
            <h1 className="mt-2 text-3xl font-semibold">{copy.pageTitle}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{t("ui.commercial.reporting.center.for.sales.invent")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportMenu onExport={() => setModal("export")}/>
            <HeaderAction icon={Printer} label="Print" onClick={() => setModal("export")}/>
            <HeaderAction icon={CalendarClock} label="Schedule" onClick={() => setModal("schedule")}/>
            <HeaderAction icon={Star} label="Favorites" onClick={() => setModal("favorites")}/>
          </div>
        </div>
      </section>

      <FilterBar
        branchId={branchId}
        branchOptions={buildSelectOptions("All Branches", filterOptions.branches)}
        cashierId={cashierId}
        cashierOptions={buildSelectOptions("All Cashiers", filterOptions.cashiers)}
        categoryId={categoryId}
        categoryOptions={buildSelectOptions("All Categories", filterOptions.categories)}
        currency={currency}
        datePreset={datePreset}
        onApply={applyFilters}
        onReset={resetFilters}
        setBranchId={setBranchId}
        setCashierId={setCashierId}
        setCategoryId={setCategoryId}
        setCurrency={setCurrency}
        setDatePreset={setDatePreset}
        setSupplierId={setSupplierId}
        setWarehouseId={setWarehouseId}
        supplierId={supplierId}
        supplierOptions={buildSelectOptions("All Suppliers", filterOptions.suppliers)}
        warehouseId={warehouseId}
        warehouseOptions={buildSelectOptions("All Warehouses", filterOptions.warehouses)}
      />

      <section className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2">
        <button className={tab === "dashboard" ? "h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" : "h-10 rounded-md px-4 text-sm font-semibold hover:bg-background"} type="button" onClick={() => setTab("dashboard")}>{copy.dashboard}</button>
        <button className={tab === "center" ? "h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" : "h-10 rounded-md px-4 text-sm font-semibold hover:bg-background"} type="button" onClick={() => setTab("center")}>{copy.reportCenter}</button>
        <label className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true"/>
          <input className="field-input h-10 pl-10" placeholder={copy.searchReports} value={reportQuery} onChange={(event) => setReportQuery(event.target.value)}/>
        </label>
      </section>

      {tab === "dashboard" ? (<>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (<KpiCard key={kpi.key} label={kpi.label} value={valueText(kpi.value, kpi.valueType)} onClick={() => openKpi(kpi.key, kpi.label)}/>))}
          </section>

          <BusinessHealthScore hub={hub} locale={locale} score={healthScore} statusKey={healthStatusKey} onOpen={() => setModal("health")}/>
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <AIInsightsPanel hub={hub} locale={locale} onOpenReport={openReport}/>
            <DataSourceStatusPanel dataSourceStatuses={dataSourceStatuses} generatedAt={generatedAt} locale={locale} onOpen={(source) => { setActiveSource(source); setModal("dataSource"); }}/>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <RevenueProfitTrend currency={currency} data={hub.revenueProfitTrend} locale={locale} onOpen={(label) => { setModalTitle(`${label} ${copy.dayDetail}`); setModal("daily"); }}/>
            <HourlySalesTrend data={hub.hourlySales} locale={locale} onOpen={(hour) => { setModalTitle(`${hour} ${copy.hourDetail}`); setModal("hour"); }}/>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
            <CategoryBreakdown currency={currency} data={hub.categoryBreakdown} onOpen={(name) => { setModalTitle(`${name} Analytics`); setModal("category"); }}/>
            <OperationalAlerts data={hub.inventoryAlerts} onOpen={(title) => { setModalTitle(title); setModal("inventory"); }}/>
          </section>

          <section className="grid gap-6 xl:grid-cols-2">
            <TopSellers currency={currency} data={hub.topSellers} onOpen={(name) => { setModalTitle(`${name} Product Sales Analytics`); setModal("product"); }}/>
            <DeadStockWidget data={hub.deadStockProducts} onOpen={() => setModal("deadstock")}/>
          </section>
        </>) : (<ReportCenter favorites={favorites} locale={locale} onFavorite={(title) => setFavorites((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title])} onOpen={openReport} onSchedule={(title) => { setActiveReport(title); setModal("schedule"); }} query={reportQuery}/>)}
    </div>);
}
function FilterBar(props: {
    branchId: string;
    branchOptions: Array<{ label: string; value: string }>;
    cashierId: string;
    cashierOptions: Array<{ label: string; value: string }>;
    categoryId: string;
    categoryOptions: Array<{ label: string; value: string }>;
    currency: ReportCurrency;
    datePreset: ReportFilters["datePreset"];
    onApply: () => void;
    onReset: () => void;
    setBranchId: (value: string) => void;
    setCashierId: (value: string) => void;
    setCategoryId: (value: string) => void;
    setCurrency: (value: ReportCurrency) => void;
    setDatePreset: (value: ReportFilters["datePreset"]) => void;
    setSupplierId: (value: string) => void;
    setWarehouseId: (value: string) => void;
    supplierId: string;
    supplierOptions: Array<{ label: string; value: string }>;
    warehouseId: string;
    warehouseOptions: Array<{ label: string; value: string }>;
}) {
    return (<section className="sticky top-20 z-10 rounded-lg border border-border bg-card/95 p-4 backdrop-blur">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <Select label="Date Range" value={props.datePreset} onChange={(value) => props.setDatePreset(value as ReportFilters["datePreset"])} options={Object.entries(datePresetLabels).map(([value, label]) => ({ label, value }))}/>
        <Select label="Branch" value={props.branchId} onChange={props.setBranchId} options={props.branchOptions}/>
        <Select label="Warehouse" value={props.warehouseId} onChange={props.setWarehouseId} options={props.warehouseOptions}/>
        <Select label="Category" value={props.categoryId} onChange={props.setCategoryId} options={props.categoryOptions}/>
        <Select label="Supplier" value={props.supplierId} onChange={props.setSupplierId} options={props.supplierOptions}/>
        <Select label="Cashier" value={props.cashierId} onChange={props.setCashierId} options={props.cashierOptions}/>
        <Select label="Currency" value={props.currency} onChange={(value) => props.setCurrency(value as ReportCurrency)} options={[{ label: "LAK", value: "LAK" }, { label: "THB", value: "THB" }, { label: "USD", value: "USD" }]}/>
        <div className="flex items-end gap-2">
          <button className="h-10 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={props.onApply}>Apply</button>
          <button className="grid h-10 w-10 place-items-center rounded-md border border-border" type="button" onClick={props.onReset} aria-label="Reset filters"><RefreshCcw className="size-4"/></button>
        </div>
      </div>
    </section>);
}
function Select({ label, onChange, options, value }: {
    label: string;
    onChange: (value: string) => void;
    options: Array<{ label: string; value: string }>;
    value: string;
}) {
    return (<label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select className="field-input h-10 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
      </select>
    </label>);
}
function KpiCard({ label, onClick, value }: {
    label: string;
    onClick: () => void;
    value: string;
}) {
    return (<button className="rounded-lg border border-border bg-card p-5 text-left transition hover:border-primary" type="button" onClick={onClick}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="mt-2 truncate text-2xl font-semibold">{value}</div>
        </div>
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <TrendingUp aria-hidden="true"/>
        </div>
      </div>
    </button>);
}
function BusinessHealthScore({ hub, locale, onOpen, score, statusKey }: {
    hub: ReportsAnalyticsHub;
    locale: "en" | "th";
    onOpen: () => void;
    score: number;
    statusKey: "excellent" | "good" | "warning" | "critical";
}) {
    const copy = reportCopy[locale];
    const status = statusKey === "excellent" ? copy.excellent : statusKey === "good" ? copy.good : statusKey === "warning" ? copy.statusWarning : copy.statusCritical;
    const tone = statusKey === "excellent" ? "text-success" : statusKey === "good" ? "text-primary" : statusKey === "warning" ? "text-warning" : "text-danger";
    const transactions = hub.kpis.find((entry) => entry.key === "transactions")?.value ?? 0;
    const lowStock = hub.inventoryAlerts.find((entry) => entry.key === "low_stock")?.count ?? 0;
    const outOfStock = hub.inventoryAlerts.find((entry) => entry.key === "out_of_stock")?.count ?? 0;
    const deadStock = hub.inventoryAlerts.find((entry) => entry.key === "dead_stock")?.count ?? 0;
    const stockHealth = Math.max(0, Math.min(100, Math.round(100 - (lowStock * 2 + outOfStock * 4 + deadStock * 3))));
    const customerHealth = Math.max(0, Math.min(100, Math.round(transactions > 0 ? Math.min(100, (hub.itemsSold / transactions) * 10) : 0)));
    const promotionHealth = Math.max(0, Math.min(100, Math.round(100 - Math.min(deadStock * 4, 60))));
    const breakdown = locale === "th"
        ? [["Sales growth", score], ["Profit margin", Math.round(hub.profitMarginPercent)], ["Stock health", stockHealth], ["Customer activity", customerHealth], ["Promotion impact", promotionHealth]]
        : [["Sales Score", score], ["Profit Margin", Math.round(hub.profitMarginPercent)], ["Stock Health", stockHealth], ["Customer Activity", customerHealth], ["Promotion Impact", promotionHealth]];
    return (<section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{copy.businessHealth}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {copy.healthSubtitle}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onOpen}>{copy.viewInsights}</button>
            <Link className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold" href="/promotions/new">{copy.createPromotion}</Link>
            <Link className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" href="/purchasing/new">{copy.createPo}</Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {breakdown.map(([label, value]) => (<div key={label}>
                <div className="mb-1 flex justify-between text-xs"><span>{label}</span><span>{value}%</span></div>
                <div className="h-2 rounded-full bg-background"><div className="h-2 rounded-full bg-primary" style={{ width: `${value}%` }}/></div>
              </div>))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background p-6 text-center xl:w-56">
          <div className={`text-5xl font-semibold ${tone}`}>{score}</div>
          <div className="mt-2 text-sm font-semibold">{status}</div>
          <div className="mt-3 h-3 rounded-full bg-card"><div className="h-3 rounded-full bg-primary" style={{ width: `${score}%` }}/></div>
        </div>
      </div>
    </section>);
}
function AIInsightsPanel({ hub, locale, onOpenReport }: {
    hub: ReportsAnalyticsHub;
    locale: "en" | "th";
    onOpenReport: (title: string) => void;
}) {
    const copy = reportCopy[locale];
    const topCategory = hub.categoryBreakdown[0]?.category ?? "N/A";
    const deadStockCount = hub.deadStockProducts.length;
    const lowStockCount = hub.inventoryAlerts.find((entry) => entry.key === "low_stock")?.count ?? 0;
    const peakHour = peakHourLabel(hub.hourlySales);
    const insights = locale === "th"
        ? [
            [`Profit`, copy.viewProduct, "Sales by Category"],
            [`Bills`, copy.createPromotion, "Dead Stock"],
            [`Items sold`, copy.createPo, "Low Stock"],
            [`${peakHour}`, copy.viewSales, "Sales by Hour"],
            [`Top products sold in this hour`, copy.viewInventory, t("ui.profit.loss")],
        ]
        : [
            [`Top revenue category: ${topCategory}`, "View Product Report", "Sales by Category"],
            [`Dead stock detected: ${deadStockCount} items`, "Create Promotion", "Dead Stock"],
            [`Low stock risk: ${lowStockCount} items`, "Create Purchase Order", "Low Stock"],
            [peakHour, "View Sales Report", "Sales by Hour"],
            [`Current profit margin: ${hub.profitMarginPercent.toFixed(1)}%`, "View Inventory Report", t("ui.profit.loss")],
        ];
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{copy.aiInsights}</h2>
      <div className="mt-4 grid gap-3">
        {insights.map(([text, action, report]) => (<div className="rounded-md border border-border bg-background p-3" key={text}>
            <p className="text-sm leading-6">{text}</p>
            <button className="mt-3 h-9 rounded-md border border-border px-3 text-xs font-semibold text-primary" type="button" onClick={() => onOpenReport(report)}>
              {action}
            </button>
          </div>))}
      </div>
    </section>);
}
function DataSourceStatusPanel({ dataSourceStatuses, generatedAt, locale, onOpen }: {
    dataSourceStatuses: DataSourceStatus[];
    generatedAt: string;
    locale: "en" | "th";
    onOpen: (source: string) => void;
}) {
    const copy = reportCopy[locale];
    const lastUpdated = formatBusinessMediumDateTime(generatedAt, locale);
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{copy.dataSourceStatus}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.lastUpdated}: {lastUpdated}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {dataSourceStatuses.map((source) => (<button className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-left text-sm hover:border-primary" key={source.name} type="button" onClick={() => onOpen(source.name)}>
            <span className="font-semibold">{source.name}</span>
            <StatusBadge locale={locale} status={source.status}/>
          </button>))}
      </div>
    </section>);
}
function StatusBadge({ locale, status }: {
    locale: "en" | "th";
    status: string;
}) {
    const label = locale === "th"
        ? status === "Synced" ? "Top revenue category" : status === "Warning" ? "Dead stock found" : status === "Offline" ? "Low-stock items found" : "Current profit margin"
        : status;
    const tone = status === "Synced" ? "border-success/40 bg-success/10 text-success" : status === "Warning" ? "border-warning/40 bg-warning/10 text-warning" : status === "Offline" ? "border-danger/40 bg-danger/10 text-danger" : "border-primary/40 bg-primary/10 text-primary";
    return <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${tone}`}>{label}</span>;
}
function RevenueProfitTrend({ currency, data, locale, onOpen }: {
    currency: ReportCurrency;
    data: ReportsAnalyticsHub["revenueProfitTrend"];
    locale: "en" | "th";
    onOpen: (label: string) => void;
}) {
    const max = Math.max(...data.map((point) => point.revenue), 1);
    const copy = reportCopy[locale];
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("ui.revenue.profit.trend")}</h2>
      <Legend labels={performanceLegend(locale, "revenue")}/>
      <div className="mt-5 grid gap-4">
        {data.map((point) => (<button className="grid gap-2 rounded-md p-2 text-left hover:bg-background" key={point.label} type="button" onClick={() => onOpen(point.label)} title={performanceTooltip(point.revenue, max, locale, "revenue")}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span>{point.label}</span>
              <span>{formatCurrency(point.revenue, currency)} / {formatCurrency(point.profit, currency)} {currency}</span>
            </div>
            <div className="text-xs text-muted-foreground">Margin {point.revenue > 0 ? Math.round(point.profit / point.revenue * 100) : 0}{t("ui.transactions")}{point.transactions ?? 0} | {performanceStatus(point.revenue, max, locale, "revenue")}</div>
            <div className="h-4 rounded-full bg-background"><div className={`h-4 rounded-full ${performanceColor(point.revenue, max)}`} style={{ width: `${Math.max(point.revenue / max * 100, 6)}%` }}/></div>
            <div className="h-2 rounded-full bg-background"><div className="h-2 rounded-full bg-success" style={{ width: `${Math.max(point.profit / max * 100, 4)}%` }}/></div>
          </button>))}
      </div>
    </section>);
}
function HourlySalesTrend({ data, locale, onOpen }: {
    data: ReportsAnalyticsHub["hourlySales"];
    locale: "en" | "th";
    onOpen: (hour: string) => void;
}) {
    const max = Math.max(...data.map((hour) => hour.transactions), 1);
    const copy = reportCopy[locale];
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Hourly Sales Trend</h2>
      <p className="mt-1 text-sm text-muted-foreground">{peakHourLabel(data)}</p>
      <Legend labels={performanceLegend(locale, "hour")}/>
      <div className="mt-5 grid grid-cols-6 gap-2">
        {data.map((hour) => (<button className="rounded-md border border-border bg-background p-2 text-center text-xs hover:border-primary" key={hour.hour} type="button" onClick={() => onOpen(hour.hour)} title={performanceTooltip(hour.transactions, max, locale, "hour")}>
            <div className="font-semibold">{hour.hour}</div>
            <div className="mx-auto mt-2 flex h-16 w-3 items-end rounded-full bg-card"><div className={`w-3 rounded-full ${performanceColor(hour.transactions, max)}`} style={{ height: `${Math.max(hour.transactions / max * 100, 3)}%` }}/></div>
            <div className="mt-1 text-muted-foreground">{hour.transactions}</div>
            <div className="mt-1 truncate text-[10px]">{performanceStatus(hour.transactions, max, locale, "hour")}</div>
          </button>))}
      </div>
    </section>);
}
function CategoryBreakdown({ currency, data, onOpen }: {
    currency: ReportCurrency;
    data: ReportsAnalyticsHub["categoryBreakdown"];
    onOpen: (category: string) => void;
}) {
    const max = Math.max(...data.map((row) => row.revenue), 1);
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Product Category Breakdown</h2>
      <div className="mt-5 grid gap-4">
        {data.map((row) => (<button className="rounded-md border border-border bg-background p-4 text-left transition hover:border-primary" key={row.category} type="button" onClick={() => onOpen(row.category)}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-semibold">{row.category}</div>
              <div className="text-sm text-muted-foreground">{formatCurrency(row.revenue, currency)} {currency} / {row.margin}{t("ui.margin")}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Profit {formatCurrency(row.profit, currency)} {currency}{t("ui.units")}{formatNumber(row.unitsSold)}</div>
            <div className="mt-3 h-3 rounded-full bg-card"><div className="h-3 rounded-full bg-primary" style={{ width: `${row.revenue / max * 100}%` }}/></div>
          </button>))}
      </div>
    </section>);
}
function OperationalAlerts({ data, onOpen }: {
    data: ReportsAnalyticsHub["inventoryAlerts"];
    onOpen: (title: string) => void;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Inventory Alerts</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {data.map((alert) => (<button className="rounded-md border border-border bg-background p-4 text-left hover:border-primary" key={alert.key} type="button" onClick={() => onOpen(alert.label)}>
            <div className="text-sm text-muted-foreground">{alert.label}</div>
            <div className="mt-2 text-2xl font-semibold">{alert.count}</div>
            <div className="mt-3 text-xs font-semibold text-primary">{alert.action}</div>
          </button>))}
      </div>
    </section>);
}
function TopSellers({ currency, data, onOpen }: {
    currency: ReportCurrency;
    data: ReportsAnalyticsHub["topSellers"];
    onOpen: (name: string) => void;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Top Sellers</h2>
      <p className="mt-1 text-xs text-muted-foreground" title={t("ui.product.revenue.helper")}>{t("ui.product.revenue")}</p>
      <div className="mt-5 max-h-[520px] overflow-y-auto">
        {data.map((product, index) => (<button className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 text-left last:border-b-0" key={product.name} type="button" onClick={() => onOpen(product.name)}>
            <span className="text-sm font-semibold text-primary">{index + 1}</span>
            <span className="min-w-0"><span className="block truncate font-semibold">{product.name}</span><span className="text-xs text-muted-foreground">Qty {product.qty}{t("ui.margin.2")}{product.margin}%</span></span>
            <span className="text-right text-sm" title={t("ui.product.revenue.helper")}>{formatCurrency(product.revenue, currency)} {currency}<span className="block text-xs text-muted-foreground">Profit {formatCurrency(product.profit, currency)}</span></span>
          </button>))}
      </div>
    </section>);
}
function DeadStockWidget({ data, onOpen }: {
    data: ReportsAnalyticsHub["deadStockProducts"];
    onOpen: () => void;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Dead Stock / Unsold Products</h2>
      <div className="mt-5 grid gap-3">
        {data.map((product) => (<button className="rounded-md border border-border bg-background p-4 text-left hover:border-primary" key={product.name} type="button" onClick={onOpen}>
            <div className="flex items-center justify-between gap-3"><span className="font-semibold">{product.name}</span><span className="text-xs text-warning">{product.age}</span></div>
            <div className="mt-2 text-sm text-muted-foreground">Stock {product.stock}{t("ui.value")}{formatLak(product.value)} LAK</div>
            <div className="mt-2 text-xs font-semibold text-primary">{product.action}</div>
          </button>))}
      </div>
    </section>);
}
function ReportCenter({ favorites, locale, onFavorite, onOpen, onSchedule, query }: {
    favorites: string[];
    locale: "en" | "th";
    onFavorite: (title: string) => void;
    onOpen: (title: string) => void;
    onSchedule: (title: string) => void;
    query: string;
}) {
    const normalized = query.trim().toLowerCase();
    const filterItems = (items: string[]) => normalized ? items.filter((item) => item.toLowerCase().includes(normalized)) : items;
    const filteredFavorites = filterItems(favorites);
    const recent = filterItems(["Sales by Product", "Low Stock", "Promotion Performance"]);
    const executive = filterItems(executiveReports);
    const categories = reportCategories
        .map((category) => ({
        ...category,
        reports: normalized ? category.reports.filter((report) => `${category.title} ${category.description} ${report}`.toLowerCase().includes(normalized)) : category.reports,
    }))
        .filter((category) => category.reports.length > 0 || `${category.title} ${category.description}`.toLowerCase().includes(normalized));
    const hasResults = filteredFavorites.length > 0 || recent.length > 0 || executive.length > 0 || categories.length > 0;
    return (<div className="flex flex-col gap-6">
      <section className="grid gap-4 xl:grid-cols-3">
        <MiniList title="Favorite Reports" items={filteredFavorites} onOpen={onOpen}/>
        <MiniList title="Recently Opened Reports" items={recent} onOpen={onOpen}/>
        <MiniList title="Pinned Executive Reports" items={executive} onOpen={onOpen}/>
      </section>
      {!hasResults ? <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">{reportCopy[locale].noReports}</div> : null}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (<ReportCategoryCard key={category.title} category={category} favorites={favorites} onFavorite={onFavorite} onOpen={onOpen} onSchedule={onSchedule}/>))}
      </section>
    </div>);
}
function ReportCategoryCard({ category, favorites, onFavorite, onOpen, onSchedule }: {
    category: ReportCategory;
    favorites: string[];
    onFavorite: (title: string) => void;
    onOpen: (title: string) => void;
    onSchedule: (title: string) => void;
}) {
    const Icon = category.icon;
    return (<article className="min-w-0 rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><Icon aria-hidden="true"/></div>
        <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={() => onFavorite(category.title)} title="Favorite category">
          <Star className={favorites.includes(category.title) ? "size-4 fill-primary text-primary" : "size-4"}/>
        </button>
      </div>
      <h2 className="mt-4 text-lg font-semibold">{category.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{category.description}</p>
      <div className="mt-4 flex max-h-44 flex-col gap-2 overflow-y-auto">
        {category.reports.map((report) => (<div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background p-2" key={report}>
            <button className="min-w-0 truncate text-left text-sm font-medium hover:text-primary" type="button" onClick={() => onOpen(report)}>{report}</button>
            <div className="flex shrink-0 gap-1">
              <button className="grid size-8 place-items-center rounded border border-border" type="button" onClick={() => onOpen(report)} title="Open"><Eye className="size-4"/></button>
              <button className="grid size-8 place-items-center rounded border border-border" type="button" onClick={() => onSchedule(report)} title="Schedule"><CalendarClock className="size-4"/></button>
              <button className="grid size-8 place-items-center rounded border border-border" type="button" onClick={() => onFavorite(report)} title="Favorite"><Star className={favorites.includes(report) ? "size-4 fill-primary text-primary" : "size-4"}/></button>
            </div>
          </div>))}
      </div>
      <div className="mt-4 flex gap-2">
        <button className="h-10 flex-1 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={() => onOpen(category.reports[0] ?? category.title)}>Open</button>
        <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={() => onOpen(category.title)}>Export</button>
      </div>
    </article>);
}
function MiniList({ items, onOpen, title }: {
    items: string[];
    onOpen: (title: string) => void;
    title: string;
}) {
    return (<section className="rounded-lg border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 flex flex-col gap-2">
        {items.map((item) => <button className="rounded-md border border-border bg-background p-3 text-left text-sm font-semibold hover:border-primary" key={item} type="button" onClick={() => onOpen(item)}>{item}</button>)}
      </div>
    </section>);
}
function HeaderAction({ icon: Icon, label, onClick }: {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}) {
    return <button className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClick}><Icon className="size-4"/>{label}</button>;
}
function ExportMenu({ onExport }: {
    onExport: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (<div className="relative">
      <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground" type="button" onClick={() => setOpen((value) => !value)}>
        <Download className="size-4"/> Export <ChevronDown className="size-4"/>
      </button>
      {open ? (<div className="absolute right-0 top-12 z-20 w-40 rounded-md border border-border bg-card p-1 shadow-xl">
          {["PDF", "Excel", "CSV", "Print"].map((item) => <button className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-background" key={item} type="button" onClick={() => { setOpen(false); onExport(); }}>{item}</button>)}
        </div>) : null}
    </div>);
}
function kpiSummaryLines(hub: ReportsAnalyticsHub, currency: ReportCurrency, key: ReportKpiKey): string[] {
    const kpiValue = (kpiKey: ReportKpiKey) => hub.kpis.find((row) => row.key === kpiKey)?.value ?? 0;
    const money = (value: number) => `${formatCurrency(value, currency)} ${currency}`;
    switch (key) {
        case "revenue":
            return [
                ...hub.paymentBreakdown.map((row) => `${row.label}: ${money(row.value)}`),
                ...hub.categoryBreakdown.slice(0, 3).map((row) => `${row.category}: ${money(row.revenue)}`),
            ];
        case "profit":
            return [
                `Gross profit: ${money(kpiValue("profit"))}`,
                `Profit margin: ${hub.profitMarginPercent}%`,
                ...(hub.topSellers[0] ? [`Top seller: ${hub.topSellers[0].name}`] : []),
            ];
        case "transactions":
            return [
                `Transactions: ${formatNumber(kpiValue("transactions"))}`,
                `Items sold: ${formatNumber(hub.itemsSold)}`,
                `Average bill: ${money(hub.averageBillLak)}`,
            ];
        case "customers":
            return [`Customers: ${formatNumber(kpiValue("customers"))}`];
        case "averageBill":
            return [
                `Average bill: ${money(hub.averageBillLak)}`,
                `Transactions: ${formatNumber(kpiValue("transactions"))}`,
            ];
        case "itemsSold":
            return [
                `Items sold: ${formatNumber(hub.itemsSold)}`,
                ...(hub.topSellers[0] ? [`Top item: ${hub.topSellers[0].name} (${formatNumber(hub.topSellers[0].qty)})`] : []),
            ];
        case "inventoryValue":
            return [
                `Inventory value: ${money(hub.inventoryValueLak)}`,
                `Dead stock items: ${formatNumber(hub.deadStockProducts.length)}`,
                ...hub.inventoryAlerts.filter((alert) => alert.count > 0).map((alert) => `${alert.label}: ${formatNumber(alert.count)}`),
            ];
        case "profitMargin":
            return [
                `Profit margin: ${hub.profitMarginPercent}%`,
                ...(hub.categoryBreakdown[0] ? [`Top category: ${hub.categoryBreakdown[0].category}`] : []),
            ];
        default:
            return [];
    }
}

function kpiReportHref(key: ReportKpiKey) {
    if (key === "customers") return "/reports/customers";
    if (key === "inventoryValue") return "/reports/inventory";
    if (key === "itemsSold") return "/reports/products";
    return "/reports/sales";
}

function KpiDetailModal({ activeKpi, currency, hub, onClose, title }: {
    activeKpi: ReportKpiKey;
    currency: ReportCurrency;
    hub: ReportsAnalyticsHub;
    onClose: () => void;
    title: string;
}) {
    const details = kpiSummaryLines(hub, currency, activeKpi);
    return (<ModalFrame onClose={onClose} title={title}>
      <div className="grid gap-4 lg:grid-cols-2">
        <SimpleBars title={`${title} Detail`} rows={hub.paymentBreakdown.map((row) => ({ label: row.label, value: row.value }))} currency={currency}/>
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="font-semibold">Summary</h3>
          <div className="mt-4 flex flex-col gap-3">
            {details.length > 0
                ? details.map((detail) => <div className="rounded-md border border-border bg-card p-3 text-sm" key={detail}>{detail}</div>)
                : <div className="rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">No additional detail is available for this KPI.</div>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-semibold" href={kpiReportHref(activeKpi)}>View report</Link>
          </div>
        </div>
      </div>
    </ModalFrame>);
}
function ReportDetailModal({ categoryBreakdown, currency, onClose, productRows, reportName }: {
    categoryBreakdown: ReportsAnalyticsHub["categoryBreakdown"];
    currency: ReportCurrency;
    onClose: () => void;
    productRows: ProductReportRow[];
    reportName: string;
}) {
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [showProfit, setShowProfit] = useState(true);
    const rows = productRows
        .map((row) => {
            const margin = row.revenueLak > 0 ? `${((row.profitLak / row.revenueLak) * 100).toFixed(1)}%` : "0%";
            return {
                category: row.categoryName,
                margin,
                name: row.productName,
                profit: `${formatLak(row.profitLak)} LAK`,
                qty: formatNumber(row.quantitySold),
                revenue: `${formatLak(row.revenueLak)} LAK`,
            };
        })
        .filter((row) => `${row.name} ${row.category} ${row.qty} ${row.revenue} ${row.profit} ${row.margin}`.toLowerCase().includes(query.toLowerCase()));
    const pageSize = 10;
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);
    const totalRevenue = categoryBreakdown.reduce((total, row) => total + row.revenue, 0);
    const totalProfit = categoryBreakdown.reduce((total, row) => total + row.profit, 0);
    const margin = totalRevenue > 0 ? `${((totalProfit / totalRevenue) * 100).toFixed(1)}%` : "0%";
    return (<ModalFrame onClose={onClose} title={reportName}>
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Select label="Date Range" value="this_month" onChange={() => undefined} options={[{ label: "Today", value: "today" }, { label: "This Week", value: "this_week" }, { label: "This Month", value: "this_month" }]}/>
          <Select label="Branch" value="current" onChange={() => undefined} options={[{ label: "Current branch", value: "current" }]}/>
          <Select label="Category" value="" onChange={() => undefined} options={[{ label: "All Categories", value: "" }]}/>
          <label className="flex items-end gap-2 text-sm"><input className="size-5 accent-[var(--primary)]" type="checkbox" checked={showProfit} onChange={(event) => setShowProfit(event.target.checked)}/> Show profit column</label>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <KpiMini label="Rows" value={formatNumber(rows.length)}/>
          <KpiMini label="Revenue" value={`${formatCurrency(totalRevenue, currency)} ${currency}`}/>
          <KpiMini label="Profit" value={`${formatCurrency(totalProfit, currency)} ${currency}`}/>
          <KpiMini label="Margin" value={margin}/>
        </div>
        <SimpleBars title="Chart Area" rows={categoryBreakdown.map((row) => ({ label: row.category, value: row.revenue }))} currency={currency}/>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
            <input className="field-input pl-10" placeholder={t("ui.search.sort.filter.rows")} value={query} onChange={(event) => setQuery(event.target.value)}/>
          </label>
          <div className="flex flex-wrap gap-2">
            {["PDF", "Excel", "CSV", "Print", "Export selected rows", "Save as Favorite", "Schedule Report"].map((button) => <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" key={button} type="button">{button}</button>)}
          </div>
        </div>
        <div className="max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>{["Product", "Category", "Qty", "Revenue", ...(showProfit ? ["Profit"] : []), "Margin"].map((column) => <th className="px-3 py-3" key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => <tr className="border-b border-border last:border-b-0" key={row.name}>
                  <td className="px-3 py-3">{row.name}</td>
                  <td className="px-3 py-3">{row.category}</td>
                  <td className="px-3 py-3">{row.qty}</td>
                  <td className="px-3 py-3">{row.revenue}</td>
                  {showProfit ? <td className="px-3 py-3">{row.profit}</td> : null}
                  <td className="px-3 py-3">{row.margin}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <button className="h-9 rounded-md border border-border px-3 disabled:opacity-40" type="button" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button className="h-9 rounded-md border border-border px-3 disabled:opacity-40" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
        </div>
      </div>
    </ModalFrame>);
}
function SimpleBars({ currency, rows, title }: {
    currency: ReportCurrency;
    rows: Array<{
        label: string;
        value: number;
    }>;
    title: string;
}) {
    const max = Math.max(...rows.map((row) => row.value), 1);
    return (<section className="rounded-lg border border-border bg-background p-4">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-sm"><span>{row.label}</span><span>{formatCurrency(row.value, currency)} {currency}</span></div><div className="h-3 rounded-full bg-card"><div className="h-3 rounded-full bg-primary" style={{ width: `${Math.max(row.value / max * 100, 4)}%` }}/></div></div>)}
      </div>
    </section>);
}
function GenericDetailModal({ onClose, productRows, title }: {
    onClose: () => void;
    productRows: ProductReportRow[];
    title: string;
}) {
    return <ModalFrame onClose={onClose} title={title}><ReportRowsTable productRows={productRows}/></ModalFrame>;
}
function DayDetailModal({ hub, locale, onClose, paymentBreakdown, title, topSellers }: {
    hub: ReportsAnalyticsHub;
    locale: "en" | "th";
    onClose: () => void;
    paymentBreakdown: ReportsAnalyticsHub["paymentBreakdown"];
    title: string;
    topSellers: ReportsAnalyticsHub["topSellers"];
}) {
    const labels = ["Revenue", "Profit", t("ui.margin.3"), "Transactions", "Customers", "Refunds", "Discounts"];
    const buttons = locale === "th" ? ["View Sales Report", "View Profit Report", "Export Day Report"] : ["View Sales Report", "View Profit Report", "Export Day Report"];
    const dayKey = title.replace(/\s+Day Detail$/i, "").trim();
    const dayPoint = hub.revenueProfitTrend.find((point) => point.label === dayKey);
    const revenue = dayPoint?.revenue ?? 0;
    const profit = dayPoint?.profit ?? 0;
    const margin = revenue > 0 ? `${Math.round((profit / revenue) * 1000) / 10}%` : "0%";
    const values = [
        `${formatLak(revenue)} LAK`,
        `${formatLak(profit)} LAK`,
        margin,
        String(dayPoint?.transactions ?? 0),
        String(hub.kpis.find((kpi) => kpi.key === "customers")?.value ?? 0),
        String(hub.refundLak ?? 0),
        String(hub.discountLak ?? 0),
    ];
    const categoryNames = hub.categoryBreakdown.slice(0, 3).map((row) => row.category);
    return (<ModalFrame onClose={onClose} title={title}>
      <div className="grid gap-3 md:grid-cols-4">
        {labels.map((label, index) => <KpiMini key={label} label={label} value={values[index] ?? "0"}/>)}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <MiniList title={locale === "th" ? "Top categories" : "Top categories"} items={categoryNames} onOpen={() => undefined}/>
        <MiniList title={locale === "th" ? "Top products" : "Top products"} items={topSellers.slice(0, 4).map((item) => item.name)} onOpen={() => undefined}/>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">{buttons.map((button) => <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" key={button}>{button}</button>)}</div>
    </ModalFrame>);
}
function HourDetailModal({ hub, locale, onClose, paymentBreakdown, title, topSellers }: {
    hub: ReportsAnalyticsHub;
    locale: "en" | "th";
    onClose: () => void;
    paymentBreakdown: ReportsAnalyticsHub["paymentBreakdown"];
    title: string;
    topSellers: ReportsAnalyticsHub["topSellers"];
}) {
    const labels = locale === "th" ? ["Revenue", "Profit", "Transactions", "Items sold"] : ["Revenue", "Profit", "Transactions", "Items sold"];
    const hourKey = title.replace(/\s+Hour Detail$/i, "").trim();
    const hourPoint = hub.hourlySales.find((row) => row.hour === hourKey);
    const values = [
        `${formatLak(hourPoint?.revenueLak ?? 0)} LAK`,
        `${formatLak(hourPoint?.profitLak ?? 0)} LAK`,
        String(hourPoint?.transactions ?? 0),
        String(hourPoint?.transactions ?? 0),
    ];
    return (<ModalFrame onClose={onClose} title={title}>
      <div className="grid gap-3 md:grid-cols-4">
        {labels.map((label, index) => <KpiMini key={label} label={label} value={values[index] ?? "0"}/>)}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <MiniList title={locale === "th" ? "Top products sold in this hour" : "Top products sold in this hour"} items={topSellers.slice(0, 5).map((item) => item.name)} onOpen={() => undefined}/>
        <SimpleBars title={locale === "th" ? "Payment breakdown" : "Payment breakdown"} rows={paymentBreakdown.map((row) => ({ label: row.label, value: row.value }))} currency="LAK"/>
      </div>
      <button className="mt-4 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">{locale === "th" ? "View Transactions" : "View Transactions"}</button>
    </ModalFrame>);
}
function DataSourceModal({ dataSourceStatuses, locale, onClose, source }: {
    dataSourceStatuses: DataSourceStatus[];
    locale: "en" | "th";
    onClose: () => void;
    source: string;
}) {
    const item = dataSourceStatuses.find((entry) => entry.name === source) ?? dataSourceStatuses[0];
    return (<ModalFrame onClose={onClose} title={`${source} ${locale === "th" ? "Status" : "Status"}`}>
      <div className="grid gap-3 md:grid-cols-2">
        <KpiMini label={locale === "th" ? "Source module" : "Source module"} value={item.name}/>
        <KpiMini label={locale === "th" ? t("ui.sync") : "Last sync time"} value="Live"/>
        <KpiMini label={locale === "th" ? "Record count" : "Record count"} value={formatNumber(item.count)}/>
        <div className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{locale === "th" ? "Status" : "Status"}</div><div className="mt-2"><StatusBadge locale={locale} status={item.status}/></div></div>
      </div>
      <div className="mt-4 rounded-md border border-border bg-background p-4 text-sm text-muted-foreground">
        {locale === "th" ? "Data is loaded from PostgreSQL for the current company and branch." : "Data is loaded from PostgreSQL for the current company and branch."}
      </div>
      <MiniList title={locale === "th" ? "Related reports" : "Related reports"} items={item.reports} onOpen={() => undefined}/>
    </ModalFrame>);
}
function CategoryModal({ currency, onClose, title, topSellers }: {
    currency: ReportCurrency;
    onClose: () => void;
    title: string;
    topSellers: ReportsAnalyticsHub["topSellers"];
}) {
    return <ModalFrame onClose={onClose} title={title}><SimpleBars title="Top products and margin analysis" rows={topSellers.slice(0, 5).map((item) => ({ label: item.name, value: item.revenue }))} currency={currency}/><div className="mt-4 flex gap-2"><Link className="h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold" href="/promotions/new">Create Promotion</Link><Link className="h-10 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" href="/products">View Products</Link></div></ModalFrame>;
}
function InventoryAlertModal({ onClose, productRows, title }: {
    onClose: () => void;
    productRows: ProductReportRow[];
    title: string;
}) {
    const action = title.includes("Expiring") ? "Create Promotion" : title.includes("Dead") ? "Clearance Promotion" : "Create PO";
    return <ModalFrame onClose={onClose} title={`${title} Report`}><ReportRowsTable productRows={productRows}/><div className="mt-4"><button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">{action}</button></div></ModalFrame>;
}
function ProductAnalyticsModal({ currency, onClose, revenueProfitTrend, title }: {
    currency: ReportCurrency;
    onClose: () => void;
    revenueProfitTrend: ReportsAnalyticsHub["revenueProfitTrend"];
    title: string;
}) {
    return <ModalFrame onClose={onClose} title={title}><SimpleBars title="Product sales analytics" rows={revenueProfitTrend.map((row) => ({ label: row.label, value: row.revenue }))} currency={currency}/></ModalFrame>;
}
function DeadStockModal({ deadStockProducts, onClose }: {
    deadStockProducts: ReportsAnalyticsHub["deadStockProducts"];
    onClose: () => void;
}) {
    return <ModalFrame onClose={onClose} title="Dead Stock Report"><div className="grid gap-3">{deadStockProducts.map((item) => <div className="rounded-md border border-border bg-background p-3" key={item.name}><div className="font-semibold">{item.name}</div><div className="mt-1 text-sm text-muted-foreground">{item.age}{t("ui.stock")}{item.stock}{t("ui.value")}{formatLak(item.value)} LAK</div><button className="mt-3 h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button">{item.action}</button></div>)}</div></ModalFrame>;
}
function HealthModal({ inventoryAlerts, onClose }: {
    inventoryAlerts: ReportsAnalyticsHub["inventoryAlerts"];
    onClose: () => void;
}) {
    const insights = inventoryAlerts.map((alert) => `${alert.label}: ${alert.count} items — ${alert.action}`);
    return <ModalFrame onClose={onClose} title="Business Health Insights"><div className="grid gap-3">{insights.map((item) => <div className="rounded-md border border-border bg-background p-3 text-sm" key={item}>{item}</div>)}</div></ModalFrame>;
}
function ExportModal({ onClose }: {
    onClose: () => void;
}) {
    return <ModalFrame onClose={onClose} title="Export Center"><div className="grid gap-3 md:grid-cols-4">{["PDF", "Excel", "CSV", "Print"].map((item) => <button className="rounded-md border border-border bg-background p-4 font-semibold hover:border-primary" key={item} type="button">{item}</button>)}</div></ModalFrame>;
}
function ScheduleModal({ onClose, reportName }: {
    onClose: () => void;
    reportName: string;
}) {
    return (<ModalFrame onClose={onClose} title="Schedule Report">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium">Report name<input className="field-input mt-2" defaultValue={reportName}/></label>
        <Select label="Frequency" value="Daily" onChange={() => undefined} options={[{ label: "Daily", value: "Daily" }, { label: "Weekly", value: "Weekly" }, { label: "Monthly", value: "Monthly" }]}/>
        <label className="text-sm font-medium">Time<input className="field-input mt-2" type="time" defaultValue="08:00"/></label>
        <Select label="Send to" value="Email" onChange={() => undefined} options={[{ label: "Email", value: "Email" }, { label: "Telegram", value: "Telegram" }, { label: "WhatsApp", value: "WhatsApp" }, { label: "EGO POS App notification", value: "EGO POS App notification" }]}/>
        <Select label="File format" value="PDF" onChange={() => undefined} options={[{ label: "PDF", value: "PDF" }, { label: "Excel", value: "Excel" }]}/>
        <label className="flex items-end gap-3 text-sm font-semibold"><input className="size-5 accent-[var(--primary)]" type="checkbox" defaultChecked/> Active</label>
      </div>
      <button className="mt-5 h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button">Save Schedule</button>
    </ModalFrame>);
}
function FavoritesModal({ favorites, onClose, onOpen }: {
    favorites: string[];
    onClose: () => void;
    onOpen: (title: string) => void;
}) {
    return <ModalFrame onClose={onClose} title="Favorites"><MiniList title="Favorite reports" items={favorites} onOpen={onOpen}/><div className="mt-4"><MiniList title="Pinned executive reports" items={executiveReports} onOpen={onOpen}/></div></ModalFrame>;
}
function ModalFrame({ children, onClose, title }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{t("ui.demo.ready.report.detail.with.filters.chart.")}</p></div>
          <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>);
}
function ReportRowsTable({ productRows }: { productRows: ProductReportRow[] }) {
    return (<div className="max-w-full overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground"><tr>{["Name", "Category", "Qty", "Revenue", "Profit", "Margin"].map((column) => <th className="px-3 py-3" key={column} title={column === "Revenue" || column === "Profit" ? t("ui.product.revenue.helper") : undefined}>{column}</th>)}</tr></thead>
        <tbody>{productRows.map((row) => {
            const margin = row.revenueLak > 0 ? `${((row.profitLak / row.revenueLak) * 100).toFixed(1)}%` : "0%";
            return (<tr className="border-b border-border last:border-b-0" key={row.productName}>
                <td className="px-3 py-3">{row.productName}</td>
                <td className="px-3 py-3">{row.categoryName}</td>
                <td className="px-3 py-3">{formatNumber(row.quantitySold)}</td>
                <td className="px-3 py-3">{formatLak(row.revenueLak)} LAK</td>
                <td className="px-3 py-3">{formatLak(row.profitLak)} LAK</td>
                <td className="px-3 py-3">{margin}</td>
              </tr>);
        })}</tbody>
      </table>
    </div>);
}
function KpiMini({ label, value }: {
    label: string;
    value: string;
}) {
    return <div className="rounded-md border border-border bg-background p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
function Legend({ labels }: {
    labels: string[];
}) {
    const colors = ["bg-success", "bg-orange-500", "bg-danger"];
    return (<div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {labels.map((label, index) => (<span className="inline-flex items-center gap-2" key={label}>
          <span className={`size-2 rounded-full ${colors[index]}`}/>
          {label}
        </span>))}
    </div>);
}
function performanceColor(value: number, max: number) {
    const ratio = max > 0 ? value / max : 0;
    if (ratio >= 0.75)
        return "bg-success shadow-[0_0_12px_rgba(34,197,94,0.18)]";
    if (ratio >= 0.35)
        return "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.16)]";
    return "bg-danger shadow-[0_0_12px_rgba(239,68,68,0.16)]";
}
function performanceLegend(locale: "en" | "th", type: "hour" | "revenue") {
    if (locale === "th") {
        return type === "hour"
            ? ["Bills", "Customers", "Refunds"]
            : ["Discounts", "View Sales Report", "View Profit Report"];
    }
    return type === "hour"
        ? ["Green: High sales", "Orange: Normal sales", "Red: Low or no sales"]
        : ["Green: High revenue", "Orange: Normal revenue", "Red: Low revenue"];
}
function performanceStatus(value: number, max: number, locale: "en" | "th", type: "hour" | "revenue") {
    const ratio = max > 0 ? value / max : 0;
    if (type === "hour") {
        if (ratio >= 0.75)
            return locale === "th" ? "High sales" : "High sales";
        if (ratio >= 0.35)
            return locale === "th" ? "Normal sales" : "Normal sales";
        return locale === "th" ? "Low sales" : "Low sales";
    }
    if (ratio >= 0.75)
        return locale === "th" ? "High revenue" : "High revenue";
    if (ratio >= 0.35)
        return locale === "th" ? "Normal revenue" : "Normal revenue";
    return locale === "th" ? "Low revenue" : "Low revenue";
}
function performanceTooltip(value: number, max: number, locale: "en" | "th", type: "hour" | "revenue") {
    const percent = Math.round((max > 0 ? value / max : 0) * 100);
    const status = performanceStatus(value, max, locale, type);
    if (locale === "th") {
        const recommendation = percent >= 75 ? "Top categories" : percent >= 35 ? "Top products" : "Revenue";
        return `Payment breakdown`;
    }
    const recommendation = percent >= 75 ? t("ui.prepare.more.cashier.coverage") : percent >= 35 ? t("ui.maintain.normal.operation") : t("ui.consider.promotion.or.staffing.reduction");
    return `${status}. ${value} (${percent}% of max). ${recommendation}`;
}
function formatCurrency(value: number, currency: ReportCurrency) {
    const converted = Math.round(value * currencyRates[currency]);
    return currency === "LAK" ? formatLak(converted) : converted.toLocaleString("en-US");
}
