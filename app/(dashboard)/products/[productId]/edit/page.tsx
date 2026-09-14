import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ProductForm } from "@/features/products/components/product-form";
import {
  getBrands,
  getCategories,
  getMockProductImages,
  getProductById,
  getUnitPricingDefaults,
} from "@/features/products/product-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
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

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <ProductForm
        mode="edit"
        product={product}
        brands={brands}
        categories={categories}
        images={images}
        locale={locale}
        pricingDefaults={pricingDefaults}
        suppliers={suppliers}
      />
    </div>
  );
}
