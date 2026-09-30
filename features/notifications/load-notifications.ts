import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import {
  availableStock,
  classifyStockNotification,
  membershipExpiringDays,
  nearExpiryDays,
  promotionWindowDays,
  type NotificationItem,
} from "@/features/notifications/notification-types";

const db = prisma as any;
const MAX_ITEMS_PER_CATEGORY = 20;

function amount(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function membershipPlanIsTimeBased(subscriptionType: unknown) {
  return /month|year|day|week|time/i.test(String(subscriptionType ?? ""));
}

export async function loadNotifications(tenant: TenantContext, now = new Date()): Promise<NotificationItem[]> {
  const scope = await resolveTenantScope(tenant);
  const productWhere = {
    companyId: tenant.companyId,
    isActive: true,
    status: "active",
    ...(scope.isOwner ? {} : { branchId: scope.branchId }),
  };

  const [products, balances, reservations, lots, memberships, promotions] = await Promise.all([
    db.product.findMany({
      select: { id: true, minStock: true, nameEn: true, nameLo: true },
      where: productWhere,
      orderBy: { nameEn: "asc" },
    }),
    db.inventoryBalance.findMany({
      select: { productId: true, quantity: true, warehouseId: true },
      where: { companyId: tenant.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
    db.stockReservation.findMany({
      select: { baseQuantity: true, productId: true, warehouseId: true },
      where: {
        companyId: tenant.companyId,
        status: "ACTIVE",
        warehouseId: { in: scope.warehouseIds },
      },
    }),
    db.inventoryLot.findMany({
      select: {
        expiryDate: true,
        id: true,
        product: { select: { id: true, nameEn: true, nameLo: true, isActive: true, status: true } },
        quantity: true,
      },
      where: {
        companyId: tenant.companyId,
        expiryDate: { not: null },
        quantity: { gt: 0 },
        warehouseId: { in: scope.warehouseIds },
      },
      orderBy: { expiryDate: "asc" },
      take: MAX_ITEMS_PER_CATEGORY * 2,
    }),
    db.customerSubscription.findMany({
      select: {
        customer: { select: { companyId: true, fullName: true, id: true, status: true } },
        endDate: true,
        id: true,
        plan: { select: { name: true, subscriptionType: true } },
        status: true,
      },
      where: {
        customer: { companyId: tenant.companyId, status: "active" },
        status: "active",
      },
      orderBy: { endDate: "asc" },
      take: MAX_ITEMS_PER_CATEGORY * 2,
    }),
    db.promotion.findMany({
      select: {
        endDate: true,
        id: true,
        isActive: true,
        promotionName: true,
        startDate: true,
        status: true,
      },
      where: {
        companyId: tenant.companyId,
        status: { in: ["active", "scheduled"] },
        OR: [
          { startDate: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 7 * 86_400_000) } },
          { endDate: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } },
        ],
      },
      orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
      take: MAX_ITEMS_PER_CATEGORY * 2,
    }),
  ]);

  const balanceByProduct = new Map<string, { onHand: number; reserved: number }>();
  for (const row of balances as Array<{ productId: string; quantity: unknown }>) {
    const current = balanceByProduct.get(row.productId) ?? { onHand: 0, reserved: 0 };
    current.onHand += amount(row.quantity);
    balanceByProduct.set(row.productId, current);
  }
  for (const row of reservations as Array<{ baseQuantity: unknown; productId: string }>) {
    const current = balanceByProduct.get(row.productId) ?? { onHand: 0, reserved: 0 };
    current.reserved += amount(row.baseQuantity);
    balanceByProduct.set(row.productId, current);
  }

  const stockItems: NotificationItem[] = [];
  for (const product of products as Array<Record<string, any>>) {
    const stock = balanceByProduct.get(product.id) ?? { onHand: 0, reserved: 0 };
    const classification = classifyStockNotification(
      availableStock(stock.onHand, stock.reserved),
      amount(product.minStock),
    );
    if (!classification) continue;
    stockItems.push({
      category: classification,
      entityName: product.nameEn || product.nameLo || product.id,
      href: "/inventory/reorder",
      id: `${classification}:${product.id}`,
    });
  }

  const nearExpiryItems = (lots as Array<Record<string, any>>)
    .filter((lot) => lot.product?.isActive && lot.product?.status === "active" && nearExpiryDays(lot.expiryDate, now) !== null)
    .slice(0, MAX_ITEMS_PER_CATEGORY)
    .map((lot) => ({
      category: "near_expiry" as const,
      daysRemaining: nearExpiryDays(lot.expiryDate, now) ?? undefined,
      entityName: lot.product.nameEn || lot.product.nameLo || lot.product.id,
      href: "/inventory",
      id: `near-expiry:${lot.id}`,
    }));

  const membershipItems = (memberships as Array<Record<string, any>>)
    .filter(
      (subscription) =>
        subscription.customer?.companyId === tenant.companyId &&
        subscription.customer?.status === "active" &&
        membershipPlanIsTimeBased(subscription.plan?.subscriptionType) &&
        membershipExpiringDays(subscription.endDate, now) !== null,
    )
    .slice(0, MAX_ITEMS_PER_CATEGORY)
    .map((subscription) => ({
      category: "membership_expiring" as const,
      daysRemaining: membershipExpiringDays(subscription.endDate, now) ?? undefined,
      entityName: subscription.customer.fullName,
      href: "/membership-levels",
      id: `membership-expiring:${subscription.id}`,
    }));

  const promotionItems: NotificationItem[] = [];
  for (const promotion of promotions as Array<Record<string, any>>) {
    if (!promotion.isActive) continue;
    const startsIn = promotionWindowDays(promotion.startDate, now);
    const endsIn = promotionWindowDays(promotion.endDate, now);
    if (startsIn !== null && new Date(promotion.startDate).getTime() >= now.getTime()) {
      promotionItems.push({
        category: "promotion_starting",
        daysRemaining: startsIn,
        entityName: promotion.promotionName,
        href: "/promotions",
        id: `promotion-starting:${promotion.id}`,
      });
    } else if (endsIn !== null) {
      promotionItems.push({
        category: "promotion_ending",
        daysRemaining: endsIn,
        entityName: promotion.promotionName,
        href: "/promotions",
        id: `promotion-ending:${promotion.id}`,
      });
    }
  }

  return [...stockItems, ...nearExpiryItems, ...membershipItems, ...promotionItems].slice(0, 100);
}
