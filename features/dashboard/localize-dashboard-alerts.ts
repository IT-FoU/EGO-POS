import type { DashboardAlert } from "@/features/dashboard/dashboard-service";
import type { DashboardCopy } from "@/lib/i18n/dashboard-copy";

function fill(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, value),
    template,
  );
}

export function localizeDashboardAlert(alert: DashboardAlert, copy: DashboardCopy): DashboardAlert {
  switch (alert.title) {
    case "Dead Stock":
      return { ...alert, message: copy.alertDeadStockMessage, title: copy.deadStock, type: copy.alertTypeInventory };
    case "Low Sales Warning":
      return { ...alert, message: copy.alertLowSalesMessage, title: copy.lowSalesWarning, type: copy.alertTypeSales };
    case "Low stock":
      return {
        ...alert,
        message: fill(copy.alertLowStockMessage, { count: alert.value ?? "" }),
        title: copy.lowStock,
        type: copy.alertTypeInventory,
      };
    case "Near expiry":
      return {
        ...alert,
        message: fill(copy.alertNearExpiryMessage, { count: alert.value ?? "" }),
        title: copy.nearExpiry,
        type: copy.alertTypeExpiry,
      };
    case "Expired products":
      return {
        ...alert,
        message: fill(copy.alertExpiredMessage, { count: alert.value ?? "" }),
        title: copy.expiredProducts,
        type: copy.alertTypeExpiry,
      };
    case "Supplier due":
      return {
        ...alert,
        message: fill(copy.alertSupplierDueMessage, { amount: alert.value ?? "" }),
        title: copy.supplierDue,
        type: copy.alertTypePayables,
      };
    case "Customer credit due":
      return {
        ...alert,
        message: fill(copy.alertCustomerCreditMessage, { amount: alert.value ?? "" }),
        title: copy.customerCreditDue,
        type: copy.alertTypeCredit,
      };
    case "Cash Difference":
      return {
        ...alert,
        message: copy.alertCashDifferenceMessage,
        title: copy.cashDifference,
        type: copy.alertTypeCash,
      };
    default:
      return alert;
  }
}

export function localizeDashboardAlerts(alerts: DashboardAlert[], copy: DashboardCopy) {
  return alerts.map((alert) => localizeDashboardAlert(alert, copy));
}
