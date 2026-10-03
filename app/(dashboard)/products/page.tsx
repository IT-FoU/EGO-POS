import { allowsFine, FINE } from "@/features/access-control/fine-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { ProductListClient } from "@/features/products/components/product-list-client";
import { ProductsPageHeader } from "@/features/products/components/products-page-header";
import { getBrands, getCategories, getProductListPage } from "@/features/products/product-service";
import { getSuppliers } from "@/features/suppliers/supplier-service";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export default async function ProductsPage() {
  const session = await requireSession();
  const keys = await getUserPermissionKeys(tenantFromSession(session));
  const access = {
    archive: allowsFine(keys, "products.delete"),
    create: allowsFine(keys, "products.create"),
    printBarcode: allowsFine(keys, "products.print"),
    viewCost: allowsFine(keys, FINE.productsViewCost),
  };
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
        access={access}
        brands={brands}
        categories={categories}
        listPage={listPage}
        products={listPage.products}
        suppliers={suppliers}
      />
    </div>
  );
}
