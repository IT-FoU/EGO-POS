import { ProductForm } from "@/features/products/components/product-form";
import {
  getCategories,
  getMockProductImages,
} from "@/features/products/product-service";

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
  const [categories, images] = await Promise.all([
    getCategories(),
    getMockProductImages(),
  ]);

  return (
    <ProductForm
      mode="create"
      categories={categories}
      images={images}
      initialBarcode={initialBarcode}
      sourceFlow={sourceFlow}
    />
  );
}
