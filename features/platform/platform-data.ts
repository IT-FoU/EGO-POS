export type BusinessTemplateType =
  | "mini_mart"
  | "restaurant"
  | "pharmacy"
  | "coffee_shop"
  | "beauty_salon"
  | "clothing"
  | "wholesale_store"
  | "online_seller";

export type BusinessTemplateIcon =
  | "store"
  | "utensils"
  | "pill"
  | "coffee"
  | "sparkles"
  | "shirt"
  | "warehouse"
  | "shopping_bag";

export type BusinessTemplate = {
  enabledModuleKeys: string[];
  icon: BusinessTemplateIcon;
  type: BusinessTemplateType;
};

export const businessTemplates: BusinessTemplate[] = [
  {
    enabledModuleKeys: ["pos", "products", "inventory", "customers", "basic_reports"],
    icon: "store",
    type: "mini_mart",
  },
  {
    enabledModuleKeys: ["pos", "products", "customers", "payments", "reports"],
    icon: "utensils",
    type: "restaurant",
  },
  {
    enabledModuleKeys: ["pos", "inventory", "customers", "suppliers", "reports"],
    icon: "pill",
    type: "pharmacy",
  },
  {
    enabledModuleKeys: ["pos", "products", "customers", "payments", "reports"],
    icon: "coffee",
    type: "coffee_shop",
  },
  {
    enabledModuleKeys: ["pos", "customers", "payments", "reports"],
    icon: "sparkles",
    type: "beauty_salon",
  },
  {
    enabledModuleKeys: ["pos", "inventory", "customers", "reports"],
    icon: "shirt",
    type: "clothing",
  },
  {
    enabledModuleKeys: ["pos", "inventory", "suppliers", "purchase_orders", "customer_credit", "multi_price_levels", "delivery_notes", "quotations", "reports"],
    icon: "warehouse",
    type: "wholesale_store",
  },
  {
    enabledModuleKeys: ["pos", "customers", "orders", "shipping", "payments", "reports", "product_catalog"],
    icon: "shopping_bag",
    type: "online_seller",
  },
];

export const freePlanFeatures = [
  "POS sales",
  "Products",
  "Inventory",
  "Customers",
  "Basic reports",
];

export function getBusinessTemplate(type: string | undefined) {
  return businessTemplates.find((template) => template.type === type) ?? businessTemplates[0];
}
