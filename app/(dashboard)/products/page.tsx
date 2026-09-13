import { ProductListClient } from "@/features/products/components/product-list-client";
import { ProductsPageHeader } from "@/features/products/components/products-page-header";
import { getCategories, getProductListPage } from "@/features/products/product-service";

export default async function ProductsPage() {
  const [categories, listPage] = await Promise.all([getCategories(), getProductListPage({ page: 1, pageSize: 100, status: "active" })]);
  return (
    <div className="flex flex-col gap-6">
      <ProductsPageHeader />
      <ProductListClient categories={categories} listPage={listPage} products={listPage.products} />
    </div>
  );
}
