import { CategoriesClient } from "@/features/products/components/categories-client";
import { getCategories } from "@/features/products/product-service";

export default async function CategoriesPage() {
  const categories = await getCategories();

  return <CategoriesClient initialCategories={categories} />;
}
