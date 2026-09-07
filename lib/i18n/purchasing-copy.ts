import { normalizeLocale } from "@/lib/i18n/locale";

const en = {
  action: "Action",
  activeSuppliers: "Active suppliers",
  addAtLeastOneLine: "Add at least one product line.",
  addProductsHint: "Add products to build the purchase order.",
  address: "Address",
  allStatuses: "All statuses",
  alreadyReceived: "Already received",
  approvalRequired: "Approval required.",
  backToPurchasing: "Back to purchasing",
  barcode: "Barcode",
  barcodeSku: "Barcode / SKU",
  cancel: "Cancel",
  cannotChangeStatus: "Cannot change this purchase order status.",
  cannotReceiveCancelled: "Cannot receive a cancelled PO.",
  close: "Close",
  confirmCancel: "Cancel {no}?",
  contact: "Contact",
  costCurrency: "Cost currency",
  createFailed: "Purchase Order create failed.",
  creditLimit: "Credit limit",
  creditSummary: "Credit summary",
  currency: "Currency",
  databaseStatus: "Database status",
  daysOverdue: "{days} days overdue",
  dismiss: "Dismiss",
  dueDate: "Due Date",
  email: "Email",
  enterPaymentAmount: "Enter a payment amount for a payable linked to a purchase order.",
  enterReceiveQuantity: "Enter at least one receive quantity.",
  exchangeRateToLak: "Exchange rate to LAK",
  expiry: "Expiry",
  expiryDate: "Expiry date",
  failedToLoad: "Failed to load purchasing.",
  failedToUpdateStatus: "Failed to update purchase order status.",
  filterByStatus: "Filter by status",
  goodsReceivedSuccessfully: "Goods received successfully.",
  goodsReceivingFailed: "Goods receiving failed.",
  invalidCost: "Invalid cost.",
  invalidQuantity: "Invalid quantity.",
  lastPo: "Last PO",
  lineTotal: "Line total",
  loadingPurchasing: "Loading purchasing...",
  lot: "lot",
  lotNumber: "Lot number",
  mode: "Mode",
  mustContainItem: "Add at least one item.",
  newPurchaseOrder: "New Purchase Order",
  newPurchaseOrderSubtitle: "Create a purchase order with supplier, warehouse, currency, exchange rate, product search, units, lot numbers, and expiry dates.",
  newPurchaseOrderTitle: "New purchase order",
  noOutstandingPayable: "No outstanding payable for this purchase. Receive goods first.",
  noPayables: "No payables",
  noPurchaseOrders: "No purchase orders",
  noReceivableOrders: "No receivable purchase orders.",
  noResults: "No results",
  noSupplierCredit: "No supplier credit found.",
  openOrders: "Open orders",
  openPurchaseOrders: "Open purchase orders",
  orderDetails: "Order details",
  ordered: "Ordered",
  orderedQuantity: "Ordered quantity",
  orderLines: "Order lines",
  outstanding: "Outstanding",
  outstandingBalance: "Outstanding balance",
  outstandingCurrency: "Outstanding {currency}",
  paid: "Paid",
  paidAmount: "Paid amount ({currency})",
  paidAmountLabel: "Paid amount",
  paidLak: "Paid in LAK",
  paidLakCol: "Paid LAK",
  partialReceives: "Partial receives",
  payables: "Payables",
  payablesSubtitle: "Supplier outstanding balances with paid, unpaid, due date, and payment entry.",
  payment: "Payment",
  paymentAmountRequired: "Payment amount must be greater than zero.",
  paymentExceedsBalance: "Payment exceeds outstanding balance.",
  paymentSummary: "Payment summary",
  payNow: "Pay Now",
  paySupplier: "Pay Supplier",
  permissionDenied: "Permission denied.",
  phone: "Phone",
  po: "PO",
  poNotFound: "PO not found.",
  product: "Product",
  productSearch: "Product search",
  productSearchHint: "Search by product name, SKU, or barcode.",
  projectedReceived: "Projected received",
  purchaseOrder: "Purchase Order",
  purchaseOrders: "Purchase orders",
  purchaseOrdersHint: "Multi-currency order list with receiving progress and LAK exchange visibility.",
  purchaseOrderSaveFailed: "Purchase order save failed.",
  purchaseOrderSaved: "Purchase order saved successfully.",
  purchaseSubtotalInvalid: "Purchase order subtotal is invalid.",
  purchasing: "Purchasing",
  purchasingManagement: "Purchasing Management",
  purchasingSubtitle: "Supplier purchasing workspace for purchase orders, receiving, supplier credit, currencies, exchange rates, and warehouses.",
  qty: "Qty",
  realDatabase: "Real database",
  receive: "Receive",
  receiveFailed: "Receive failed.",
  receiveGoods: "Receive Goods",
  receiveNow: "Receive now",
  receiveSummary: "Receive summary",
  received: "Received",
  receivedPrefix: "Received: ",
  receivedQtyExceedsRemaining: "Received quantity exceeds remaining quantity.",
  receivingGoods: "Receiving goods",
  receivingNow: "Receiving now",
  receivingProgress: "Receiving progress",
  receivingSubtitle: "Receive stock from purchase orders, including partial receives, warehouse selection, lot number, expiry date, barcode, and SKU.",
  remainingPrefix: "Remaining: ",
  removeLine: "Remove line",
  retry: "Retry",
  save: "Save",
  saveReceive: "Save receive",
  saving: "Saving...",
  searchPayable: "Search payable",
  searchPoOrSupplier: "Search PO or supplier",
  searchProducts: "Search products",
  searchSupplier: "Search supplier",
  selectPoFirst: "Select a purchase order first.",
  selectSupplier: "Select Supplier",
  send: "Send",
  sku: "SKU",
  status: "Status",
  statusActive: "Active",
  statusCancelled: "Cancelled",
  statusClosed: "Closed",
  statusDraft: "Draft",
  statusInactive: "Inactive",
  statusNow: "{no} is now {status}.",
  statusOrdered: "Ordered",
  statusOverdue: "Overdue",
  statusPaid: "Paid",
  statusPartial: "Partial Received",
  statusPartialPay: "Partial",
  statusReceived: "Received",
  statusUnpaid: "Unpaid",
  subtotal: "Subtotal",
  subtotalLak: "Subtotal in LAK",
  supplier: "Supplier",
  supplierCode: "Supplier Code",
  supplierCredit: "Supplier credit",
  supplierCreditTitle: "Supplier Credit",
  supplierList: "Supplier List",
  supplierManagement: "Supplier Management",
  supplierPayableList: "Supplier payable list",
  supplierPaymentFailed: "Supplier payment failed.",
  supplierPaymentSaved: "Supplier payment saved successfully.",
  supplierSnapshot: "Supplier snapshot",
  supplierProfileLater: "Supplier profile for {name} will be connected later.",
  suppliers: "Suppliers",
  suppliersSubtitle: "Supplier list and detail summary with purchasing, payable, contact, credit, and active status foundations.",
  suppliersTracked: "Suppliers tracked",
  totalLak: "Total LAK",
  totalPurchases: "Total Purchases",
  unit: "Unit",
  unitCost: "Unit cost",
  units: "units",
  unpaid: "Unpaid",
  unpaidAmountLabel: "Unpaid amount",
  unpaidLak: "Unpaid in LAK",
  unpaidLakCol: "Unpaid LAK",
  updateFailed: "Purchase Order update failed.",
  warehouse: "Warehouse",
  warehouseMustMatch: "Goods receipt warehouse must match the purchase warehouse.",
  warehouseRequired: "Warehouse is required.",
};

