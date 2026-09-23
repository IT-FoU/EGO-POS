import { cookies } from "next/headers";
import { ReorderSettingsClient } from "@/features/inventory/components/reorder-settings-client";
import { getPrismaCategories, getPrismaProducts } from "@/features/products/prisma-repository";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function InventoryReorderSettingsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.productsView);

  const [products, categories] = await Promise.all([
    getPrismaProducts(tenant),
    getPrismaCategories(tenant),
  ]);

  return (
    <ReorderSettingsClient
      categories={categories.map((category: { id: string; nameEn?: string; nameLo?: string }) => ({
        id: category.id,
        name: category.nameEn || category.nameLo || category.id,
      }))}
      locale={locale}
      products={products
        .filter((product: { status: string }) => product.status === "active")
        .map(
          (product: {
            barcode?: string | null;
            categoryId?: string | null;
            categoryName?: string;
            id: string;
            minStock?: number;
            nameEn?: string;
            nameLo?: string;
            reorderQtyMode?: string;
            targetStock?: number;
          }) => ({
            barcode: product.barcode ?? null,
            categoryId: product.categoryId ?? null,
            categoryName: product.categoryName || "—",
            id: product.id,
            minStock: product.minStock ?? 0,
            name: product.nameEn || product.nameLo || product.id,
            reorderQtyMode: product.reorderQtyMode === "MANUAL" ? ("MANUAL" as const) : ("AUTO" as const),
            targetStock: product.targetStock ?? 0,
          }),
        )}
    />
  );
}
