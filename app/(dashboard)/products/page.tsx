import { t } from "@/lib/i18n/ui";
import { ProductListClient } from "@/features/products/components/product-list-client";
import { getCategories, getProducts } from "@/features/products/product-service";
export default async function ProductsPage() {
    const [categories, products] = await Promise.all([getCategories(), getProducts()]);
    return (<div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">Product Management</p>
          <h1 className="text-3xl font-semibold">Products</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.manage.barcode.sku.records.lao.and.english.n")}</p>
        </div>
      </section>

      <ProductListClient products={products} categories={categories}/>
    </div>);
}
