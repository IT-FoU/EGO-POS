import type {
  Customer,
  CustomerPayment,
  CustomerPurchase,
  CustomerStatus,
  MembershipLevel,
  MembershipLevelName,
} from "@/features/customers/types";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

function dateOnly(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : "";
}

function levelName(value: unknown): MembershipLevelName {
  return value === "Silver" || value === "Gold" || value === "Platinum" ? value : "Standard";
}

export function mapPrismaMembershipLevel(level: Row): MembershipLevel {
  return {
    discountPercent: toNumber(level.discountPercent),
    id: level.id,
    minSpendLak: toNumber(level.minSpendLak),
    name: levelName(level.name),
  };
}

export function mapPrismaCustomer(customer: Row): Customer {
  const ledger = customer.loyaltyPointLedger ?? [];
  const earnedPoints = ledger
    .filter((entry: Row) => entry.pointType === "earn")
    .reduce((total: number, entry: Row) => total + Number(entry.points ?? 0), 0);
  const redeemedPoints = ledger
    .filter((entry: Row) => entry.pointType === "redeem")
    .reduce((total: number, entry: Row) => total + Math.abs(Number(entry.points ?? 0)), 0);

  return {
    address: customer.address ?? "",
    birthday: dateOnly(customer.birthday),
    creditLimitLak: toNumber(customer.creditLimit),
    customerCode: customer.customerCode ?? "",
    earnedPoints,
    email: customer.email ?? "",
    fullName: customer.fullName,
    id: customer.id,
    membershipLevel: levelName(customer.membershipLevel?.name),
    notes: customer.notes ?? "",
    openingBalanceLak: toNumber(customer.openingBalance),
    outstandingBalanceLak: toNumber(customer.outstandingBalance),
    phone: customer.phone ?? "",
    pointsBalance: toNumber(customer.pointsBalance),
    redeemedPoints,
    status: (customer.status === "inactive" ? "inactive" : "active") as CustomerStatus,
    totalPurchasesLak: toNumber(customer.totalSpent),
  };
}

export function mapPrismaCustomerPurchase(sale: Row, loyaltySpendPerPointLak = 10_000): CustomerPurchase {
  const ledger = sale.loyaltyPointLedger ?? [];
  const netEarn = ledger.reduce((total: number, entry: Row) => {
    if (entry.pointType === "earn" || String(entry.note ?? "").startsWith("Reversed earn") || String(entry.note ?? "").startsWith("Exchange earn")) {
      return total + Number(entry.points ?? 0);
    }
    return total;
  }, 0);
  const spendPerPoint = Math.max(Number(loyaltySpendPerPointLak) || 10_000, 1);
  return {
    customerId: sale.customerId ?? "",
    id: sale.id,
    paymentType: sale.payments?.length > 1 ? "mixed" : (sale.payments?.[0]?.paymentMethod ?? "cash"),
    pointsEarned: ledger.length > 0 ? netEarn : Math.floor(toNumber(sale.totalAmount) / spendPerPoint),
    saleDate: dateOnly(sale.createdAt),
    saleNo: sale.saleNo,
    totalLak: toNumber(sale.totalAmount),
  };
}

export function mapPrismaCustomerPayment(payment: Row): CustomerPayment {
  return {
    amountLak: toNumber(payment.amountLak),
    customerId: payment.customerId,
    id: payment.id,
    method: payment.paymentMethod === "transfer" ? "bank" : payment.paymentMethod,
    note: payment.note ?? "",
    paymentDate: dateOnly(payment.paidAt),
    paymentNo: payment.paymentNo ?? "",
  };
}
