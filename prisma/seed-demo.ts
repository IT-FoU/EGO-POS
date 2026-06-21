import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mockCustomers, mockMembershipLevels } from "../features/customers/mock-data";
import { mockInventoryItems, mockWarehouses } from "../features/inventory/mock-data";
import { mockProducts, mockCategories } from "../features/products/mock-data";
import { mockQrBanks } from "../features/pos/mock-data";
import { mockPromotions } from "../features/promotions/mock-data";
import { mockSupplierPayments, mockSupplierPurchaseOrders, mockSupplierReceivings, mockSuppliers } from "../features/suppliers/mock-data";
import {
  ensureAccessControlCatalog,
  ensureDefaultApprovalRules,
  seedRoleTemplatePermissions,
} from "../features/access-control/prisma-repository";
import { databaseUrl } from "../lib/db/database-url";

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function assertSandboxSeedTarget() {
  const url = process.env.DATABASE_URL ?? databaseUrl;

  if (process.env.SEED_ALLOW_ANY_DATABASE === "true") {
    return;
  }

  const host = url.match(/@([^/?]+)/)?.[1] ?? url;
  const isLocal = /localhost|127\.0\.0\.1/.test(host);
  const isSupabaseSandbox = /supabase\.com|pooler\.supabase/.test(host);

  if (!isLocal && !isSupabaseSandbox) {
    throw new Error(
      `Refusing sandbox seed: DATABASE_URL host "${host}" is not recognized as local or Supabase sandbox. Set SEED_ALLOW_ANY_DATABASE=true to override.`,
    );
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? databaseUrl }),
});

const companyId = "gobox-company";
const branchId = "gobox-main-branch";
const defaultWarehouseId = "gobox-default-warehouse";
const ownerId = "gobox-owner";

function resolveWarehouseId(warehouseId: string) {
  return warehouseId === "wh-main" ? defaultWarehouseId : warehouseId;
}

