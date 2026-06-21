import { ProductForm } from "@/features/products/components/product-form";
import {
  getCategories,
  getMockProductImages,
} from "@/features/products/product-service";

export default async function CreateProductPage() {
  const [categories, images] = await Promise.all([
    getCategories(),
    getMockProductImages(),
  ]);

  return <ProductForm mode="create" categories={categories} images={images} />;
}
