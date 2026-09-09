import type { DashboardAlert, DashboardAlertSeverity } from "@/features/dashboard/dashboard-service";
import { getDashboardCopy, type DashboardCopy } from "@/lib/i18n/dashboard-copy";

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, value),
    template,
  );
}

function localizeAlertValue(value: string | undefined, copy: DashboardCopy) {
  if (!value) {
    return value;
  }

  const belowAverage = /^(\d+)% below average$/.exec(value);
  if (belowAverage) {
    return fill(copy.alertBelowAverage, { percent: belowAverage[1] });
  }

  return value;
}

export function formatDashboardAlertSeverity(severity: DashboardAlertSeverity, copy: DashboardCopy) {
  if (severity === "critical") {
    return copy.critical;
  }
  if (severity === "info") {
    return copy.info;
  }
  return copy.warning;
}

export function localizeDashboardAlert(alert: DashboardAlert, copy: DashboardCopy): DashboardAlert {
  const value = localizeAlertValue(alert.value, copy);

  switch (alert.title) {
    case "Dead Stock":
      return { ...alert, message: copy.alertDeadStockMessage, title: copy.deadStock, type: copy.alertTypeInventory, value };
    case "Low Sales Warning":
      return { ...alert, message: copy.alertLowSalesMessage, title: copy.lowSalesWarning, type: copy.alertTypeSales, value };
    case "Low stock":
      return {
        ...alert,
        message: fill(copy.alertLowStockMessage, { count: alert.value ?? "" }),
        title: copy.lowStock,
        type: copy.alertTypeInventory,
        value,
      };
    case "Near expiry":
      return {
        ...alert,
        message: fill(copy.alertNearExpiryMessage, { count: alert.value ?? "" }),
        title: copy.nearExpiry,
        type: copy.alertTypeExpiry,
        value,
      };
    case "Expired products":
      return {
        ...alert,
        message: fill(copy.alertExpiredMessage, { count: alert.value ?? "" }),
        title: copy.expiredProducts,
        type: copy.alertTypeExpiry,
        value,
      };
    case "Supplier due":
      return {
        ...alert,
        message: fill(copy.alertSupplierDueMessage, { amount: alert.value ?? "" }),
        title: copy.supplierDue,
        type: copy.alertTypePayables,
        value,
      };
    case "Customer credit due":
      return {
        ...alert,
        message: fill(copy.alertCustomerCreditMessage, { amount: alert.value ?? "" }),
        title: copy.customerCreditDue,
        type: copy.alertTypeCredit,
        value,
      };
    case "Cash Difference":
      return {
        ...alert,
        message: copy.alertCashDifferenceMessage,
        title: copy.cashDifference,
        type: copy.alertTypeCash,
        value,
      };
    default:
      return { ...alert, value };
  }
}

export function localizeDashboardAlerts(alerts: DashboardAlert[], copy: DashboardCopy) {
  return alerts.map((alert) => localizeDashboardAlert(alert, copy));
}

export type ImportantAlertsViewItem = DashboardAlert & { severityLabel: string };

export type ImportantAlertsView = {
  copy: DashboardCopy;
  emptyDescription: string;
  emptyTitle: string;
  items: ImportantAlertsViewItem[];
  title: string;
  viewDetails: string;
};

export function buildImportantAlertsView(alerts: DashboardAlert[], locale?: string | null): ImportantAlertsView {
  const copy = getDashboardCopy(locale);
  const items = localizeDashboardAlerts(alerts, copy).map((alert) => ({
    ...alert,
    severityLabel: formatDashboardAlertSeverity(alert.severity, copy),
  }));

  return {
    copy,
    emptyDescription: copy.emptyAlerts,
    emptyTitle: copy.noImportantAlerts,
    items,
    title: copy.importantAlerts,
    viewDetails: copy.viewDetails,
  };
}
