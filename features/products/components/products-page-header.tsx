"use client";

import { getProductsCopy } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

export function ProductsPageHeader() {
  const locale = useAppLocale();
  const copy = getProductsCopy(locale);
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">{copy.products}</p>
        <h1 className="text-3xl font-semibold">{copy.products}</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{copy.productsSubtitle}</p>
      </div>
    </section>
  );
}
