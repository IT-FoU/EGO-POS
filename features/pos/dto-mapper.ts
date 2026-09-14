import type { PaymentMode, PosCustomer, PosProduct } from "@/features/pos/types";
import { compactProductImageKey } from "@/lib/storage/product-image-ref";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

export function mapPrismaPosCustomer(customer: Row): PosCustomer {
  const isActive = customer.status === "active";
  const discountPercent = toNumber(customer.membershipLevel?.discountPercent);
  const levelName = String(customer.membershipLevel?.name ?? "");
  const membershipType = levelName.toLowerCase().includes("student")
    ? "Student"
    : levelName.toLowerCase().includes("month")
      ? "Monthly"
      : "Yearly";
  const activeSubscription = (customer.subscriptions ?? []).find((entry: Row) => entry.status === "active");
  const hasMembershipLevel = Boolean(customer.membershipLevelId || customer.membershipLevel);
  let membershipExpiry = "";
  let membershipActive = isActive && hasMembershipLevel;

  if (activeSubscription?.endDate) {
    membershipExpiry = new Date(activeSubscription.endDate).toISOString().slice(0, 10);
    membershipActive = membershipActive && new Date(`${membershipExpiry}T23:59:59`).getTime() >= Date.now();
  } else if (!hasMembershipLevel) {
    membershipActive = false;
  }

  return {
    customerCode: customer.customerCode ?? "",
    discountPercent: discountPercent > 0 ? discountPercent : undefined,
    id: customer.id,
    membershipLevelId: customer.membershipLevelId ?? customer.membershipLevel?.id ?? undefined,
    membershipExpiry,
    membershipNumber: customer.qrMemberCode ?? customer.customerCode ?? customer.id,
    membershipStatus: membershipActive ? "Active" : "Expired",
    membershipType,
    name: customer.fullName,
    phone: customer.phone ?? "",
    pointsBalance: toNumber(customer.pointsBalance),
    schoolName: customer.schoolName ?? undefined,
    studentCardUrl: customer.studentCardUrl ?? undefined,
    studentIdNumber: customer.studentIdNumber ?? undefined,
  };
}

export function mapPrismaPosProduct(product: Row, warehouseId?: string): PosProduct {
  const units = (product.units ?? [])
    .map((unit: Row) => ({
      allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
      barcode: unit.barcode ?? "",
      conversionQty: toNumber(unit.conversionQty),
      costPriceLak: toNumber(unit.costPriceLak ?? product.costPriceLak),
      id: unit.id,
      imageUrl: unit.imageUrl ?? undefined,
      isBaseUnit: Boolean(unit.isBaseUnit),
      isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
      isPurchaseUnit: Boolean(unit.isPurchaseUnit),
      sellingPriceLak: toNumber(unit.sellingPriceLak),
      sortOrder: toNumber(unit.sortOrder),
      status: unit.status ?? "active",
      unitName: unit.unitName ?? "",
    }))
    .sort((left: Row, right: Row) => toNumber(left.sortOrder) - toNumber(right.sortOrder));
  const activeUnits = units.filter((unit: Row) => unit.status !== "inactive");
  const defaultSaleUnit = activeUnits.find((unit: Row) => unit.isDefaultSaleUnit) ?? activeUnits.find((unit: Row) => unit.isBaseUnit) ?? activeUnits[0];
  const baseUnit = activeUnits.find((unit: Row) => unit.isBaseUnit) ?? defaultSaleUnit;
  const balances = warehouseId
    ? (product.balances ?? []).filter((balance: Row) => balance.warehouseId === warehouseId)
    : (product.balances ?? []);
  const stockQty = balances.reduce(
    (total: number, balance: Row) => total + toNumber(balance.quantity),
    0,
  );

  return {
    barcode: product.barcode ?? "",
    categoryId: product.categoryId ?? product.category?.id ?? undefined,
    categoryName: product.category?.nameEn ?? product.category?.nameLo ?? "",
    id: product.id,
    imageKey: compactProductImageKey(product.imageUrl),
    productImageUrl: product.imageUrl || undefined,
    unitImageUrl: defaultSaleUnit?.imageUrl || product.imageUrl || undefined,
    nameEn: product.nameEn ?? "",
    nameLo: product.nameLo,
    priceLak: toNumber(defaultSaleUnit?.sellingPriceLak ?? product.sellingPriceLak),
    costPriceLak: toNumber(defaultSaleUnit?.costPriceLak ?? product.costPriceLak),
    conversionQty: toNumber(defaultSaleUnit?.conversionQty ?? 1) || 1,
    productCode: product.productCode ?? "",
    sku: product.sku ?? "",
    stockQty,
    unitId: defaultSaleUnit?.id,
    unitName: defaultSaleUnit?.unitName ?? baseUnit?.unitName ?? "Piece",
    units,
  };
}

export function mapPaymentModeToSalePayments({
  cardAmount = 0,
  cashAmount,
  changeAmount,
  paymentMode,
  qrAmount,
  transferAmount = 0,
}: {
  cardAmount?: number;
  cashAmount: number;
  changeAmount: number;
  paymentMode: PaymentMode;
  qrAmount: number;
  transferAmount?: number;
}) {
  if (paymentMode === "mixed") {
    return [
      { amount: cashAmount, changeAmount, paymentMethod: "cash" as const },
      { amount: qrAmount, changeAmount: 0, paymentMethod: "qr" as const },
      { amount: transferAmount, changeAmount: 0, paymentMethod: "transfer" as const },
      { amount: cardAmount, changeAmount: 0, paymentMethod: "visa" as const },
    ].filter((payment) => payment.amount > 0);
  }

  if (paymentMode === "transfer") {
    return [{ amount: transferAmount, changeAmount: 0, paymentMethod: "transfer" as const }];
  }

  if (paymentMode === "card") {
    return [{ amount: cardAmount, changeAmount: 0, paymentMethod: "visa" as const }];
  }

  return [
    {
      amount: paymentMode === "cash" ? cashAmount : qrAmount,
      changeAmount,
      paymentMethod: paymentMode,
    },
  ];
}
