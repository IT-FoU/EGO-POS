export function buildReportAnalytics({
  categoryBreakdown,
  customerCount,
  profitLak,
  revenueLak,
  transactionCount,
}: {
  categoryBreakdown: Array<{ label: string; value: number }>;
  customerCount: number;
  profitLak: number;
  revenueLak: number;
  transactionCount: number;
}) {
  return {
    categoryBreakdown,
    totalCustomers: customerCount,
    totalProfit: profitLak,
    totalRevenue: revenueLak,
    totalTransactions: transactionCount,
  };
}
