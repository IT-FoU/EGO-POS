import { cookies } from "next/headers";
import { ProductForm } from "@/features/products/components/product-form";
import {
  getBrands,
  getCategories,
  getMockProductImages,
  getUnitPricingDefaults,
} from "@/features/products/product-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export const dynamic = "force-dynamic";

export default async function CreateProductPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const barcodeParam = params?.barcode;
  const fromParam = params?.from;
  const initialBarcode = Array.isArray(barcodeParam) ? barcodeParam[0] : barcodeParam;
  const sourceFlow = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const [brands, categories, images, pricingDefaults, suppliers] = await Promise.all([
    getBrands(),
    getCategories(),
    getMockProductImages(),
    getUnitPricingDefaults(),
    getSuppliers(),
  ]);

  return (
    <ProductForm
      mode="create"
      brands={brands}
      categories={categories}
      images={images}
      initialBarcode={initialBarcode}
      locale={locale}
      pricingDefaults={pricingDefaults}
      sourceFlow={sourceFlow}
      suppliers={suppliers}
    />
  );
}
