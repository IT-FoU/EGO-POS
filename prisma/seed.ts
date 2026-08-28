import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getDatabaseUrl } from "../lib/db/database-url";

const PRODUCTION_REF = "ieutdqnlfiiaawctapor";

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) {
    return;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function assertNotProductionSeed() {
  const url = process.env.DATABASE_URL ?? getDatabaseUrl();
  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      "Refusing prisma/seed.ts against Production. Use: npx tsx scripts/bootstrap-super-admin.ts",
    );
  }
}

assertNotProductionSeed();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: getDatabaseUrl() }),
});

const permissions = [
  ["dashboard.view", "View dashboard", "dashboard"],
  ["company.manage", "Manage companies", "company"],
  ["branch.manage", "Manage branches", "company"],
  ["warehouse.manage", "Manage warehouses", "inventory"],
  ["users.manage", "Manage users", "users"],
  ["roles.manage", "Manage roles and permissions", "permissions"],
  ["audit.view", "View audit logs", "audit"],
  ["products.view", "View products", "product"],
  ["inventory.view", "View inventory", "inventory"],
  ["membership_levels.manage", "Manage membership levels", "customers"],
] as const;

async function main() {
  const superAdminPasswordHash = await hash("AdminChangeMe123!", 12);

  await prisma.superAdmin.upsert({
    where: { username: "igo-admin" },
    update: {
      email: "admin@igopos.local",
      passwordHash: superAdminPasswordHash,
      status: "active",
    },
    create: {
      email: "admin@igopos.local",
      passwordHash: superAdminPasswordHash,
      status: "active",
      username: "igo-admin",
    },
  });

  const setupAdminPasswordHash = await hash("SetupChangeMe123!", 12);

  await prisma.setupAdmin.upsert({
    where: { username: "ego-setup" },
    update: {
      email: "setup@igopos.local",
      passwordHash: setupAdminPasswordHash,
      status: "active",
    },
    create: {
      email: "setup@igopos.local",
      passwordHash: setupAdminPasswordHash,
      status: "active",
      username: "ego-setup",
    },
  });

  const plan = await prisma.plan.upsert({
    where: { planName: "Free" },
    update: {},
    create: {
      planName: "Free",
      maxProducts: 5000,
      maxCashiers: 3,
      maxBranches: 1,
      maxReports: 5,
      maxPromotions: 0,
      customLogo: false,
      removeWatermark: false,
    },
  });

  const owner = await prisma.user.upsert({
    where: { username: "igo-admin" },
    update: {
      passwordHash: await hash("AdminChangeMe123!", 12),
      status: "active",
    },
    create: {
      username: "igo-admin",
      email: "owner@igopos.local",
      fullName: "IGO Store Owner",
      passwordHash: await hash("AdminChangeMe123!", 12),
      preferredLocale: "lo",
      status: "active",
    },
  });

  const company = await prisma.company.upsert({
    where: { id: "gobox-company" },
    update: {
      ownerUserId: owner.id,
      planId: plan.id,
      businessTemplateKey: "mini_mart",
      storeCode: "gobox",
    },
    create: {
      id: "gobox-company",
      name: "Go BOX",
      ownerUserId: owner.id,
      planId: plan.id,
      defaultLocale: "lo",
      baseCurrency: "LAK",
      businessTemplateKey: "mini_mart",
      storeCode: "gobox",
    },
  });

  const branch = await prisma.branch.upsert({
    where: { id: "gobox-main-branch" },
    update: {},
    create: {
      id: "gobox-main-branch",
      companyId: company.id,
      name: "Go BOX Main Branch",
      isMainBranch: true,
    },
  });

  await prisma.warehouse.upsert({
    where: { id: "gobox-default-warehouse" },
    update: {},
    create: {
      id: "gobox-default-warehouse",
      companyId: company.id,
      branchId: branch.id,
      name: "Default Warehouse",
      type: "store",
    },
  });

  await prisma.companyUser.upsert({
    where: {
      companyId_userId: {
        companyId: company.id,
        userId: owner.id,
      },
    },
    update: { isOwner: true },
    create: {
      companyId: company.id,
      userId: owner.id,
      isOwner: true,
    },
  });

  const role = await prisma.role.upsert({
    where: {
      companyId_name: {
        companyId: company.id,
        name: "Owner",
      },
    },
    update: {},
    create: {
      companyId: company.id,
      name: "Owner",
      description: "Full access for store owner",
      isSystem: true,
    },
  });

  for (const [key, name, module] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: { name, module },
      create: { key, name, module },
    });

    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: role.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: role.id,
        permissionId: permission.id,
      },
    });
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: owner.id,
        roleId: role.id,
      },
    },
    update: { companyId: company.id },
    create: {
      userId: owner.id,
      roleId: role.id,
      companyId: company.id,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Manager" } },
    update: {},
    create: {
      companyId: company.id,
      description: "Manager access with configurable permissions",
      isSystem: true,
      name: "Manager",
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: "Cashier" } },
    update: {},
    create: {
      companyId: company.id,
      description: "Cashier POS access",
      isSystem: true,
      name: "Cashier",
    },
  });

  const manager = await prisma.user.upsert({
    where: { username: "manager" },
    update: {
      passwordHash: await hash("Manager123!", 12),
      status: "active",
    },
    create: {
      email: "manager@igopos.local",
      fullName: "IGO Store Manager",
      passwordHash: await hash("Manager123!", 12),
      preferredLocale: "lo",
      status: "active",
      username: "manager",
    },
  });

  const cashier = await prisma.user.upsert({
    where: { username: "cashier" },
    update: {
      passwordHash: await hash("Cashier123!", 12),
      status: "active",
    },
    create: {
      email: "cashier@igopos.local",
      fullName: "IGO Store Cashier",
      passwordHash: await hash("Cashier123!", 12),
      preferredLocale: "lo",
      status: "active",
      username: "cashier",
    },
  });

  for (const user of [manager, cashier]) {
    await prisma.companyUser.upsert({
      where: { companyId_userId: { companyId: company.id, userId: user.id } },
      update: { status: "active" },
      create: {
        companyId: company.id,
        isOwner: false,
        status: "active",
        userId: user.id,
      },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: manager.id, roleId: managerRole.id } },
    update: { companyId: company.id },
    create: {
      companyId: company.id,
      roleId: managerRole.id,
      userId: manager.id,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: cashier.id, roleId: cashierRole.id } },
    update: { companyId: company.id },
    create: {
      companyId: company.id,
      roleId: cashierRole.id,
      userId: cashier.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      companyId: company.id,
      userId: owner.id,
      module: "system",
      action: "seed",
      newData: {
        message: "Phase 0 foundation seed completed",
      },
    },
  });

  console.info("Seed complete. Merchant owner: igo-admin / AdminChangeMe123!. Manager: manager / Manager123!. Cashier: cashier / Cashier123!. Super Admin: igo-admin / AdminChangeMe123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
