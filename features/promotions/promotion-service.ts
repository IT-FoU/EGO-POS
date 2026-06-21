import type { Category, Product } from "@/features/products/types";
import type { MembershipLevel } from "@/features/customers/types";
import type { Promotion, PromotionSimulation } from "@/features/promotions/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  getPrismaPromotionById,
  getPrismaPromotionDetail,
  getPrismaPromotions,
  getPrismaPromotionsSnapshot,
} from "@/features/promotions/prisma-repository";

export async function getPromotionsSnapshot(): Promise<{
  categories: Category[];
  membershipLevels: MembershipLevel[];
  products: Product[];
  promotions: Promotion[];
}> {
  return getPrismaPromotionsSnapshot(tenantFromSession(await requireSession()));
}

export async function getPromotions(): Promise<Promotion[]> {
  return getPrismaPromotions(tenantFromSession(await requireSession()));
}

export async function getPromotionById(promotionId: string): Promise<Promotion | undefined> {
  return getPrismaPromotionById(promotionId, tenantFromSession(await requireSession()));
}

export async function getPromotionDetail(promotionId: string): Promise<{
  categories: Category[];
  membershipLevels: MembershipLevel[];
  products: Product[];
  promotion: Promotion | undefined;
  simulation: PromotionSimulation | undefined;
}> {
  return getPrismaPromotionDetail(promotionId, tenantFromSession(await requireSession()));
}