const lo = {
  action: "ຄຳສັ່ງ",
  activeSuppliers: "ຜູ້ສະໜອງໃຊ້ງານ",
  addAtLeastOneLine: "ຕ້ອງເພີ່ມສິນຄ້າ ຢ່າງ ໜ້ອຍ 1 ລາຍການ.",
  addProductsHint: "ເພີ່ມສິນຄ້າເພື່ອ ສ້າງ PO.",
  address: "ທີ່ຢູ່",
  allStatuses: "ທຸກສະຖານະ",
  alreadyReceived: "ຮັບແລ້ວ",
  approvalRequired: "ຕ້ອງອະນຸມັດກ່ອນ.",
  backToPurchasing: "ກັບໄປຈັດຊື້",
  barcode: "Barcode",
  barcodeSku: "Barcode / SKU",
  cancel: "ຍົກເລີກ",
  cannotChangeStatus: "ແກ້ສະຖານະ PO ນີ້ບໍ່ໄດ້.",
  cannotReceiveCancelled: "ຮັບ PO ທີ່ຍົກເລີກແລ້ວບໍ່ໄດ້.",
  close: "ປິດ",
  confirmCancel: "ຍົກເລີກ {no}?",
  contact: "ຕິດຕໍ່",
  costCurrency: "ສະກຸນຕົ້ນທຶນ",
  createFailed: "ສ້າງ PO ບໍ່ສຳເລັດ.",
  creditLimit: "ວົງເງິນສິນເຊື່ອ",
  creditSummary: "ສະຫຼຸບສິນເຊື່ອ",
  currency: "ສະກຸນ",
  databaseStatus: "ສະຖານະຖານຂໍ້ມູນ",
  daysOverdue: "ເກີນ {days} ວັນ",
  dismiss: "ປິດ",
  dueDate: "ວັນຄົບກຳນົດ",
  email: "ອີເມວ",
  enterPaymentAmount: "ໃສ່ຈຳນວນຈ່າຍສຳລັບລາຍຈ່າຍ ທີ່ເຊື່ອມ PO.",
  enterReceiveQuantity: "ໃສ່ຈຳນວນຮັບ ຢ່າງ ໜ້ອຍ 1.",
  exchangeRateToLak: "ອັດຕາແລກເປັນ LAK",
  expiry: "ໝົດອາຍຸ",
  expiryDate: "ວັນໝົດອາຍຸ",
  failedToLoad: "ໂຫຼດຈັດຊື້ບໍ່ສຳເລັດ.",
  failedToUpdateStatus: "ແກ້ສະຖານະ PO ບໍ່ສຳເລັດ.",
  filterByStatus: "ກອງຕາມສະຖານະ",
  goodsReceivedSuccessfully: "ຮັບສິນຄ້າແລ້ວ.",
  goodsReceivingFailed: "ຮັບສິນຄ້າບໍ່ສຳເລັດ.",
  invalidCost: "ຕົ້ນທຶນບໍ່ຖືກຕ້ອງ.",
  invalidQuantity: "ຈຳນວນບໍ່ຖືກຕ້ອງ.",
  lastPo: "PO ຫຼ້າສຸດ",
  lineTotal: "ລວມແຖວ",
  loadingPurchasing: "ກຳລັງໂຫຼດຈັດຊື້...",
  lot: "lot",
  lotNumber: "lot",
  mode: "ໂໝດ",
  mustContainItem: "ຕ້ອງມີ ຢ່າງ ໜ້ອຍ 1 ລາຍການ.",
  newPurchaseOrder: "ສ້າງ PO ໃໝ່",
  newPurchaseOrderSubtitle: "ສ້າງ PO ພ້ອມຜູ້ສະໜອງ, ສາງ, ສະກຸນ, ອັດຕາແລກ, ຄົ້ນສິນຄ້າ, ໜ່ວຍ, lot, ແລະ ວັນໝົດອາຍຸ.",
  newPurchaseOrderTitle: "ສ້າງ PO ໃໝ່",
  noOutstandingPayable: "ຍັງບໍ່ມີຍອດຄ້າງ. ຮັບສິນຄ້າກ່ອນ.",
  noPayables: "ບໍ່ມີລາຍຈ່າຍ",
  noPurchaseOrders: "ບໍ່ມີໃບສັ່ງຊື້",
  noReceivableOrders: "ບໍ່ມີ PO ທີ່ຮັບໄດ້.",
  noResults: "ບໍ່ພົບຜົນ",
  noSupplierCredit: "ບໍ່ພົບສິນເຊື່ອຜູ້ສະໜອງ.",
  openOrders: "PO ເປີດ",
  openPurchaseOrders: "PO ເປີດ",
  orderDetails: "ລາຍລະອຽດສັ່ງຊື້",
  ordered: "ສັ່ງ",
  orderedQuantity: "ຈຳນວນສັ່ງ",
  orderLines: "ລາຍການ",
  outstanding: "ຍອດຄ້າງ",
  outstandingBalance: "ຍອດຄ້າງ",
  outstandingCurrency: "ຍອດຄ້າງ {currency}",
  paid: "ຈ່າຍແລ້ວ",
  paidAmount: "ຈຳນວນຈ່າຍ ({currency})",
  paidAmountLabel: "ຍອດຈ່າຍ",
  paidLak: "ຈ່າຍແລ້ວ LAK",
  paidLakCol: "ຈ່າຍ LAK",
  partialReceives: "ຮັບບາງສ່ວນ",
  payables: "ຈ່າຍຄ້າງ",
  payablesSubtitle: "ຍອດຄ້າງຜູ້ສະໜອງ ພ້ອມ ຈ່າຍ ເຫຼືອ ວັນຄົບກຳນົດ ແລະ ບັນທຶກການຈ່າຍ.",
  payment: "ການຈ່າຍ",
  paymentAmountRequired: "ຈຳນວນຈ່າຍຕ້ອງຫຼາຍກວ່າ 0.",
  paymentExceedsBalance: "ຈຳນວນຈ່າຍເກີນຍອດຄ້າງ.",
  paymentSummary: "ສະຫຼຸບການຈ່າຍ",
  payNow: "ຈ່າຍດຽວນີ້",
  paySupplier: "ຈ່າຍຜູ້ສະໜອງ",
  permissionDenied: "ບໍ່ມີສິດ.",
  phone: "ໂທ",
  po: "PO",
  poNotFound: "ບໍ່ພົບ PO.",
  product: "ສິນຄ້າ",
  productSearch: "ຄົ້ນສິນຄ້າ",
  productSearchHint: "ຄົ້ນຕາມຊື່, SKU, ຫຼື Barcode.",
  projectedReceived: "ຄາດວ່າຮັບລວມ",
  purchaseOrder: "ໃບສັ່ງຊື້",
  purchaseOrders: "ໃບສັ່ງຊື້",
  purchaseOrdersHint: "ລາຍ PO ຫຼາຍ ສະກຸນ ພ້ອມຄືບໜ້າຮັບ ແລະ ອັດຕາແລກ LAK.",
  purchaseOrderSaveFailed: "ບັນທຶກ PO ບໍ່ສຳເລັດ.",
  purchaseOrderSaved: "ບັນທຶກ PO ແລ້ວ.",
  purchaseSubtotalInvalid: "ຍອດລວມ PO ບໍ່ຖືກຕ້ອງ.",
  purchasing: "ຈັດຊື້",
  purchasingManagement: "ຈັດການຈັດຊື້",
  purchasingSubtitle: "ພື້ນທີ່ຈັດຊື້ສຳລັບ PO, ຮັບສິນຄ້າ, ສິນເຊື່ອຜູ້ສະໜອງ, ສະກຸນ, ອັດຕາແລກ, ແລະ ສາງ.",
  qty: "ຈຳນວນ",
  realDatabase: "Real database",
  receive: "ຮັບ",
  receiveFailed: "ຮັບບໍ່ສຳເລັດ.",
  receiveGoods: "ຮັບສິນຄ້າ",
  receiveNow: "ຮັບດຽວນີ້",
  receiveSummary: "ສະຫຼຸບການຮັບ",
  received: "ຮັບແລ້ວ",
  receivedPrefix: "ຮັບແລ້ວ: ",
  receivedQtyExceedsRemaining: "ຈຳນວນຮັບເກີນຍອດເຫຼືອ.",
  receivingGoods: "ຮັບສິນຄ້າ",
  receivingNow: "ກຳລັງຮັບ",
  receivingProgress: "ຄືບໜ້າຮັບ",
  receivingSubtitle: "ຮັບສາງຈາກ PO ລວມຮັບບາງສ່ວນ, ເລືອກສາງ, lot, ວັນໝົດອາຍຸ, Barcode, ແລະ SKU.",
  remainingPrefix: "ເຫຼືອ: ",
  removeLine: "ລຶບແຖວ",
  retry: "ລອງໃໝ່",
  save: "ບັນທຶກ",
  saveReceive: "ບັນທຶກການຮັບ",
  saving: "ກຳລັງບັນທຶກ...",
  searchPayable: "ຄົ້ນລາຍຈ່າຍ",
  searchPoOrSupplier: "ຄົ້ນ PO ຫຼື ຜູ້ສະໜອງ",
  searchProducts: "ຄົ້ນສິນຄ້າ",
  searchSupplier: "ຄົ້ນຜູ້ສະໜອງ",
  selectPoFirst: "ເລືອກ PO ກ່ອນ.",
  selectSupplier: "ເລືອກຜູ້ສະໜອງ",
  send: "ສົ່ງ",
  sku: "SKU",
  status: "ສະຖານະ",
  statusActive: "ໃຊ້ງານ",
  statusCancelled: "ຍົກເລີກ",
  statusClosed: "ປິດແລ້ວ",
  statusDraft: "ຮ່າງ",
  statusInactive: "ຢຸດໃຊ້",
  statusNow: "{no} ເປັນ {status} ແລ້ວ.",
  statusOrdered: "ສັ່ງແລ້ວ",
  statusOverdue: "ເກີນກຳນົດ",
  statusPaid: "ຈ່າຍແລ້ວ",
  statusPartial: "ຮັບບາງສ່ວນ",
  statusPartialPay: "ບາງສ່ວນ",
  statusReceived: "ຮັບແລ້ວ",
  statusUnpaid: "ຍັງບໍ່ຈ່າຍ",
  subtotal: "ຍອດລວມ",
  subtotalLak: "ຍອດລວມ LAK",
  supplier: "ຜູ້ສະໜອງ",
  supplierCode: "ລະຫັດຜູ້ສະໜອງ",
  supplierCredit: "ສິນເຊື່ອຜູ້ສະໜອງ",
  supplierCreditTitle: "ສິນເຊື່ອຜູ້ສະໜອງ",
  supplierList: "ລາຍຜູ້ສະໜອງ",
  supplierManagement: "ຈັດການຜູ້ສະໜອງ",
  supplierPayableList: "ລາຍຈ່າຍຄ້າງ",
  supplierPaymentFailed: "ຈ່າຍຜູ້ສະໜອງບໍ່ສຳເລັດ.",
  supplierPaymentSaved: "ບັນທຶກການຈ່າຍແລ້ວ.",
  supplierSnapshot: "ສະຫຼຸບຜູ້ສະໜອງ",
  supplierProfileLater: "ໂປຣໄຟລ໌ຜູ້ສະໜອງ {name} ຈະເຊື່ອມພາຍຫຼັງ.",
  suppliers: "ຜູ້ສະໜອງ",
  suppliersSubtitle: "ລາຍຜູ້ສະໜອງ ແລະ ສະຫຼຸບການຊື້, ຈ່າຍຄ້າງ, ຕິດຕໍ່, ສິນເຊື່ອ, ແລະ ສະຖານະ.",
  suppliersTracked: "ຜູ້ສະໜອງຕິດຕາມ",
  totalLak: "ລວມ LAK",
  totalPurchases: "ຊື້ລວມ",
  unit: "ໜ່ວຍ",
  unitCost: "ຕົ້ນທຶນໜ່ວຍ",
  units: "ໜ່ວຍ",
  unpaid: "ຍັງບໍ່ຈ່າຍ",
  unpaidAmountLabel: "ຍອດຄ້າງ",
  unpaidLak: "ຍັງບໍ່ຈ່າຍ LAK",
  unpaidLakCol: "ຄ້າງ LAK",
  updateFailed: "ແກ້ PO ບໍ່ສຳເລັດ.",
  warehouse: "ສາງ",
  warehouseMustMatch: "ສາງຮັບຕ້ອງກົງກັບສາງຂອງ PO.",
  warehouseRequired: "ຕ້ອງເລືອກສາງ.",
} as Record<keyof typeof en, string>;

