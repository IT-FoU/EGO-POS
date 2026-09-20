import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProductForm } from "@/features/products/components/product-form";
import {
  getBrands,
  getCategories,
  getMockProductImages,
  getProductById,
  getProductStockSnapshot,
  getUnitPricingDefaults,
} from "@/features/products/product-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { canUseStoreAction } from "@/features/permissions/store-ui-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { requireSession } from "@/lib/auth/session";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const session = await requireSession();
  const [brands, categories, images, product, pricingDefaults, suppliers] = await Promise.all([
    getBrands(),
    getCategories(),
    getMockProductImages(),
    getProductById(productId),
    getUnitPricingDefaults(),
    getSuppliers(),
  ]);

  if (!product) {
    notFound();
  }

  const categoriesForForm =
    product.categoryId && !categories.some((category) => category.id === product.categoryId)
      ? [
          ...categories,
          {
            id: product.categoryId,
            nameEn: product.categoryName || product.categoryId,
            nameLo: product.categoryName || product.categoryId,
            productCount: 0,
            status: "active" as const,
          },
        ]
      : categories;

  const stockSnapshot = await getProductStockSnapshot(product.id);

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <ProductForm
        mode="edit"
        product={product}
        brands={brands}
        categories={categoriesForForm}
        images={images}
        locale={locale}
        pricingDefaults={pricingDefaults}
        suppliers={suppliers}
        stockSnapshot={stockSnapshot}
        canAddStock={canUseStoreAction(session.user.roles, STORE_ACTIONS.INVENTORY_STOCK_IN)}
        canAdjustStock={canUseStoreAction(session.user.roles, STORE_ACTIONS.INVENTORY_ADJUST)}
      />
    </div>
  );
}