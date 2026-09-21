/** Shared STEP9 report lifecycle math. Safe for client and server. */

export function reportMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function refundAmountOf(refund: Record<string, any>) {
  const kind = String(refund.kind ?? "refund");
  return reportMoney(refund.refundAmount) || (kind === "refund" ? reportMoney(refund.totalAmount) : 0);
}

export function netReportLifecycle(refunds: Array<Record<string, any>>, saleItems: Array<Record<string, any>>) {
  const itemById = new Map(saleItems.map((item) => [String(item.id), item]));
  const net = { cogsLak: 0, profitLak: 0, quantitySold: 0, revenueLak: 0 };
  for (const refund of refunds) {
    const kind = String(refund.kind ?? "refund");
    const refundAmt = reportMoney(refund.refundAmount) || (kind === "refund" ? reportMoney(refund.totalAmount) : 0);
    if (kind === "refund") {
      net.revenueLak -= refundAmt;
    } else {
      net.revenueLak += reportMoney(refund.paymentAmount) - refundAmt;
    }
    for (const row of refund.items ?? []) {
      const qty = reportMoney(row.quantity);
      const item = itemById.get(String(row.saleItemId));
      net.quantitySold -= qty;
      if (item) {
        net.cogsLak -= reportMoney(item.costPrice) * qty;
        const originalQty = reportMoney(item.quantity) || 1;
        net.profitLak -= reportMoney(item.profitAmount) * (qty / originalQty);
      }
    }
    for (const row of refund.exchangeItems ?? []) {
      const qty = reportMoney(row.quantity);
      const lineTotal = reportMoney(row.totalAmount);
      const lineCost = reportMoney(row.costPrice) * qty;
      net.quantitySold += qty;
      net.cogsLak += lineCost;
      net.profitLak += lineTotal - lineCost;
    }
  }
  return net;
}
