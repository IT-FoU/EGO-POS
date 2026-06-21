import type { BusinessTemplateType } from "@/features/platform/platform-data";

export const platformEn = {
  appName: "EGO POS",
  platformEyebrow: "EGO POS Platform",
  selectTemplateError: "Select a business template before continuing.",
  setupSaveError: "Business setup could not be saved. Please try again.",
  slogan: "Simple. Smart. Fast. For Every Business.",
  templatePlaceholder: {
    dashboardLink: "Mini Mart Dashboard",
    description: "This is the placeholder POS shell for the selected {{templateName}} template. Template-specific sales screens and workflows will be added in a later phase.",
    permanent: "{{templateName}} is selected permanently for this Phase A business context.",
    reviewSetup: "Review setup",
    statusCards: [
      "Template context saved",
      "Business setup complete",
      "Custom POS coming soon",
    ],
  },
  templateModules: {
    basic_reports: "Basic Reports",
    customer_credit: "Customer Credit",
    customers: "Customers",
    delivery_notes: "Delivery Notes",
    inventory: "Inventory",
    multi_price_levels: "Multi Price Levels",
    orders: "Orders",
    payments: "Payments",
    pos: "POS",
    product_catalog: "Product Catalog",
    products: "Products",
    purchase_orders: "Purchase Orders",
    quotations: "Quotations",
    reports: "Reports",
    shipping: "Shipping",
    suppliers: "Suppliers",
  },
  templates: {
    beauty_salon: {
      description: "Beauty salon sales shell today. Services and booking workflows come later.",
      name: "Beauty Salon",
    },
    clothing: {
      description: "Clothing sales shell today. Size, color, and apparel workflows come later.",
      name: "Clothing",
    },
    coffee_shop: {
      description: "Coffee shop sales shell today. Modifiers and cafe workflows come later.",
      name: "Coffee Shop",
    },
    mini_mart: {
      description: "Retail checkout, product catalog, barcode sales, inventory, and basic reports.",
      name: "Mini Mart",
    },
    online_seller: {
      description: "Manage online orders, customers, payments, shipping status, tracking numbers, and sales across multiple channels.",
      name: "Online Seller",
    },
    pharmacy: {
      description: "Pharmacy sales shell today. Medicine-specific workflows come later.",
      name: "Pharmacy",
    },
    restaurant: {
      description: "Restaurant sales shell today. Table and kitchen workflows come later.",
      name: "Restaurant",
    },
    wholesale_store: {
      description: "Bulk sales, multi-price levels, customer credit management, delivery notes, quotations, and large inventory operations.",
      name: "Wholesale Store",
    },
  } satisfies Record<BusinessTemplateType, { description: string; name: string }>,
};
