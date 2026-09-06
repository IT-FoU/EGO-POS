import { cookies } from "next/headers";
import { CategoriesClient } from "@/features/products/components/categories-client";
import { getCategories } from "@/features/products/product-service";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export default async function CategoriesPage() {
  const cookieStore = await cookies();
  const locale = getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const categories = await getCategories();

  return <CategoriesClient initialCategories={categories} locale={locale} />;
}