export type PurchasingCopyKey = keyof typeof en;
export type PurchasingCopy = Record<PurchasingCopyKey, string>;

const dictionaries: Record<"en" | "lo", PurchasingCopy> = { en, lo: lo as PurchasingCopy };

function resolvePurchasingLocale(locale?: string | null): "en" | "lo" {
  if (locale) {
    return normalizeLocale(locale);
  }
  if (typeof document !== "undefined") {
    return normalizeLocale(document.documentElement.dataset.locale);
  }
  return "en";
}

export function getPurchasingCopy(locale?: string | null): PurchasingCopy {
  return dictionaries[resolvePurchasingLocale(locale)];
}

export function tPurchasing(key: string, locale?: string | null) {
  const copy = getPurchasingCopy(locale);
  if (key in copy) {
    return copy[key as PurchasingCopyKey];
  }
  return en[key as PurchasingCopyKey] ?? key;
}

export function fillPurchasingCopy(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function purchasingCopyKeyParity() {
  const enKeys = Object.keys(en).sort();
  const loKeys = Object.keys(lo).sort();
  return enKeys.length === loKeys.length && enKeys.every((key, index) => key === loKeys[index]);
}

export function purchasingCopyHasNoReplacementChars() {
  return !Object.values(lo).some((value) => value.includes("\uFFFD"));
}

export function purchaseStatusLabel(status: string, locale?: string | null) {
  const map: Record<string, PurchasingCopyKey> = {
    cancelled: "statusCancelled",
    closed: "statusClosed",
    draft: "statusDraft",
    ordered: "statusOrdered",
    partial: "statusPartial",
    received: "statusReceived",
  };
  const key = map[status];
  return key ? tPurchasing(key, locale) : status;
}

export function payableStatusLabel(status: string, locale?: string | null) {
  const map: Record<string, PurchasingCopyKey> = {
    overdue: "statusOverdue",
    paid: "statusPaid",
    partial: "statusPartialPay",
    unpaid: "statusUnpaid",
  };
  const key = map[status];
  return key ? tPurchasing(key, locale) : status;
}

export function supplierStatusLabel(status: string, locale?: string | null) {
  if (status === "active") return tPurchasing("statusActive", locale);
  if (status === "inactive") return tPurchasing("statusInactive", locale);
  return status;
}

export function purchaseActionLabel(action: string, locale?: string | null) {
  const map: Record<string, PurchasingCopyKey> = {
    cancel: "cancel",
    close: "close",
    send: "send",
  };
  const key = map[action];
  return key ? tPurchasing(key, locale) : action;
}

const knownErrors: Record<string, PurchasingCopyKey> = {
  "Add at least one product line.": "addAtLeastOneLine",
  "Purchase order save failed.": "purchaseOrderSaveFailed",
  "Purchase order saved successfully.": "purchaseOrderSaved",
  "Select a purchase order first.": "selectPoFirst",
  "Enter at least one receive quantity.": "enterReceiveQuantity",
  "Goods receiving failed.": "goodsReceivingFailed",
  "Goods received successfully.": "goodsReceivedSuccessfully",
  "Enter a payment amount for a payable linked to a purchase order.": "enterPaymentAmount",
  "Supplier payment failed.": "supplierPaymentFailed",
  "Supplier payment saved successfully.": "supplierPaymentSaved",
  "Failed to update purchase order status.": "failedToUpdateStatus",
  "Purchase order subtotal is invalid.": "purchaseSubtotalInvalid",
  "Paid amount cannot exceed purchase order total.": "paymentExceedsBalance",
  "Goods receipt warehouse must match the purchase warehouse.": "warehouseMustMatch",
  "Payment amount must be greater than zero.": "paymentAmountRequired",
  "No outstanding payable for this purchase. Receive goods first.": "noOutstandingPayable",
  "Warehouse is required.": "warehouseRequired",
};

const knownErrorPrefixes: Array<{ prefix: string; key: PurchasingCopyKey }> = [
  { prefix: "Receipt quantity exceeds remaining quantity", key: "receivedQtyExceedsRemaining" },
  { prefix: "Receipt quantity must be greater than zero", key: "invalidQuantity" },
  { prefix: "Purchase order is already", key: "cannotChangeStatus" },
  { prefix: "Cannot change purchase order from", key: "cannotChangeStatus" },
  { prefix: "Purchase order items must contain at least one item.", key: "mustContainItem" },
];

export function localizePurchasingError(error?: string | null, locale?: string | null) {
  if (!error) {
    return tPurchasing("failedToLoad", locale);
  }
  if (error.startsWith("Permission denied")) {
    return tPurchasing("permissionDenied", locale);
  }
  const exact = knownErrors[error];
  if (exact) {
    return tPurchasing(exact, locale);
  }
  const prefixed = knownErrorPrefixes.find((entry) => error.startsWith(entry.prefix));
  if (prefixed) {
    return tPurchasing(prefixed.key, locale);
  }
  return error;
}
