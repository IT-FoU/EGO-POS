import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { getPrismaCategories, getPrismaProducts } from "@/features/products/prisma-repository";
import { getPrismaCustomersSnapshot } from "@/features/customers/prisma-repository";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { sumPromotionSalesLakByPromotionId } from "@/features/promotions/promotion-checkout";
import { mapPrismaPromotion } from "@/features/promotions/dto-mapper";
import type { Promotion, PromotionSimulation } from "@/features/promotions/types";
import {
  parsePromotionCreateInput,
  parsePromotionUpdateInput,
  type PromotionCreateInput,
  type PromotionUpdateInput,
} from "@/features/promotions/dto";

const db = prisma as any;

export async function getPrismaPromotionsSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const [promotions, products, categories, customers, salesLakByPromotionId] = await Promise.all([
    db.promotion.findMany({
      include: {
        categories: true,
        membershipLevels: { include: { membershipLevel: true } },
        products: true,
      },
      orderBy: [{ priority: "desc" }, { startDate: "desc" }, { id: "asc" }],
      where: { companyId: scope.companyId },
    }),
    getPrismaProducts(scope),
    getPrismaCategories(scope),
    getPrismaCustomersSnapshot(scope),
    sumPromotionSalesLakByPromotionId(db, scope.companyId),
  ]);

  return {
    categories,
    membershipLevels: customers.levels,
    products,
    promotions: promotions.map((promotion: Record<string, unknown>) =>
      mapPrismaPromotion(promotion, salesLakByPromotionId.get(String(promotion.id)) ?? 0),
    ),
  };
}

export async function getPrismaPromotions(tenant: TenantContext) {
  const { promotions } = await getPrismaPromotionsSnapshot(tenant);
  return promotions;
}

export async function getPrismaPromotionById(promotionId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const promotion = await db.promotion.findFirst({
    include: {
      categories: true,
      membershipLevels: { include: { membershipLevel: true } },
      products: true,
    },
    where: { companyId: scope.companyId, id: promotionId },
  });

  return promotion ? mapPrismaPromotion(promotion, (await sumPromotionSalesLakByPromotionId(db, scope.companyId)).get(promotionId) ?? 0) : undefined;
}

export async function getPrismaPromotionDetail(promotionId: string, tenant: TenantContext) {
  const [snapshot, promotion] = await Promise.all([
    getPrismaPromotionsSnapshot(tenant),
    getPrismaPromotionById(promotionId, tenant),
  ]);

  return {
    categories: snapshot.categories,
    membershipLevels: snapshot.membershipLevels,
    products: snapshot.products,
    promotion,
    simulation: promotion ? emptyPromotionSimulation(promotion) : undefined,
  };
}

function emptyPromotionSimulation(promotion: Promotion): PromotionSimulation {
  return {
    cartSubtotalLak: 0,
    discountLak: promotion.discountAmountLak ?? 0,
    finalTotalLak: 0,
    lineResults: [],
  };
}

function promotionBoundaryDate(value: string, boundary: "start" | "end") {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00`);
    if (boundary === "end") {
      date.setHours(23, 59, 59, 999);
    }
    return date;
  }
  return new Date(value);
}

export async function createPrismaPromotion(input: PromotionCreateInput, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.promotionsCreate);
  const data = parsePromotionCreateInput(input);
  return withTenantTransaction({
    action: "create",
    module: "promotions",
    newData: data,
    tenant,
    write: async (tx) => tx.promotion.create({
      data: {
        buyQuantity: data.buyQuantity,
        categories: { create: (data.applicableCategoryIds ?? []).map((categoryId) => ({ categoryId })) },
        comboPriceLak: data.comboPriceLak,
        companyId: tenant.companyId,
        description: optionalString(data.description),
        discountAmountLak: data.discountAmountLak === undefined ? undefined : numberValue(data.discountAmountLak),
        discountPercent: data.discountPercent === undefined ? undefined : numberValue(data.discountPercent),
        endDate: promotionBoundaryDate(data.endDate, "end"),
        getQuantity: data.getQuantity,
        isActive: data.status !== "inactive",
        membershipLevels: { create: (data.membershipLevelIds ?? []).map((membershipLevelId) => ({ membershipLevelId })) },
        priority: numberValue(data.priority),
        products: { create: (data.applicableProductIds ?? []).map((productId) => ({ productId })) },
        promotionCode: optionalString(data.promotionCode),
        promotionName: stringValue(data.promotionName),
        promotionType: data.promotionType ?? "percentage",
        startDate: promotionBoundaryDate(data.startDate, "start"),
        status: data.status ?? "active",
      },
    }),
  });
}

export async function updatePrismaPromotion(promotionId: string, input: PromotionUpdateInput, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.promotionsUpdate);
  const data = parsePromotionUpdateInput(input);
  const {
    applicableCategoryIds,
    applicableProductIds,
    membershipLevelIds,
    ...scalarData
  } = data;
  return withTenantTransaction({
    action: "update",
    module: "promotions",
    newData: { promotionId, ...data },
    tenant,
    write: async (tx) => {
      const existing = await tx.promotion.findFirstOrThrow({ where: { companyId: tenant.companyId, id: promotionId } });
      const updated = await tx.promotion.update({
        data: {
          ...scalarData,
          endDate: scalarData.endDate ? promotionBoundaryDate(scalarData.endDate, "end") : scalarData.endDate,
          isActive: scalarData.isActive ?? (scalarData.status ? scalarData.status === "active" : undefined),
          startDate: scalarData.startDate ? promotionBoundaryDate(scalarData.startDate, "start") : scalarData.startDate,
        },
        where: { id: existing.id },
      });

      if (applicableCategoryIds !== undefined) {
        await tx.promotionCategory.deleteMany({ where: { promotionId: existing.id } });
        if (applicableCategoryIds.length > 0) {
          await tx.promotionCategory.createMany({
            data: applicableCategoryIds.map((categoryId) => ({ categoryId, promotionId: existing.id })),
            skipDuplicates: true,
          });
        }
      }
      if (applicableProductIds !== undefined) {
        await tx.promotionProduct.deleteMany({ where: { promotionId: existing.id } });
        if (applicableProductIds.length > 0) {
          await tx.promotionProduct.createMany({
            data: applicableProductIds.map((productId) => ({ productId, promotionId: existing.id })),
            skipDuplicates: true,
          });
        }
      }
      if (membershipLevelIds !== undefined) {
        await tx.promotionMembershipLevel.deleteMany({ where: { promotionId: existing.id } });
        if (membershipLevelIds.length > 0) {
          await tx.promotionMembershipLevel.createMany({
            data: membershipLevelIds.map((membershipLevelId) => ({ membershipLevelId, promotionId: existing.id })),
            skipDuplicates: true,
          });
        }
      }

      return updated;
    },
  });
}

export async function archivePrismaPromotion(promotionId: string, tenant: TenantContext) {
  await assertPermission(tenant, WRITE_PERMISSIONS.promotionsDelete);
  return updatePrismaPromotion(promotionId, { status: "inactive", isActive: false }, tenant);
}
