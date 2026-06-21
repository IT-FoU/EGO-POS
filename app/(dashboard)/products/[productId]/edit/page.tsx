import { notFound } from "next/navigation";
import { ProductForm } from "@/features/products/components/product-form";
import {
  getCategories,
  getMockProductImages,
  getProductById,
} from "@/features/products/product-service";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const [categories, images, product] = await Promise.all([
    getCategories(),
    getMockProductImages(),
    getProductById(productId),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      <ProductForm mode="edit" product={product} categories={categories} images={images} />
    </div>
  );
}
