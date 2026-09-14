import { ProductListClient } from "@/features/products/components/product-list-client";
import { ProductsPageHeader } from "@/features/products/components/products-page-header";
import { getBrands, getCategories, getProductListPage } from "@/features/products/product-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";

export default async function ProductsPage() {
  const [brands, categories, listPage, suppliers] = await Promise.all([
    getBrands(),
    getCategories(),
    getProductListPage({ page: 1, pageSize: 100, status: "active" }),
    getSuppliers(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <ProductsPageHeader />
      <ProductListClient
        brands={brands}
        categories={categories}
        listPage={listPage}
        products={listPage.products}
        suppliers={suppliers}
      />
    </div>
  );
}
