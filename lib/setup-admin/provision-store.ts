import { hash } from "bcryptjs";
import type { CurrencyCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ensureAccessControlCatalog,
  ensureDefaultApprovalRules,
  seedRoleTemplatePermissions,
} from "@/features/access-control/prisma-repository";
import { isProvisionableTemplateKey } from "@/lib/setup-admin/provisioning-templates";
import {
  isStoreProvisioningSchemaReady,
  STORE_PROVISIONING_MIGRATION_GUIDANCE,
} from "@/lib/setup-admin/provisioning-schema-status";

export const DUPLICATE_STORE_CODE_ERROR = "Store code is already in use.";
export const DUPLICATE_OWNER_IDENTITY_ERROR = "Owner username or email is already in use.";
export const INVALID_PROVISION_INPUT_ERROR = "Store provisioning input is invalid.";

export type ProvisionStoreInput = {
  branchName: string;
  businessTemplateKey: string;
  defaultCurrency: CurrencyCode;
  defaultLocale: string;
  ownerPhone?: string;
  profileAddress?: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerTemporaryPassword: string;
  ownerUsername: string;
  storeCode: string;
  storeName: string;
  warehouseName: string;
};

export type ProvisionStoreResult =
  | {
      ok: true;
      companyId: string;
      branchId: string;
      warehouseId: string;
      storeCode: string;
      storeName: string;
      businessTemplateKey: string;
      ownerUsername: string;
      ownerEmail: string;
      ownerTemporaryPassword: string;
      loginUrl: "/login";
    }
  | { ok: false; error: string; status: number };

const STORE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const DASHBOARD_VIEW_PERMISSION_KEY = "dashboard.view";

export function normalizeStoreCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function deriveReceiptPrefix(storeCode: string, storeName: string) {
  const fromCode = storeCode.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase();
  if (fromCode.length >= 2) {
    return fromCode;
  }

  const fromName = storeName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4);

  return fromName.length >= 2 ? fromName : "INV";
}

async function ensureStoreBackOfficeDashboardAccess(
  dbClient: any,
  roles: Array<{ id: string }>,
) {
  const dashboardViewPermission = await dbClient.permission.findUnique({
    select: { id: true },
    where: { key: DASHBOARD_VIEW_PERMISSION_KEY },
  });

  if (!dashboardViewPermission) {
    throw new Error("Dashboard view permission is not configured.");
  }

  await dbClient.rolePermission.createMany({
    data: roles.map((role) => ({
      permissionId: dashboardViewPermission.id,
      roleId: role.id,
    })),
    skipDuplicates: true,
  });
}

export function validateProvisionStoreInput(input: ProvisionStoreInput): string | null {
  const storeName = input.storeName.trim();
  const storeCode = normalizeStoreCode(input.storeCode);
  const branchName = input.branchName.trim();
  const warehouseName = input.warehouseName.trim();
  const ownerFullName = input.ownerFullName.trim();
  const ownerUsername = input.ownerUsername.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerTemporaryPassword = input.ownerTemporaryPassword;
  const defaultLocale = input.defaultLocale.trim();

  if (!storeName || !branchName || !warehouseName || !ownerFullName || !ownerUsername || !ownerEmail) {
    return INVALID_PROVISION_INPUT_ERROR;
  }

  if (!storeCode || !STORE_CODE_PATTERN.test(storeCode)) {
    return "Store code must be 3-32 characters using lowercase letters, numbers, and hyphens.";
  }

  if (!isProvisionableTemplateKey(input.businessTemplateKey)) {
    return "Selected business template is not available for provisioning yet.";
  }

  if (!["en", "lo", "th"].includes(defaultLocale)) {
    return "Default language must be English or Lao.";
  }

  if (!["LAK", "THB", "USD"].includes(input.defaultCurrency)) {
    return "Default currency must be LAK, THB, or USD.";
  }

  if (ownerTemporaryPassword.trim().length < 8) {
    return "Owner temporary password must be at least 8 characters.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return "Owner email must be valid.";
  }

  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(ownerUsername)) {
    return "Owner username must be 3-32 characters.";
  }

  return null;
}

