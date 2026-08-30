import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import {
  APPROVAL_RULE_KEYS,
  LEGACY_PERMISSION_ENTRIES,
  MATRIX_PERMISSION_ENTRIES,
  PERMISSION_ACTION_LABELS,
  PERMISSION_MODULE_LABELS,
  ROLE_TEMPLATE_LABELS,
  buildDefaultMatrix,
  matrixPermissionKey,
  type RoleTemplateLabel,
} from "../features/access-control/permission-catalog";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const SECRETS_PATH = join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json");
const DASHBOARD_VIEW_PERMISSION_KEY = "dashboard.view";

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.IGO_DEMO_MODE = "false";

function assertTarget() {
  loadProjectEnvFiles();
  const url = resolveScriptDatabaseUrl("production-migration");
  if (!url.includes(TARGET_REF) || url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing seed: DATABASE_URL is not the promoted Production project");
  }
}

function readOwnerPassword() {
  const fromEnv = process.env.PRODUCTION_OWNER_PASSWORD?.trim() ?? "";
  if (fromEnv.length >= 8) return fromEnv;
  if (!existsSync(SECRETS_PATH)) throw new Error("Production owner password missing");
  const stored = JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as { goboxPassword?: string };
  const password = stored.goboxPassword?.trim() ?? "";
  if (password.length < 8) throw new Error("Production owner password missing");
  return password;
}

async function ensureAccessControlCatalog(dbClient: PrismaClient) {
  for (const entry of MATRIX_PERMISSION_ENTRIES) {
    await dbClient.permission.upsert({
      create: { key: entry.key, module: entry.module, name: entry.name },
      update: { module: entry.module, name: entry.name },
      where: { key: entry.key },
    });
  }
  for (const [key, name, module] of LEGACY_PERMISSION_ENTRIES) {
    await dbClient.permission.upsert({
      create: { key, module, name },
      update: { module, name },
      where: { key },
    });
  }
}

async function ensureDefaultApprovalRules(companyId: string, dbClient: any) {
  for (const ruleKey of APPROVAL_RULE_KEYS) {
    await dbClient.approvalRule.upsert({
      create: {
        approverRole: "owner",
        companyId,
        isEnabled: true,
        ruleKey,
        thresholdLak: ruleKey === "refund" || ruleKey === "purchasing" ? 100000 : null,
        thresholdPercent: ruleKey === "discount" ? 10 : null,
      },
      update: {},
      where: { companyId_ruleKey: { companyId, ruleKey } },
    });
  }
}

async function seedRoleTemplatePermissions(
  _companyId: string,
  roles: Partial<Record<RoleTemplateLabel, { id: string }>>,
  dbClient: any,
) {
  const permissions = await dbClient.permission.findMany();
  const permissionByKey = new Map<string, { id: string }>(
    permissions.map((permission: { id: string; key: string }) => [permission.key, permission]),
  );
  const defaultMatrix = buildDefaultMatrix();

  for (const roleLabel of ROLE_TEMPLATE_LABELS) {
    const role = roles[roleLabel];
    if (!role) continue;
    await dbClient.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (roleLabel === "Owner") {
      await dbClient.rolePermission.createMany({
        data: permissions.map((permission: { id: string }) => ({
          permissionId: permission.id,
          roleId: role.id,
        })),
        skipDuplicates: true,
      });
      continue;
    }
    const keys = PERMISSION_MODULE_LABELS.flatMap((moduleLabel) =>
      PERMISSION_ACTION_LABELS.filter((actionLabel) => defaultMatrix[roleLabel][moduleLabel][actionLabel]).map(
        (actionLabel) => matrixPermissionKey(moduleLabel, actionLabel),
      ),
    );
    const permissionIds = keys
      .map((key) => permissionByKey.get(key)?.id)
      .filter((permissionId: string | undefined): permissionId is string => Boolean(permissionId));
    if (permissionIds.length > 0) {
      await dbClient.rolePermission.createMany({
        data: permissionIds.map((permissionId: string) => ({ permissionId, roleId: role.id })),
        skipDuplicates: true,
      });
    }
  }
}

