import type { Category, MockProductImage, Product } from "@/features/products/types";
import type { ProductListPage, ProductListQuery } from "@/features/products/list-query";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import {
  getPrismaCategories,
  getPrismaProductById,
  getPrismaProductImages,
  getPrismaProductListPage,
  getPrismaProducts,
} from "@/features/products/prisma-repository";

export async function getProducts(): Promise<Product[]> {
  return getPrismaProducts(tenantFromSession(await requireSession()));
}

export async function getProductListPage(query: ProductListQuery = {}): Promise<ProductListPage> {
  return getPrismaProductListPage(tenantFromSession(await requireSession()), query);
}

export async function getProductById(productId: string): Promise<Product | null> {
  return getPrismaProductById(productId, tenantFromSession(await requireSession()));
}

export async function getCategories(): Promise<Category[]> {
  return getPrismaCategories(tenantFromSession(await requireSession()));
}

export async function getMockProductImages(): Promise<MockProductImage[]> {
  return getPrismaProductImages();
}
