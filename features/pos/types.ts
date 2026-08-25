export type PosProductUnit = {
  allowManualUnitSelect: boolean;
  barcode: string;
  conversionQty: number;
  costPriceLak: number;
  id: string;
  imageUrl?: string;
  isBaseUnit: boolean;
  isDefaultSaleUnit: boolean;
  isPurchaseUnit: boolean;
  sellingPriceLak: number;
  sortOrder: number;
  status: "active" | "inactive";
  unitName: string;
};

export type PosProduct = {
  id: string;
  barcode: string;
  sku: string;
  productCode?: string;
  nameLo: string;
  nameEn: string;
  categoryId?: string;
  categoryName: string;
  imageKey: string;
  unitImageUrl?: string;
  unitName: string;
  unitId?: string;
  units?: PosProductUnit[];
  priceLak: number;
  costPriceLak?: number;
  conversionQty?: number;
  stockQty: number;
  isFavorite?: boolean;
  lastSoldAt?: string | null;
  lowStockThreshold?: number;
  expiryDate?: string | null;
  specialStudentPriceLak?: number;
};

export type PosCartItem = PosProduct & {
  cartLineId?: string;
  quantity: number;
  retailPriceLak: number;
  stockWarning?: {
    label: string;
    tone: "orange" | "yellow" | "red";
  };
  pricingNote?: string;
  unitId?: string;
  conversionQty?: number;
  costPriceLak?: number;
};

export type HeldSale = {
  id: string;
  saleNo: string;
  createdAt: string;
  itemCount: number;
  totalLak: number;
  items: PosCartItem[];
  snapshot?: HeldBillCartSnapshot;
};

export type HeldBillCartSnapshot = {
  appliedPromotions: string[];
  cardAmount: number;
  cashAmount: number;
  cartItems: PosCartItem[];
  customer: PosCustomer | null;
  discountAmount: number;
  discountPercent: number;
  membershipDiscountLak: number;
  note?: string;
  paymentMode: PaymentMode;
  qrAmount: number;
  redeemPoints: number;
  taxAmount: number;
  taxEnabled: boolean;
  taxRatePercent: number;
  transferAmount: number;
};

export type PaymentMode = "cash" | "qr" | "transfer" | "card" | "mixed";

export type PosCustomer = {
  id: string;
  customerCode: string;
  name: string;
  phone: string;
  membershipNumber: string;
  membershipType: "Monthly" | "Yearly" | "Student";
  membershipStatus: "Active" | "Expired";
  membershipExpiry: string;
  membershipLevelId?: string;
  pointsBalance: number;
  studentIdNumber?: string;
  schoolName?: string;
  studentCardUrl?: string;
  discountPercent?: number;
};

export type QrBank = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl?: string;
};

export type PosReceiptSettings = {
  companyName: string;
  profileAddress?: string;
  profileEmail?: string;
  profilePhone?: string;
  receiptFooter?: string;
  receiptHeader?: string;
  receiptPrintMode?: "ask_every_time" | "auto_print" | "no_auto_print";
  receiptPrefix: string;
  showLogoOnReceipt: boolean;
  showTaxOnReceipt: boolean;
  taxNumber?: string;
};

export type PosLoyaltySettings = {
  loyaltyEnabled: boolean;
  loyaltyMinRedeemPoints: number;
  loyaltyPointValueLak: number;
  loyaltySpendPerPointLak: number;
};

export type PosCashSessionContext = {
  cashInLak: number;
  cashOutLak: number;
  cashSalesLak: number;
  expectedCashLak: number;
  nonCashSalesLak: number;
  openedAt: string | null;
  openingCashLak: number;
  sessionId: string | null;
  status: "closed" | "not_started" | "open";
};

export type PosMembershipLevel = {
  discountPercent: number;
  id: string;
  name: string;
};

export type PosPromotion = {
  buyQuantity?: number;
  categories: Array<{ categoryId: string }>;
  comboPriceLak?: number;
  discountAmountLak?: number;
  discountPercent?: number;
  endDate: string;
  getQuantity?: number;
  id: string;
  isActive: boolean;
  membershipLevels: Array<{ membershipLevelId: string }>;
  priority: number;
  products: Array<{ productId: string }>;
  promotionCode?: string | null;
  promotionName: string;
  promotionType: string;
  startDate: string;
  status: string;
};

export type PosDisplayState = {
  appliedPromotions: string[];
  customer?: PosCustomer | null;
  displayMode?: "advertising" | "checkout" | "thank_you";
  items: PosCartItem[];
  membershipDiscountLak?: number;
  membershipPoints: number;
  membershipStatus: string;
  pointsEarned?: number;
  promotionDiscountLak?: number;
  selectedQrBank?: QrBank | null;
  storeLogoUrl?: string | null;
  subtotalLak?: number;
  totalLak: number;
};