async function seedFoundation(db: any) {
  const superAdminPasswordHash = await hash("AdminChangeMe123!", 12);

  await db.superAdmin.upsert({
    create: {
      email: "admin@igopos.local",
      passwordHash: superAdminPasswordHash,
      status: "active",
      username: "igo-admin",
    },
    update: {
      email: "admin@igopos.local",
      passwordHash: superAdminPasswordHash,
      status: "active",
    },
    where: { username: "igo-admin" },
  });

  const plan = await db.plan.upsert({
    create: {
      customLogo: false,
      maxBranches: 1,
      maxCashiers: 3,
      maxProducts: 5000,
      maxPromotions: 10,
      maxReports: 5,
      planName: "Free",
      removeWatermark: false,
    },
    update: {},
    where: { planName: "Free" },
  });

  const owner = await db.user.upsert({
    create: {
      email: "owner@igopos.local",
      fullName: "EGO Store Owner",
      id: ownerId,
      passwordHash: await hash("AdminChangeMe123!", 12),
      preferredLocale: "lo",
      status: "active",
      username: "igo-admin",
    },
    update: {
      fullName: "EGO Store Owner",
      passwordHash: await hash("AdminChangeMe123!", 12),
      status: "active",
    },
    where: { username: "igo-admin" },
  });

  const company = await db.company.upsert({
    create: {
      baseCurrency: "LAK",
      defaultLocale: "lo",
      id: companyId,
      name: "Go BOX",
      ownerUserId: owner.id,
      planId: plan.id,
    },
    update: {
      baseCurrency: "LAK",
      defaultLocale: "lo",
      name: "Go BOX",
      ownerUserId: owner.id,
      planId: plan.id,
    },
    where: { id: companyId },
  });

  const branch = await db.branch.upsert({
    create: {
      address: "Vientiane Capital, Laos",
      companyId: company.id,
      id: branchId,
      isMainBranch: true,
      name: "Go BOX Main Branch",
      phone: "+856 21 555 300",
    },
    update: {
      address: "Vientiane Capital, Laos",
      isMainBranch: true,
      name: "Go BOX Main Branch",
      phone: "+856 21 555 300",
    },
    where: { id: branchId },
  });

  await db.companyUser.upsert({
    create: {
      allowBackOfficeAccess: true,
      allowPosAccess: true,
      assignedTerminal: "Back Office",
      branchId: branch.id,
      companyId: company.id,
      isOwner: true,
      status: "active",
      userId: owner.id,
    },
    update: {
      allowBackOfficeAccess: true,
      allowPosAccess: true,
      assignedTerminal: "Back Office",
      branchId: branch.id,
      isOwner: true,
      status: "active",
    },
    where: { companyId_userId: { companyId: company.id, userId: owner.id } },
  });

  const ownerRole = await db.role.upsert({
    create: { companyId: company.id, description: "Full access for store owner", isSystem: true, name: "Owner", templateKey: "owner" },
    update: { description: "Full access for store owner", isSystem: true, templateKey: "owner" },
    where: { companyId_name: { companyId: company.id, name: "Owner" } },
  });
  const managerRole = await db.role.upsert({
    create: { companyId: company.id, description: "Manager access with configurable permissions", isSystem: true, name: "Manager", templateKey: "manager" },
    update: { description: "Manager access with configurable permissions", isSystem: true, templateKey: "manager" },
    where: { companyId_name: { companyId: company.id, name: "Manager" } },
  });
  const cashierRole = await db.role.upsert({
    create: { companyId: company.id, description: "Cashier POS access", isSystem: true, name: "Cashier", templateKey: "cashier" },
    update: { description: "Cashier POS access", isSystem: true, templateKey: "cashier" },
    where: { companyId_name: { companyId: company.id, name: "Cashier" } },
  });
  const customRole = await db.role.upsert({
    create: { companyId: company.id, description: "Custom configurable role", isSystem: true, name: "Custom", templateKey: "custom" },
    update: { description: "Custom configurable role", isSystem: true, templateKey: "custom" },
    where: { companyId_name: { companyId: company.id, name: "Custom" } },
  });

  await db.userRole.upsert({
    create: { companyId: company.id, roleId: ownerRole.id, userId: owner.id },
    update: { companyId: company.id },
    where: { userId_roleId: { roleId: ownerRole.id, userId: owner.id } },
  });

  const staffUsers = [
    { allowBackOfficeAccess: true, assignedTerminal: "Back Office", email: "manager@igopos.local", fullName: "EGO Store Manager", password: "Manager123!", role: managerRole, username: "manager" },
    { allowBackOfficeAccess: false, assignedTerminal: "POS-01", email: "cashier@igopos.local", fullName: "EGO Store Cashier", password: "Cashier123!", role: cashierRole, username: "cashier" },
  ];

  for (const staff of staffUsers) {
    const user = await db.user.upsert({
      create: {
        email: staff.email,
        fullName: staff.fullName,
        passwordHash: await hash(staff.password, 12),
        preferredLocale: "lo",
        status: "active",
        username: staff.username,
      },
      update: {
        fullName: staff.fullName,
        passwordHash: await hash(staff.password, 12),
        status: "active",
      },
      where: { username: staff.username },
    });

    await db.companyUser.upsert({
      create: {
        allowBackOfficeAccess: staff.allowBackOfficeAccess,
        allowPosAccess: true,
        assignedTerminal: staff.assignedTerminal,
        branchId: branch.id,
        companyId: company.id,
        isOwner: false,
        status: "active",
        userId: user.id,
      },
      update: {
        allowBackOfficeAccess: staff.allowBackOfficeAccess,
        allowPosAccess: true,
        assignedTerminal: staff.assignedTerminal,
        branchId: branch.id,
        status: "active",
      },
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
    });

    await db.userRole.upsert({
      create: { companyId: company.id, roleId: staff.role.id, userId: user.id },
      update: { companyId: company.id },
      where: { userId_roleId: { roleId: staff.role.id, userId: user.id } },
    });
  }

  return { branch, company, owner, roles: { cashierRole, customRole, managerRole, ownerRole } };
}