export async function provisionStore(input: ProvisionStoreInput): Promise<ProvisionStoreResult> {
  const validationError = validateProvisionStoreInput(input);
  if (validationError) {
    return { error: validationError, ok: false, status: 400 };
  }

  const schemaReady = await isStoreProvisioningSchemaReady();
  if (!schemaReady) {
    return { error: STORE_PROVISIONING_MIGRATION_GUIDANCE, ok: false, status: 503 };
  }

  const storeName = input.storeName.trim();
  const storeCode = normalizeStoreCode(input.storeCode);
  const branchName = input.branchName.trim();
  const warehouseName = input.warehouseName.trim();
  const ownerFullName = input.ownerFullName.trim();
  const ownerUsername = input.ownerUsername.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  const ownerPhone = input.ownerPhone?.trim() ?? null;
  const profileAddress = input.profileAddress?.trim() ?? null;
  const ownerTemporaryPassword = input.ownerTemporaryPassword.trim();
  const defaultLocale = input.defaultLocale.trim() === "lo" ? "lo" : "en";
  const businessTemplateKey = input.businessTemplateKey;
  const defaultCurrency = input.defaultCurrency;
  const receiptPrefix = deriveReceiptPrefix(storeCode, storeName);

  try {
    const [existingStoreCode, existingOwner] = await Promise.all([
      prisma.company.findFirst({ select: { id: true }, where: { storeCode } }),
      prisma.user.findFirst({
        select: { id: true },
        where: { OR: [{ username: ownerUsername }, { email: ownerEmail }] },
      }),
    ]);

    if (existingStoreCode) {
      return { error: DUPLICATE_STORE_CODE_ERROR, ok: false, status: 409 };
    }

    if (existingOwner) {
      return { error: DUPLICATE_OWNER_IDENTITY_ERROR, ok: false, status: 409 };
    }

    const plan = await prisma.plan.findFirst({
      select: { id: true },
      where: { isActive: true, planName: "Free" },
    });

    if (!plan) {
      return { error: "Free plan is not configured. Run database seed before provisioning stores.", ok: false, status: 503 };
    }

    const passwordHash = await hash(ownerTemporaryPassword, 12);

    await ensureAccessControlCatalog();

    const created = await prisma.$transaction(
      async (tx) => {
      const owner = await tx.user.create({
        data: {
          email: ownerEmail,
          fullName: ownerFullName,
          passwordHash,
          phone: ownerPhone,
          preferredLocale: defaultLocale,
          status: "active",
          username: ownerUsername,
        },
        select: { email: true, id: true, username: true },
      });

      const company = await tx.company.create({
        data: {
          baseCurrency: defaultCurrency,
          businessTemplateKey,
          defaultLocale,
          name: storeName,
          ownerUserId: owner.id,
          planId: plan.id,
          status: "active",
          storeCode,
        },
        select: { businessTemplateKey: true, id: true, name: true, storeCode: true },
      });

      const branch = await tx.branch.create({
        data: {
          address: profileAddress,
          companyId: company.id,
          isMainBranch: true,
          name: branchName,
          phone: ownerPhone,
        },
        select: { id: true },
      });

      const warehouse = await tx.warehouse.create({
        data: {
          branchId: branch.id,
          companyId: company.id,
          name: warehouseName,
          type: "store",
        },
        select: { id: true },
      });

      await tx.companySetting.create({
        data: {
          baseCurrency: defaultCurrency,
          companyId: company.id,
          currencyDisplay: defaultCurrency,
          decimalPlaces: defaultCurrency === "LAK" ? 0 : 2,
          loyaltyEnabled: true,
          loyaltyMinRedeemPoints: 1,
          loyaltyPointValueLak: 1000,
          loyaltySpendPerPointLak: 10000,
          profileAddress,
          profileEmail: ownerEmail,
          profilePhone: ownerPhone,
          receiptFooter: `Thank you for shopping at ${storeName}`,
          receiptHeader: storeName,
          receiptPrefix,
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
          requirePasswordChange: true,
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
      await ensureStoreBackOfficeDashboardAccess(tx, [ownerRole, managerRole]);
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
        businessTemplateKey: company.businessTemplateKey,
        companyId: company.id,
        ownerEmail: owner.email ?? ownerEmail,
        ownerUsername: owner.username,
        storeCode: company.storeCode,
        storeName: company.name,
        warehouseId: warehouse.id,
      };
    },
    { timeout: 30000 },
    );

    return {
      ...created,
      loginUrl: "/login",
      ok: true,
      ownerTemporaryPassword,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Store provisioning failed.";
    if (message.includes("Unique constraint") || message.includes("unique")) {
      if (message.toLowerCase().includes("store_code")) {
        return { error: DUPLICATE_STORE_CODE_ERROR, ok: false, status: 409 };
      }
      if (message.toLowerCase().includes("username") || message.toLowerCase().includes("email")) {
        return { error: DUPLICATE_OWNER_IDENTITY_ERROR, ok: false, status: 409 };
      }
    }

    return { error: "Store provisioning failed. Please try again.", ok: false, status: 500 };
  }
}
