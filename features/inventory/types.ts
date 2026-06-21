export type Warehouse = {
  id: string;
  name: string;
  branchName: string;
  type: "store" | "stockroom" | "distribution";
};

export type InventoryItem = {
  id: string;
  productId: string;
  warehouseId: string;
  imageKey: string;
  productNameLo: string;
  productNameEn: string;
  barcode: string;
  sku: string;
  productCode?: string;
  category: string;
  baseUnit: string;
  quantity: number;
  supplierId?: string;
  supplierName?: string;
  inventoryValueLak?: number;
  lastPurchaseDate?: string;
  unitsSold30Days?: number;
  expiryTrackingEnabled?: boolean;
  units?: Array<{
    barcode: string;
    conversionQty: number;
    costPriceLak?: number;
    id: string;
    isBaseUnit: boolean;
    isPurchaseUnit: boolean;
    imageUrl?: string;
    status: "active" | "inactive";
    unitName: string;
  }>;
  minStock: number;
  expiryDate?: string;
  lastMovementAt: string;
  daysWithoutSale: number;
};

export type StockMovement = {
  id: string;
  productId?: string;
  warehouseId: string;
  productName: string;
  sku: string;
  movementType:
    | "quick_stock_in"
    | "stock_in"
    | "adjustment"
    | "count"
    | "transfer_in"
    | "transfer_out"
    | "expired";
  quantity: number;
  enteredQuantity?: number;
  unitName?: string;
  stockInNo?: string;
  supplierName?: string;
  paymentStatus?: "paid" | "credit";
  invoiceNo?: string;
  lotNumber?: string;
  expiryDate?: string;
  unitCostLak?: number;
  totalCostLak?: number;
  beforeQty: number;
  afterQty: number;
  note: string;
  createdBy: string;
  createdAt: string;
};
