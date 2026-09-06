import { cookies } from "next/headers";
import { ProductListClient } from "@/features/products/components/product-list-client";
import { getCategories, getProductListPage } from "@/features/products/product-service";
import { getProductsCopy } from "@/lib/i18n/products-copy";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function ProductsPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const copy = getProductsCopy(locale);
  const [categories, listPage] = await Promise.all([getCategories(), getProductListPage({ page: 1, pageSize: 100 })]);
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-primary">{copy.products}</p>
          <h1 className="text-3xl font-semibold">{copy.products}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.productsSubtitle}</p>
        </div>
      </section>

      <ProductListClient categories={categories} listPage={listPage} locale={locale} products={listPage.products} />
    </div>
  );
}
