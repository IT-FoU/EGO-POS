export type ProductStatus = "active" | "inactive" | "draft" | "deleted";
export type StockDisplayMode = "base_unit_only" | "breakdown";
export type UnitStatus = "active" | "inactive";
export type UnitPricingMode = "manual" | "cost_plus_percent" | "cost_plus_amount";

export type ProductUnit = {
  allowManualUnitSelect?: boolean;
  id: string;
  unitName: string;
  conversionQty: number;
  barcode: string;
  costPriceLak?: number;
  pricingMode?: UnitPricingMode;
  markupPercent?: number;
  addAmountLak?: number;
  roundingLak?: number;
  imageUrl?: string;
  imageDisplayUrl?: string;
  imageThumbUrl?: string;
  sellingPriceLak: number;
  isBaseUnit: boolean;
  isDefaultSaleUnit?: boolean;
  isPurchaseUnit?: boolean;
  sortOrder?: number;
  status?: UnitStatus;
};

export type Product = {
  barcodeHistory?: Array<{
    changedBy?: string;
    createdAt: string;
    newBarcode?: string;
    oldBarcode?: string;
    unitName?: string;
  }>;
  id: string;
  imageUrl?: string;
  imageDisplayUrl?: string;
  imageThumbUrl?: string;
  productCode?: string;
  barcode: string;
  sku: string;
  nameLo: string;
  nameEn: string;
  description?: string;
  tags?: string[];
  categoryId: string;
  categoryName: string;
  supplierName: string;
  brandName: string;
  costPriceLak: number;
  currentStock?: number;
  expiryDate?: string;
  stockDisplayMode?: StockDisplayMode;
  sellingPriceLak: number;
  minStock: number;
  status: ProductStatus;
  units: ProductUnit[];
  priceHistory?: Array<{
    changeType: string;
    changedBy?: string;
    createdAt: string;
    newPrice: number;
    oldPrice: number;
    unitName?: string;
  }>;
  updatedAt: string;
};

export type Category = {
  id: string;
  nameLo: string;
  nameEn: string;
  parentName?: string;
  parentNameEn?: string;
  parentNameLo?: string;
  productCount: number;
  status: "active" | "inactive";
};

export type MockProductImage = {
  id: string;
  title: string;
  keyword: string;
  color: string;
};