async function ensureSandboxSchemaCompat(db: any) {
  await db.$executeRawUnsafe(`
    DO $$ BEGIN
      CREATE TYPE "StockDisplayMode" AS ENUM ('base_unit_only', 'breakdown');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await db.$executeRawUnsafe(`
    ALTER TABLE "products"
    ADD COLUMN IF NOT EXISTS "stock_display_mode" "StockDisplayMode" NOT NULL DEFAULT 'base_unit_only'
  `);
}

async function seedQrPayments(db: any) {
  const seedRows = mockQrBanks.map((bank, index) => ({
    accountId: bank.id,
    accountName: bank.accountName,
    accountNumber: bank.accountNumber,
    bankName: bank.bankName,
    isDefault: index === 0,
    sortOrder: index + 1,
  }));

  for (const row of seedRows) {
    const savedBank = await db.qrPaymentBank.upsert({
      create: {
        bankName: row.bankName,
        companyId,
        isActive: true,
        shortCode: row.bankName,
        sortOrder: row.sortOrder,
      },
      update: {
        isActive: true,
        shortCode: row.bankName,
        sortOrder: row.sortOrder,
      },
      where: { companyId_bankName: { companyId, bankName: row.bankName } },
    });

    const accountData = {
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      bankId: savedBank.id,
      branchId,
      companyId,
      displayLabel: row.accountName,
      isActive: true,
      isDefault: row.isDefault,
      printOnReceipt: true,
      showOnCustomerDisplay: true,
    };

    const existingByKey = await db.qrPaymentAccount.findFirst({
      where: {
        accountNumber: row.accountNumber,
        bankId: savedBank.id,
        branchId,
        companyId,
      },
    });

    if (existingByKey) {
      await db.qrPaymentAccount.update({
        data: accountData,
        where: { id: existingByKey.id },
      });
      continue;
    }

    const existingById = await db.qrPaymentAccount.findFirst({
      where: { companyId, id: row.accountId },
    });

    if (existingById) {
      await db.qrPaymentAccount.update({
        data: accountData,
        where: { id: existingById.id },
      });
      continue;
    }

    await db.qrPaymentAccount.create({
      data: {
        ...accountData,
        id: row.accountId,
      },
    });
  }
}

async function seedCompanySettings(db: any) {
  await db.companySetting.upsert({
    create: {
      baseCurrency: "LAK",
      companyId,
      currencyDisplay: "LAK",
      decimalPlaces: 0,
      loyaltyEnabled: true,
      loyaltyMinRedeemPoints: 1,
      loyaltyPointValueLak: 1000,
      loyaltySpendPerPointLak: 10000,
      profileAddress: "Vientiane Capital, Laos",
      profileEmail: "store@gobox.local",
      profilePhone: "+856 21 555 300",
      receiptFooter: "Thank you for shopping at Go BOX",
      receiptHeader: "GO BOX Mini Mart",
      receiptPrefix: "GB",
      roundingMethod: "nearest",
      showLogoOnReceipt: true,
      showTaxOnReceipt: true,
      taxInclusive: false,
      taxNumber: "TAX-GOBOX-001",
      vatEnabled: false,
      vatRate: 10,
    },
    update: {
      baseCurrency: "LAK",
      currencyDisplay: "LAK",
      loyaltyEnabled: true,
      loyaltyMinRedeemPoints: 1,
      loyaltyPointValueLak: 1000,
      loyaltySpendPerPointLak: 10000,
      profileAddress: "Vientiane Capital, Laos",
      profileEmail: "store@gobox.local",
      profilePhone: "+856 21 555 300",
      receiptFooter: "Thank you for shopping at Go BOX",
      receiptHeader: "GO BOX Mini Mart",
      receiptPrefix: "GB",
      showLogoOnReceipt: true,
      showTaxOnReceipt: true,
      taxInclusive: false,
      taxNumber: "TAX-GOBOX-001",
      vatEnabled: false,
      vatRate: 10,
    },
    where: { companyId },
  });
}

async function seedWarehouses(db: any) {
  await db.warehouse.upsert({
    create: {
      branchId,
      companyId,
      id: defaultWarehouseId,
      name: "Default Warehouse",
      type: "store",
    },
    update: {
      branchId,
      name: "Default Warehouse",
      type: "store",
    },
    where: { id: defaultWarehouseId },
  });

  for (const warehouse of mockWarehouses) {
    await db.warehouse.upsert({
      create: {
        branchId,
        companyId,
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
      },
      update: { branchId, name: warehouse.name, type: warehouse.type },
      where: { id: warehouse.id },
    });
  }
}

async function seedCustomers(db: any) {
  for (const level of mockMembershipLevels) {
    await db.membershipLevel.upsert({
      create: {
        companyId,
        discountPercent: level.discountPercent,
        id: level.id,
        isActive: true,
        minSpendLak: level.minSpendLak,
        name: level.name,
      },
      update: {
        discountPercent: level.discountPercent,
        isActive: true,
        minSpendLak: level.minSpendLak,
        name: level.name,
      },
      where: { id: level.id },
    });
  }

  for (const customer of mockCustomers) {
    const level = mockMembershipLevels.find((entry) => entry.name === customer.membershipLevel);
    await db.customer.upsert({
      create: {
        address: customer.address,
        birthday: customer.birthday ? new Date(customer.birthday) : undefined,
        branchId,
        companyId,
        creditLimit: customer.creditLimitLak,
        customerCode: customer.customerCode,
        email: customer.email,
        fullName: customer.fullName,
        id: customer.id,
        membershipLevelId: level?.id,
        notes: customer.notes,
        openingBalance: customer.openingBalanceLak,
        outstandingBalance: customer.outstandingBalanceLak,
        phone: customer.phone,
        pointsBalance: customer.earnedPoints - customer.redeemedPoints,
        qrMemberCode: `QR-${customer.customerCode}`,
        status: customer.status,
        totalSpent: customer.totalPurchasesLak,
      },
      update: {
        address: customer.address,
        branchId,
        creditLimit: customer.creditLimitLak,
        email: customer.email,
        fullName: customer.fullName,
        membershipLevelId: level?.id,
        notes: customer.notes,
        openingBalance: customer.openingBalanceLak,
        outstandingBalance: customer.outstandingBalanceLak,
        phone: customer.phone,
        pointsBalance: customer.earnedPoints - customer.redeemedPoints,
        qrMemberCode: `QR-${customer.customerCode}`,
        status: customer.status,
        totalSpent: customer.totalPurchasesLak,
      },
      where: { id: customer.id },
    });
  }
}

async function seedSuppliersAndCatalog(db: any) {
  for (const supplier of mockSuppliers) {
    await db.supplier.upsert({
      create: {
        address: supplier.address,
        averageDeliveryDays: supplier.averageDeliveryDays,
        branchId,
        companyId,
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson,
        creditLimit: supplier.creditLimitLak,
        creditTerms: supplier.creditTerms,
        email: supplier.email,
        id: supplier.id,
        name: supplier.companyName,
        note: supplier.notes,
        openingBalance: supplier.openingBalanceLak,
        outstandingBalance: supplier.outstandingBalanceLak,
        phone: supplier.phone,
        status: supplier.status,
        supplierCode: supplier.supplierCode,
        taxNumber: supplier.taxNumber,
      },
      update: {
        address: supplier.address,
        branchId,
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson,
        creditLimit: supplier.creditLimitLak,
        creditTerms: supplier.creditTerms,
        email: supplier.email,
        name: supplier.companyName,
        note: supplier.notes,
        openingBalance: supplier.openingBalanceLak,
        outstandingBalance: supplier.outstandingBalanceLak,
        phone: supplier.phone,
        status: supplier.status,
        supplierCode: supplier.supplierCode,
        taxNumber: supplier.taxNumber,
      },
      where: { id: supplier.id },
    });
  }

  for (const category of mockCategories) {
    await db.category.upsert({
      create: {
        branchId,
        companyId,
        id: category.id,
        nameEn: category.nameEn,
        nameLo: category.nameLo,
      },
      update: { branchId, nameEn: category.nameEn, nameLo: category.nameLo },
      where: { id: category.id },
    });
  }

  const brandNames = Array.from(new Set(mockProducts.map((product) => product.brandName).filter(Boolean)));
  for (const brandName of brandNames) {
    await db.brand.upsert({
      create: { companyId, name: brandName },
      update: {},
      where: { companyId_name: { companyId, name: brandName } },
    });
  }

  for (const product of mockProducts) {
    const brand = await db.brand.findUnique({ where: { companyId_name: { companyId, name: product.brandName } } });
    const supplier = mockSuppliers.find((entry) => entry.companyName === product.supplierName);
    await db.product.upsert({
      create: {
        barcode: product.barcode,
        branchId,
        brandId: brand?.id,
        categoryId: product.categoryId,
        companyId,
        costPriceLak: product.costPriceLak,
        description: product.description,
        id: product.id,
        minStock: product.minStock,
        nameEn: product.nameEn,
        nameLo: product.nameLo,
        productCode: product.productCode,
        sellingPriceLak: product.sellingPriceLak,
        sku: product.sku,
        status: product.status,
        supplierId: supplier?.id,
        tags: product.tags ?? [],
      },
      update: {
        barcode: product.barcode,
        branchId,
        brandId: brand?.id,
        categoryId: product.categoryId,
        costPriceLak: product.costPriceLak,
        description: product.description,
        minStock: product.minStock,
        nameEn: product.nameEn,
        nameLo: product.nameLo,
        productCode: product.productCode,
        sellingPriceLak: product.sellingPriceLak,
        sku: product.sku,
        status: product.status,
        supplierId: supplier?.id,
        tags: product.tags ?? [],
      },
      where: { id: product.id },
    });

    for (const unit of product.units) {
      await db.productUnit.upsert({
        create: {
          barcode: unit.barcode,
          conversionQty: unit.conversionQty,
          id: unit.id,
          isBaseUnit: unit.isBaseUnit,
          productId: product.id,
          sellingPriceLak: unit.sellingPriceLak,
          unitName: unit.unitName,
        },
        update: {
          barcode: unit.barcode,
          conversionQty: unit.conversionQty,
          isBaseUnit: unit.isBaseUnit,
          sellingPriceLak: unit.sellingPriceLak,
          unitName: unit.unitName,
        },
        where: { id: unit.id },
      });
    }
  }
}

async function seedInventory(db: any) {
  for (const item of mockInventoryItems) {
    const product = await db.product.findFirst({ where: { sku: item.sku } });
    if (!product) continue;

    const warehouseId = resolveWarehouseId(item.warehouseId);
    await db.inventoryBalance.upsert({
      create: {
        companyId,
        productId: product.id,
        quantity: item.quantity,
        warehouseId,
      },
      update: { quantity: item.quantity },
      where: { warehouseId_productId: { productId: product.id, warehouseId } },
    });

    const lotId = `lot-${item.sku}-${warehouseId}`;
    await db.inventoryLot.upsert({
      create: {
        companyId,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        id: lotId,
        lotNumber: `OPEN-${item.sku}`,
        productId: product.id,
        quantity: item.quantity,
        receivedAt: new Date(),
        warehouseId,
      },
      update: {
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        quantity: item.quantity,
        receivedAt: new Date(),
      },
      where: { id: lotId },
    });
  }
}

async function seedPromotions(db: any) {
  for (const promotion of mockPromotions) {
    await db.promotion.upsert({
      create: {
        categories: { create: promotion.applicableCategoryIds.map((categoryId) => ({ categoryId })) },
        companyId,
        description: promotion.description,
        discountAmountLak: promotion.discountAmountLak,
        discountPercent: promotion.discountPercent,
        endDate: new Date(promotion.endDate),
        id: promotion.id,
        membershipLevels: {
          create: promotion.membershipLevels
            .map((name) => mockMembershipLevels.find((level) => level.name === name)?.id)
            .filter(Boolean)
            .map((membershipLevelId) => ({ membershipLevelId })),
        },
        priority: promotion.priority,
        products: { create: promotion.applicableProductIds.map((productId) => ({ productId })) },
        promotionCode: promotion.promotionCode,
        promotionName: promotion.promotionName,
        promotionType: promotion.type,
        startDate: new Date(promotion.startDate),
        status: promotion.status,
        totalDiscountLak: promotion.totalDiscountLak,
        usageCount: promotion.usageCount,
      },
      update: {
        description: promotion.description,
        discountAmountLak: promotion.discountAmountLak,
        discountPercent: promotion.discountPercent,
        endDate: new Date(promotion.endDate),
        priority: promotion.priority,
        promotionCode: promotion.promotionCode,
        promotionName: promotion.promotionName,
        promotionType: promotion.type,
        startDate: new Date(promotion.startDate),
        status: promotion.status,
        totalDiscountLak: promotion.totalDiscountLak,
        usageCount: promotion.usageCount,
      },
      where: { id: promotion.id },
    });
  }
}

async function seedPurchasingHistory(db: any, actorUserId: string) {
  for (const order of mockSupplierPurchaseOrders) {
    await db.purchase.upsert({
      create: {
        balanceAmount: 0,
        companyId,
        id: order.id,
        purchaseNo: order.purchaseNo,
        status: order.status,
        subtotal: order.totalLak,
        supplierId: order.supplierId,
        totalAmount: order.totalLak,
        warehouseId: defaultWarehouseId,
      },
      update: {
        purchaseNo: order.purchaseNo,
        status: order.status,
        subtotal: order.totalLak,
        supplierId: order.supplierId,
        totalAmount: order.totalLak,
        warehouseId: defaultWarehouseId,
      },
      where: { id: order.id },
    });
  }

  for (const receiving of mockSupplierReceivings) {
    const purchase = await db.purchase.findFirst({ where: { purchaseNo: receiving.purchaseNo } });
    if (!purchase) continue;
    await db.goodsReceipt.upsert({
      create: {
        companyId,
        id: receiving.id,
        purchaseId: purchase.id,
        receiptNo: receiving.receiveNo,
        receivedBy: actorUserId,
        status: receiving.status,
        warehouseId: defaultWarehouseId,
      },
      update: {
        purchaseId: purchase.id,
        receiptNo: receiving.receiveNo,
        receivedBy: actorUserId,
        status: receiving.status,
        warehouseId: defaultWarehouseId,
      },
      where: { id: receiving.id },
    });
  }

  for (const payment of mockSupplierPayments) {
    const purchase = await db.purchase.findFirst({ where: { supplierId: payment.supplierId } });
    if (!purchase) continue;

    const existing = await db.purchasePayment.findFirst({
      where: {
        amount: payment.amountLak,
        paymentDate: new Date(payment.paymentDate),
        purchaseId: purchase.id,
      },
    });

    if (existing) {
      continue;
    }

    await db.purchasePayment.create({
      data: {
        amount: payment.amountLak,
        note: payment.note,
        paymentDate: new Date(payment.paymentDate),
        paymentMethod: payment.method === "bank" ? "transfer" : payment.method,
        purchaseId: purchase.id,
      },
    });
  }
}

async function main() {
  assertSandboxSeedTarget();

  const { seededRoles, summary } = await prisma.$transaction(
    async (tx: any) => {
      const foundation = await seedFoundation(tx);
      const { owner } = foundation;
      await ensureSandboxSchemaCompat(tx);
      await seedCompanySettings(tx);
      await seedQrPayments(tx);
      await seedWarehouses(tx);
      await seedCustomers(tx);
      await seedSuppliersAndCatalog(tx);
      await seedInventory(tx);
      await seedPromotions(tx);
      await seedPurchasingHistory(tx, owner.id);

      await tx.auditLog.create({
        data: {
          action: "seed_demo",
          companyId,
          module: "system",
          newData: {
            branchId,
            categories: mockCategories.length,
            companyId,
            customers: mockCustomers.length,
            defaultWarehouseId,
            membershipLevels: mockMembershipLevels.length,
            message: "Go BOX sandbox demo data seeded",
            pendingQrPaymentBanks: mockQrBanks,
            products: mockProducts.length,
            promotions: mockPromotions.length,
            suppliers: mockSuppliers.length,
            users: ["igo-admin", "manager", "cashier"],
          },
          userId: owner.id,
        },
      });

      return {
        seededRoles: foundation.roles,
        summary: {
          branchId,
          categories: mockCategories.length,
          companyId,
          customers: mockCustomers.length,
          defaultWarehouseId,
          membershipLevels: mockMembershipLevels.length,
          permissions: 84,
          products: mockProducts.length,
          promotions: mockPromotions.length,
          suppliers: mockSuppliers.length,
          warehouses: mockWarehouses.length + 1,
        },
      };
    },
    { timeout: 120000 },
  );

  await ensureAccessControlCatalog(prisma);
  await ensureDefaultApprovalRules(companyId, prisma);
  await seedRoleTemplatePermissions(companyId, {
    Custom: seededRoles.customRole,
    Manager: seededRoles.managerRole,
    Owner: seededRoles.ownerRole,
    "Staff/Cashier": seededRoles.cashierRole,
  }, prisma);

  console.info("Go BOX sandbox seed complete.");
  console.info(JSON.stringify(summary, null, 2));
  console.info("Merchant logins:");
  console.info("  igo-admin / AdminChangeMe123!");
  console.info("  manager / Manager123!");
  console.info("  cashier / Cashier123!");
  console.info("Super Admin: igo-admin / AdminChangeMe123!");
  console.info("Note: QR payment banks are stored in qr_payment_banks and qr_payment_accounts tables.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
