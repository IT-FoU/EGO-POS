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
  receiptFooter?: string;
  receiptHeader?: string;
  receiptPrintMode?: "ask_every_time" | "auto_print" | "no_auto_print";
  receiptPrefix: string;
  showLogoOnReceipt: boolean;
  showTaxOnReceipt: boolean;
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
