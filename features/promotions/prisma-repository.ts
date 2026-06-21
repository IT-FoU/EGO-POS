import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { getPrismaCategories, getPrismaProducts } from "@/features/products/prisma-repository";
import { getPrismaCustomersSnapshot } from "@/features/customers/prisma-repository";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
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
  const [promotions, products, categories, customers] = await Promise.all([
    db.promotion.findMany({
      include: {
        categories: true,
        membershipLevels: { include: { membershipLevel: true } },
        products: true,
      },
      orderBy: [{ priority: "desc" }, { startDate: "desc" }],
      where: { companyId: scope.companyId },
    }),
    getPrismaProducts(scope),
    getPrismaCategories(scope),
    getPrismaCustomersSnapshot(scope),
  ]);

  return {
    categories,
    membershipLevels: customers.levels,
    products,
    promotions: promotions.map(mapPrismaPromotion),
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

  return promotion ? mapPrismaPromotion(promotion) : undefined;
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

export async function createPrismaPromotion(input: PromotionCreateInput, tenant: TenantContext) {
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
        endDate: new Date(data.endDate),
        getQuantity: data.getQuantity,
        membershipLevels: { create: (data.membershipLevelIds ?? []).map((membershipLevelId) => ({ membershipLevelId })) },
        priority: numberValue(data.priority),
        products: { create: (data.applicableProductIds ?? []).map((productId) => ({ productId })) },
        promotionCode: optionalString(data.promotionCode),
        promotionName: stringValue(data.promotionName),
        promotionType: data.promotionType ?? "percentage",
        startDate: new Date(data.startDate),
        status: data.status ?? "active",
      },
    }),
  });
}

export async function updatePrismaPromotion(promotionId: string, input: PromotionUpdateInput, tenant: TenantContext) {
  const data = parsePromotionUpdateInput(input);
  return withTenantTransaction({
    action: "update",
    module: "promotions",
    newData: { promotionId, ...data },
    tenant,
    write: async (tx) => {
      const existing = await tx.promotion.findFirstOrThrow({ where: { companyId: tenant.companyId, id: promotionId } });
      return tx.promotion.update({
        data: {
          ...data,
          endDate: data.endDate ? new Date(data.endDate) : data.endDate,
          startDate: data.startDate ? new Date(data.startDate) : data.startDate,
        },
        where: { id: existing.id },
      });
    },
  });
}

export async function archivePrismaPromotion(promotionId: string, tenant: TenantContext) {
  return updatePrismaPromotion(promotionId, { status: "inactive", isActive: false }, tenant);
}