async function main() {
  console.log("SEED_START");
  assertTarget();
  const ownerPassword = readOwnerPassword();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  try {
    const plan = await prisma.plan.findFirst({
      select: { id: true },
      where: { isActive: true, planName: "Free" },
    });
    if (!plan) throw new Error("Free plan is not configured");

    const existingCompany = await prisma.company.findFirst({ where: { storeCode: "0001" } });
    const existingOwner = await prisma.user.findFirst({
      where: { OR: [{ username: "gobox" }, { email: "gobox@gobox.local" }] },
    });
    if (existingCompany) throw new Error("Store code 0001 already exists");
    if (existingOwner) throw new Error("Owner username/email already exists");

    const passwordHash = await hash(ownerPassword, 12);
    await ensureAccessControlCatalog(prisma);

    const created = await prisma.$transaction(
      async (tx) => {
        const owner = await tx.user.create({
          data: {
            email: "gobox@gobox.local",
            fullName: "GO BOX Owner",
            passwordHash,
            preferredLocale: "en",
            status: "active",
            username: "gobox",
          },
          select: { id: true, username: true },
        });

        const company = await tx.company.create({
          data: {
            baseCurrency: "LAK",
            businessTemplateKey: "mini_mart",
            defaultLocale: "en",
            name: "GO BOX Mini Mart",
            ownerUserId: owner.id,
            planId: plan.id,
            status: "active",
            storeCode: "0001",
          },
          select: { id: true, name: true, storeCode: true },
        });

        const branch = await tx.branch.create({
          data: {
            companyId: company.id,
            isMainBranch: true,
            name: "GO BOX Mini Mart",
          },
          select: { id: true },
        });

        const warehouse = await tx.warehouse.create({
          data: {
            branchId: branch.id,
            companyId: company.id,
            name: "Main Warehouse",
            type: "store",
          },
          select: { id: true },
        });

        await tx.companySetting.create({
          data: {
            baseCurrency: "LAK",
            companyId: company.id,
            currencyDisplay: "LAK",
            decimalPlaces: 0,
            loyaltyEnabled: true,
            loyaltyMinRedeemPoints: 1,
            loyaltyPointValueLak: 1000,
            loyaltySpendPerPointLak: 10000,
            profileEmail: "gobox@gobox.local",
            receiptFooter: "Thank you for shopping at GO BOX Mini Mart",
            receiptHeader: "GO BOX Mini Mart",
            receiptPrefix: "0001",
            roundingMethod: "nearest",
            showLogoOnReceipt: true,
            showTaxOnReceipt: true,
            taxInclusive: false,
            vatEnabled: false,
            vatRate: 0,
          },
        });

        const ownerRole = await tx.role.create({
          data: {
            companyId: company.id,
            description: "Full access for store owner",
            isSystem: true,
            name: "Owner",
            templateKey: "owner",
          },
        });
        const managerRole = await tx.role.create({
          data: {
            companyId: company.id,
            description: "Manager access with configurable permissions",
            isSystem: true,
            name: "Manager",
            templateKey: "manager",
          },
        });
        const cashierRole = await tx.role.create({
          data: {
            companyId: company.id,
            description: "Cashier POS access",
            isSystem: true,
            name: "Cashier",
            templateKey: "cashier",
          },
        });
        const customRole = await tx.role.create({
          data: {
            companyId: company.id,
            description: "Custom configurable role",
            isSystem: true,
            name: "Custom",
            templateKey: "custom",
          },
        });

        await tx.companyUser.create({
          data: {
            allowBackOfficeAccess: true,
            allowPosAccess: true,
            assignedTerminal: "Back Office",
            branchId: branch.id,
            companyId: company.id,
            isOwner: true,
            requirePasswordChange: false,
            status: "active",
            userId: owner.id,
          },
        });

        await tx.userRole.create({
          data: {
            companyId: company.id,
            roleId: ownerRole.id,
            userId: owner.id,
          },
        });

        await seedRoleTemplatePermissions(
          company.id,
          {
            Custom: customRole,
            Manager: managerRole,
            Owner: ownerRole,
            "Staff/Cashier": cashierRole,
          },
          tx,
          { skipCatalogEnsure: true },
        );

        const dashboardViewPermission = await tx.permission.findUnique({
          select: { id: true },
          where: { key: DASHBOARD_VIEW_PERMISSION_KEY },
        });
        if (!dashboardViewPermission) throw new Error("Dashboard view permission is not configured.");
        await tx.rolePermission.createMany({
          data: [ownerRole, managerRole].map((role) => ({
            permissionId: dashboardViewPermission.id,
            roleId: role.id,
          })),
          skipDuplicates: true,
        });

        await ensureDefaultApprovalRules(company.id, tx);

        await tx.saaSSubscription.create({
          data: {
            billingCycle: "monthly",
            companyId: company.id,
            planId: plan.id,
            startDate: new Date(),
            status: "active",
          },
        });

        return {
          branchId: branch.id,
          companyId: company.id,
          ownerUsername: owner.username,
          storeCode: company.storeCode,
          storeName: company.name,
          warehouseId: warehouse.id,
        };
      },
      { timeout: 30000 },
    );

    const product = await prisma.product.create({
      data: {
        barcode: "BETA-WATER",
        branchId: created.branchId,
        companyId: created.companyId,
        costPriceLak: 0,
        description: "Production smoke SKU — archive after smoke",
        isActive: true,
        minStock: 0,
        nameEn: "BETA WATER",
        nameLo: "BETA WATER",
        productCode: "BETA-WATER",
        sellingPriceLak: 10000,
        sku: "BETA-WATER",
        status: "active",
      },
    });

    const unit = await prisma.productUnit.create({
      data: {
        barcode: "BETA-WATER",
        conversionQty: 1,
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        isPurchaseUnit: true,
        productId: product.id,
        sellingPriceLak: 10000,
        unitName: "Bottle",
      },
    });

    await prisma.product.update({
      data: { baseUnitId: unit.id },
      where: { id: product.id },
    });

    await prisma.inventoryBalance.create({
      data: {
        companyId: created.companyId,
        productId: product.id,
        quantity: 5,
        warehouseId: created.warehouseId,
      },
    });

    const current = existsSync(SECRETS_PATH) ? JSON.parse(readFileSync(SECRETS_PATH, "utf8")) : {};
    writeFileSync(
      SECRETS_PATH,
      JSON.stringify(
        {
          ...current,
          branchId: created.branchId,
          companyId: created.companyId,
          ownerUsername: created.ownerUsername,
          productId: product.id,
          storeCode: created.storeCode,
          unitId: unit.id,
          warehouseId: created.warehouseId,
        },
        null,
        2,
      ),
    );

    console.log(
      `SEED_OK company=${created.storeName} storeCode=${created.storeCode} owner=${created.ownerUsername} product=BETA WATER stock=5`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`SEED_FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
