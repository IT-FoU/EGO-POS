"use client";

import {
  fillProductsCopy,
  localizeProductError,
  productStatusLabel,
  tProducts,
} from "@/lib/i18n/products-copy";
import { localizedProductName } from "@/features/pos/product-display-name";
import { preferredProductDisplayUrl, preferredProductThumbUrl, productHasImageRef } from "@/lib/storage/product-image-ref";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import type { SupportedLocale } from "@/lib/constants";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Edit3, Eye, FileSpreadsheet, ChevronDown, ChevronUp, ImageIcon, MoreHorizontal, Plus, Printer, Search, SlidersHorizontal, Tags, Upload, AlertCircle, Archive, Clock, Package, Boxes, X, Trash2, } from "lucide-react";
import type { Brand, Category, Product, ProductStatus } from "@/features/products/types";
import type { ProductListPage, ProductInsightFilter } from "@/features/products/list-query";
import { ProductImagePlaceholder } from "@/features/products/components/product-image-placeholder";
import { StatusBadge } from "@/features/products/components/status-badge";
import { ProductSmallModal } from "@/features/products/components/product-small-modal";
import { formatLak } from "@/features/products/format";
import { deleteProductAction, loadProductListAction } from "@/features/products/actions";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import type { Supplier } from "@/features/suppliers/types";
import { cn } from "@/lib/utils";
const statusOptions: Array<ProductStatus | "all"> = ["all", "active", "draft", "inactive", "deleted"];
type ProductsTranslate = (key: string) => string;

function getImportFields(t: ProductsTranslate) {
    return [
        t("productName"),
        t("barcode"),
        t("sku"),
        t("internalCode"),
        t("category"),
        t("supplier"),
        t("costPrice"),
        t("sellingPrice"),
        t("stock"),
        t("unit"),
        t("expiryEnabled"),
        t("expiryDate"),
        t("status"),
        t("imageUrl"),
    ] as const;
}
type ProductsModal = "image" | null;
type ExpiryStatus = "normal" | "near_expiry" | "expired" | "no_expiry";
type InsightFilter = ProductInsightFilter;
type SummaryInsight = Exclude<InsightFilter, "missing_barcode" | "no_image">;
type ProductShellDrawerKey = "total" | "active" | "missing_images" | "missing_barcode" | "product_health" | "product_list" | "categories" | "barcode_sku" | "images" | "labels" | "tool_import" | "tool_export" | "tool_audit" | "tool_print_barcode" | "tool_print_shelf" | "tool_bulk_price";
type ProductShellStats = ReturnType<typeof getProductShellStats>;
type ProductShellDrawerContent = {
    actions: Array<{ label: string; reason: string }>;
    description: string;
    sections: Array<{ rows: Array<{ label: string; value: string }>; title: string }>;
    summaries: Array<{ label: string; value: string }>;
    title: string;
};
const pageSizeOptions = [25, 50, 100, 200] as const;

function useProductsT() {
    const locale = useAppLocale();
    const t = (key: string) => tProducts(key, locale);
    return { locale, t };
}

export function ProductListClient({ products: initialProducts, brands: initialBrands = [], categories: initialCategories, listPage: initialListPage, suppliers: initialSuppliers = [] }: {
    products: Product[];
    brands?: Brand[];
    categories: Category[];
    listPage?: ProductListPage;
    suppliers?: Supplier[];
}) {
    const router = useRouter();
    const { locale, t } = useProductsT();
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [brands, setBrands] = useState<Brand[]>(initialBrands);
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers);
    const [listPage, setListPage] = useState<ProductListPage | undefined>(initialListPage);
    const [query, setQuery] = useState("");
    const [categoryId, setCategoryId] = useState("all");
    const [brandId, setBrandId] = useState("all");
    const [supplierId, setSupplierId] = useState("all");
    const [status, setStatus] = useState<ProductStatus | "all">("active");
    const [insightFilter, setInsightFilter] = useState<InsightFilter>("all");
    const [expandedInsight, setExpandedInsight] = useState<SummaryInsight | null>(null);
    const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(
        pageSizeOptions.includes((initialListPage?.pageSize ?? 100) as (typeof pageSizeOptions)[number])
            ? ((initialListPage?.pageSize ?? 100) as (typeof pageSizeOptions)[number])
            : 100,
    );
    const [page, setPage] = useState(initialListPage?.page ?? 1);
    const [activeModal, setActiveModal] = useState<ProductsModal>(null);
    const [actionMenuOpen, setActionMenuOpen] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
    const [shellDrawer, setShellDrawer] = useState<ProductShellDrawerKey | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    useEffect(() => {
        setProducts(initialProducts);
        setListPage(initialListPage);
    }, [initialListPage, initialProducts]);
    useEffect(() => {
        setBrands(initialBrands);
    }, [initialBrands]);
    useEffect(() => {
        setCategories(initialCategories);
    }, [initialCategories]);
    useEffect(() => {
        setSuppliers(initialSuppliers);
    }, [initialSuppliers]);
    const skipServerFetch = useRef(true);
    useEffect(() => {
        if (!initialListPage) return;
        if (skipServerFetch.current) {
            skipServerFetch.current = false;
            return;
        }
        const handle = window.setTimeout(() => {
            startTransition(async () => {
                const result = await loadProductListAction({
                    brandId,
                    categoryId,
                    insight: insightFilter,
                    page,
                    pageSize,
                    search: query,
                    status,
                    supplierId,
                });
                if (!result.ok || !result.data) return;
                const next = result.data as ProductListPage;
                setListPage(next);
                setProducts(next.products);
            });
        }, 250);
        return () => window.clearTimeout(handle);
    }, [brandId, categoryId, initialListPage, insightFilter, page, pageSize, query, status, supplierId]);
    const productInsights = useMemo(() => listPage?.summary ?? getProductInsights(products), [listPage, products]);
    const insightProducts = useMemo(() => getInsightProducts(products), [products]);
    const productShellStats = useMemo(() => {
        const local = getProductShellStats(products, categories);
        if (!listPage) return local;
        return {
            ...local,
            deadStock: listPage.summary.deadStock,
            lowStock: listPage.summary.lowStock,
            missingBarcode: listPage.summary.missingBarcode,
            missingImages: listPage.summary.missingImages,
            nearExpiry: listPage.summary.nearExpiry,
            outOfStock: listPage.summary.outOfStock,
            totalProducts: listPage.summary.total,
        };
    }, [categories, listPage, products]);
    const summaryCards = useMemo(() => ([
        { color: "blue" as const, count: productInsights.total, drawerKey: "total" as ProductShellDrawerKey, emptyText: t("noProductsFound"), filter: "all" as SummaryInsight, icon: Boxes, label: t("totalProducts") },
        { color: "red" as const, count: productInsights.outOfStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("noOutOfStock"), filter: "out_of_stock" as SummaryInsight, icon: AlertCircle, label: t("outOfStock") },
        { color: "orange" as const, count: productInsights.lowStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("noLowStock"), filter: "low_stock" as SummaryInsight, icon: Package, label: t("lowStock") },
        { color: "yellow" as const, count: productInsights.nearExpiry, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("noNearExpiry"), filter: "near_expiry" as SummaryInsight, icon: Clock, label: t("nearExpiry") },
        { color: "purple" as const, count: productInsights.deadStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("noDeadStock"), filter: "dead_stock" as SummaryInsight, icon: Archive, label: t("deadStock") },
    ]), [locale, productInsights]);
    const clientFilteredProducts = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return products.filter((product) => {
            const matchesQuery = normalizedQuery.length === 0 ||
                [
                    product.barcode,
                    product.sku,
                    product.productCode,
                    product.nameLo,
                    product.nameEn,
                    product.categoryName,
                    product.brandName,
                    product.supplierName,
                    ...product.units.map((unit) => unit.barcode),
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(normalizedQuery);
            const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
            const matchesBrand = brandId === "all" || product.brandId === brandId;
            const matchesSupplier = supplierId === "all" || product.supplierId === supplierId;
            const matchesStatus = status === "all" || product.status === status;
            const matchesInsight = matchesInsightFilter(product, insightFilter);
            return matchesQuery && matchesCategory && matchesBrand && matchesSupplier && matchesStatus && matchesInsight;
        });
    }, [brandId, categoryId, insightFilter, products, query, status, supplierId]);
    const filteredProducts = listPage ? products : clientFilteredProducts;
    const totalCount = listPage?.totalCount ?? filteredProducts.length;
    const totalPages = listPage?.totalPages ?? Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const pageEnd = Math.min(safePage * pageSize, totalCount);
    const paginatedProducts = listPage ? products : filteredProducts.slice(pageStart > 0 ? pageStart - 1 : 0, pageEnd);
    const selectedProducts = useMemo(() => products.filter((product) => selectedProductIds.includes(product.id)), [products, selectedProductIds]);
    const operationProducts = selectedProducts.length > 0 ? selectedProducts : filteredProducts;
    const allVisibleSelected = paginatedProducts.length > 0 && paginatedProducts.every((product) => selectedProductIds.includes(product.id));
    function toggleProductSelection(productId: string) {
        setSelectedProductIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
    }
    function toggleAllFilteredProducts() {
        setSelectedProductIds((current) => {
            const visibleIds = paginatedProducts.map((product) => product.id);
            if (visibleIds.every((id) => current.includes(id))) {
                return current.filter((id) => !visibleIds.includes(id));
            }
            return Array.from(new Set([...current, ...visibleIds]));
        });
    }
    function applyInsightFilter(nextFilter: InsightFilter) {
        setInsightFilter(nextFilter);
        setPage(1);
    }
    function deleteProduct(productId: string) {
        startTransition(async () => {
            const result = await deleteProductAction(productId);
            if (!result.ok) {
                setMessage(localizeProductError(result.error ?? "Product delete failed."));
                return;
            }
            setProducts((current) => current.filter((product) => product.id !== productId));
            setSelectedProductIds((current) => current.filter((id) => id !== productId));
            const deleteMode = result.data && typeof result.data === "object" && "deleteMode" in result.data
                ? (result.data as { deleteMode?: string }).deleteMode
                : undefined;
            setMessage(deleteMode === "soft" ? t("productRemovedFromCatalogue") : t("productDeleted"));
            signalPosCatalogueInvalidation();
            router.refresh();
        });
    }
    function bulkDeleteSelectedProducts() {
        if (selectedProductIds.length === 0) {
            setMessage(t("selectProductsToDelete"));
            return;
        }
        startTransition(async () => {
            let softCount = 0;
            for (const productId of selectedProductIds) {
                const result = await deleteProductAction(productId);
                if (!result.ok) {
                    setMessage(localizeProductError(result.error ?? "Bulk delete failed."));
                    return;
                }
                if (result.data && typeof result.data === "object" && "deleteMode" in result.data
                    && (result.data as { deleteMode?: string }).deleteMode === "soft") {
                    softCount += 1;
                }
            }
            setProducts((current) => current.filter((product) => !selectedProductIds.includes(product.id)));
            setMessage(softCount > 0
                ? t("productRemovedFromCatalogue")
                : fillProductsCopy(t("productsDeleted"), { count: selectedProductIds.length }));
            setSelectedProductIds([]);
            signalPosCatalogueInvalidation();
            router.refresh();
        });
    }
    function updatePageSize(nextPageSize: number) {
        setPageSize(nextPageSize as (typeof pageSizeOptions)[number]);
        setPage(1);
    }
    function openImagePreview(product: Product) {
        setPreviewProduct(product);
        setActiveModal("image");
    }
    function closeModal() {
        setActiveModal(null);
        setPreviewProduct(null);
    }
    function openOperationDrawer(drawerKey: ProductShellDrawerKey) {
        setShellDrawer(drawerKey);
        setActionMenuOpen(false);
    }
    return (<div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (<SummaryCard active={insightFilter === card.filter} color={card.color} count={card.count} expanded={expandedInsight === card.filter} icon={card.icon} key={card.filter} label={card.label} onExpand={() => {
                setExpandedInsight((current) => current === card.filter ? null : card.filter);
                applyInsightFilter(card.filter);
            }} onViewAll={() => setShellDrawer(card.drawerKey)}/>))}
      </section>
      <ProductsVisualShell stats={productShellStats} onOpenDrawer={setShellDrawer}/>
      {expandedInsight ? (<InsightPanel emptyText={summaryCards.find((card) => card.filter === expandedInsight)?.emptyText ?? t("noProductsFound")} filter={expandedInsight} products={insightProducts[expandedInsight]} onSelectProduct={(product) => {
                setQuery(product.nameEn || product.nameLo);
                applyInsightFilter(expandedInsight);
            }}/>) : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3">
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(280px,1fr)_180px_180px_180px_160px]">
            <label className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
              <input className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary" placeholder={t("searchPlaceholder")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/>
            </label>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} aria-label={t("filterByCategory")}>
              <option value="all">{t("allCategories")}</option>
              {categories.map((category) => (<option value={category.id} key={category.id}>
                  {locale === "lo" ? (category.nameLo || category.nameEn) : (category.nameEn || category.nameLo)}
                </option>))}
            </select>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={brandId} onChange={(event) => { setBrandId(event.target.value); setPage(1); }} aria-label={t("filterByBrand")}>
              <option value="all">{t("allBrands")}</option>
              {brands.map((brand) => (<option value={brand.id} key={brand.id}>{brand.name}</option>))}
            </select>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPage(1); }} aria-label={t("filterBySupplier")}>
              <option value="all">{t("allSuppliers")}</option>
              {suppliers.filter((supplier) => supplier.status === "active").map((supplier) => (
                <option value={supplier.id} key={supplier.id}>{supplier.companyName || supplier.supplierCode}</option>
              ))}
            </select>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm capitalize outline-none transition focus:border-primary" value={status} onChange={(event) => { setStatus(event.target.value as ProductStatus | "all"); setPage(1); }} aria-label={t("filterByStatus")}>
              {statusOptions.map((option) => (<option value={option} key={option}>
                  {productStatusLabel(option, locale)}
                </option>))}
            </select>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={insightFilter} onChange={(event) => applyInsightFilter(event.target.value as InsightFilter)} aria-label={t("insightFilter")}>
              <option value="all">{t("allProductHealth")}</option>
              <option value="out_of_stock">{t("outOfStock")}</option>
              <option value="low_stock">{t("lowStock")}</option>
              <option value="near_expiry">{t("nearExpiry")}</option>
              <option value="dead_stock">{t("deadStock")}</option>
              <option value="missing_barcode">{t("missingBarcode")}</option>
              <option value="no_image">{t("noImage")}</option>
            </select>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button className="inline-flex h-11 items-center gap-2 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50" type="button" disabled={selectedProductIds.length === 0 || isPending} onClick={bulkDeleteSelectedProducts}>
              <Trash2 aria-hidden="true" className="size-4"/>
              {t("deleteSelected")}
            </button>
            <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" href="/products/categories">
              <SlidersHorizontal aria-hidden="true" className="size-4"/>
              {t("categories")}
            </Link>
            <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/products/new">
              <Plus aria-hidden="true" className="size-4"/>
              {t("createProduct")}
            </Link>
            <div className="relative">
              <button className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setActionMenuOpen((current) => !current)}>
                <MoreHorizontal aria-hidden="true" className="size-4"/>
                {t("moreActions")}
              </button>
              {actionMenuOpen ? (<div className="absolute right-0 z-30 mt-2 grid w-56 gap-1 rounded-lg border border-border bg-card p-2 shadow-xl">
                  <ActionMenuButton icon={Upload} label={t("importProducts")} onClick={() => openOperationDrawer("tool_import")}/>
                  <ActionMenuButton icon={Download} label={t("exportProducts")} onClick={() => openOperationDrawer("tool_export")}/>
                  <ActionMenuButton icon={Search} label={t("barcodeAudit")} onClick={() => openOperationDrawer("tool_audit")}/>
                  <ActionMenuButton icon={Printer} label={t("printBarcode")} onClick={() => openOperationDrawer("tool_print_barcode")}/>
                  <ActionMenuButton icon={Tags} label={t("printShelfLabel")} onClick={() => openOperationDrawer("tool_print_shelf")}/>
                  <ActionMenuButton icon={FileSpreadsheet} label={t("bulkPriceUpdate")} onClick={() => openOperationDrawer("tool_bulk_price")}/>
                </div>) : null}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {fillProductsCopy(t("showingRange"), { from: pageStart, to: pageEnd, total: totalCount })} {selectedProductIds.length > 0 ? fillProductsCopy(t("selectedCount"), { count: selectedProductIds.length }) : t("operationsUseFilters")}
          </span>
          {message ? <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success">{message}</span> : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="max-h-[68vh] max-w-full overflow-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3 font-semibold">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllFilteredProducts} aria-label={t("selectAllVisible")}/>
                </th>
                <th className="w-16 px-3 py-3 font-semibold">{t("image")}</th>
                <th className="px-3 py-3 font-semibold">{t("productName")}</th>
                <th className="px-3 py-3 font-semibold">{t("barcode")}</th>
                <th className="px-3 py-3 font-semibold">{t("sku")}</th>
                <th className="px-3 py-3 font-semibold">{t("category")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("stock")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("cost")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("price")}</th>
                <th className="px-3 py-3 font-semibold">{t("expiryStatus")}</th>
                <th className="px-3 py-3 font-semibold">{t("status")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
            const stock = getProductStock(product);
            const expiryStatus = getExpiryStatus(product);
            const primaryName = localizedProductName(product, locale);
            const secondaryName = (locale === "lo" ? product.nameEn : product.nameLo)?.trim() || "";
            return (<tr className="border-b border-border last:border-b-0" key={product.id}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} aria-label={fillProductsCopy(t("selectProduct"), { name: primaryName })}/>
                    </td>
                    <td className="px-3 py-3">
                      <button className="group relative size-12 overflow-hidden rounded-md text-left outline-none ring-primary transition focus:ring-2" type="button" onClick={() => openImagePreview(product)} aria-label={fillProductsCopy(t("previewImageFor"), { name: primaryName })}>
                        <ProductThumbnail product={product}/>
                        <span className="absolute inset-0 hidden place-items-center bg-black/40 text-white group-hover:grid">
                          <Eye className="size-4" aria-hidden="true"/>
                        </span>
                      </button>
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <div className="truncate font-semibold">{primaryName}</div>
                      {secondaryName && secondaryName !== primaryName ? <div className="mt-1 truncate text-xs text-muted-foreground">{secondaryName}</div> : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{product.barcode || "-"}</td>
                    <td className="px-3 py-3 font-mono text-xs">{product.sku || "-"}</td>
                    <td className="px-3 py-3">{product.categoryName || "-"}</td>
                    <td className="px-3 py-3 text-right"><StockBadge label={formatStockDisplay(product)} stock={stock} minStock={product.minStock}/></td>
                    <td className="px-3 py-3 text-right">{formatLak(product.costPriceLak)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatLak(product.sellingPriceLak)}</td>
                    <td className="px-3 py-3"><ExpiryBadge status={expiryStatus}/></td>
                    <td className="px-3 py-3"><StatusBadge locale={locale} status={product.status}/></td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" href={`/products/${product.id}/edit`}>
                          <Edit3 aria-hidden="true" className="size-4"/>
                          {t("edit")}
                        </Link>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={() => deleteProduct(product.id)}>
                          <Trash2 aria-hidden="true" className="size-4"/>
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>
        {totalCount === 0 ? (<div className="p-8 text-center text-sm text-muted-foreground">{t("noProductsMatch")}</div>) : null}
        <div className="flex flex-col gap-3 border-t border-border bg-background px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t("rowsPerPage")}</span>
            <select className="h-9 rounded-md border border-border bg-card px-2" value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value))}>
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t("previous")}</button>
            <span className="font-semibold">{fillProductsCopy(t("pageOf"), { page: safePage, pages: totalPages })}</span>
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>{t("next")}</button>
          </div>
        </div>
      </section>

      {activeModal === "image" && previewProduct ? <ImagePreviewModal product={previewProduct} onClose={closeModal}/> : null}
      <ProductShellDrawer categories={categories} drawerKey={shellDrawer} filteredProducts={filteredProducts} operationProducts={operationProducts} selectedProducts={selectedProducts} stats={productShellStats} onClose={() => setShellDrawer(null)}/>
    </div>);
}
function ActionMenuButton({ icon: Icon, label, onClick }: {
    icon: typeof Upload;
    label: string;
    onClick: () => void;
}) {
    return (<button className="flex h-10 items-center gap-2 rounded-md px-3 text-left text-sm font-semibold transition hover:bg-background" type="button" onClick={onClick}>
      <Icon className="size-4 text-primary" aria-hidden="true"/>
      {label}
    </button>);
}
function ProductsVisualShell({ onOpenDrawer, stats }: {
    onOpenDrawer: (drawerKey: ProductShellDrawerKey) => void;
    stats: ProductShellStats;
}) {
    const { t } = useProductsT();
    const topics = [
        { description: t("productListHint"), drawerKey: "product_list" as ProductShellDrawerKey, icon: Boxes, label: t("productList") },
        { description: t("categoriesHint"), drawerKey: "categories" as ProductShellDrawerKey, icon: Tags, label: t("categories") },
        { description: t("barcodeSkuReadyHint"), drawerKey: "barcode_sku" as ProductShellDrawerKey, icon: Search, label: t("barcodeSku") },
        { description: t("imageCoverageHint"), drawerKey: "images" as ProductShellDrawerKey, icon: ImageIcon, label: t("productImages") },
        { description: t("labelsHint"), drawerKey: "labels" as ProductShellDrawerKey, icon: Printer, label: t("labels") },
        { description: t("productHealthHint"), drawerKey: "product_health" as ProductShellDrawerKey, icon: AlertCircle, label: t("productHealth") },
    ];

    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{t("productsWorkspace")}</p>
            <h2 className="mt-1 text-xl font-semibold">{t("productManagementOverview")}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("workspaceSummary")}
            </p>
          </div>
          <span className="w-fit rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
            {t("readOnlyShell")}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProductShellMetric icon={Boxes} label={t("totalProducts")} value={stats.totalProducts} onClick={() => onOpenDrawer("total")}/>
          <ProductShellMetric icon={Package} label={t("activeProducts")} value={stats.activeProducts} onClick={() => onOpenDrawer("active")}/>
          <ProductShellMetric icon={ImageIcon} label={t("missingImages")} value={stats.missingImages} onClick={() => onOpenDrawer("missing_images")}/>
          <ProductShellMetric icon={Search} label={t("missingBarcode")} value={stats.missingBarcode} onClick={() => onOpenDrawer("missing_barcode")}/>
          <ProductShellMetric icon={AlertCircle} label={t("productHealth")} value={stats.healthIssueCount} onClick={() => onOpenDrawer("product_health")}/>
        </div>

        <div className="mt-4 grid gap-2">
          {topics.map((topic) => (
            <ProductShellTopic description={topic.description} icon={topic.icon} key={topic.label} label={topic.label} onClick={() => onOpenDrawer(topic.drawerKey)}/>
          ))}
        </div>

        {stats.totalProducts === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            {t("emptyProducts")}
          </div>
        ) : stats.missingImages > 0 ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {fillProductsCopy(t("missingImageCoverage"), { count: stats.missingImages })}
          </div>
        ) : null}
      </section>
    );
}

function ProductShellMetric({ icon: Icon, label, onClick, value }: { icon: typeof Boxes; label: string; onClick: () => void; value: number }) {
    const { t } = useProductsT();
    return (
      <button className="rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40" type="button" onClick={onClick}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon aria-hidden="true" className="size-4 text-primary"/>
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold">{value.toLocaleString("en-US")}</div>
        <div className="mt-1 text-xs font-semibold text-primary">{t("viewDetails")}</div>
      </button>
    );
}

function ProductShellTopic({ description, icon: Icon, label, onClick }: { description: string; icon: typeof Boxes; label: string; onClick: () => void }) {
    const { t } = useProductsT();
    return (
      <button className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40" type="button" onClick={onClick}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-primary">
            <Icon aria-hidden="true" className="size-4"/>
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{label}</div>
            <div className="truncate text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          {t("openDrawer")}
        </span>
      </button>
    );
}

function ProductShellDrawer({ categories, drawerKey, filteredProducts, onClose, operationProducts, selectedProducts, stats }: {
    categories: Category[];
    drawerKey: ProductShellDrawerKey | null;
    filteredProducts: Product[];
    onClose: () => void;
    operationProducts: Product[];
    selectedProducts: Product[];
    stats: ProductShellStats;
}) {
    const { t } = useProductsT();
    useEffect(() => {
        if (!drawerKey)
            return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                onClose();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [drawerKey, onClose]);
    if (!drawerKey)
        return null;
    if (isProductToolDrawer(drawerKey)) {
        return (
          <ProductDrawerFrame description={getProductToolDescription(drawerKey, t)} label={t("productsTool")} title={getProductToolTitle(drawerKey, t)} onClose={onClose}>
            <ProductToolDrawerBody categories={categories} drawerKey={drawerKey} filteredProducts={filteredProducts} operationProducts={operationProducts} selectedProducts={selectedProducts} stats={stats} onClose={onClose}/>
          </ProductDrawerFrame>
        );
    }
    const content = getProductShellDrawerContent(drawerKey, stats, t);
    return (
      <ProductDrawerFrame description={content.description} label={t("productDetail")} title={content.title} onClose={onClose}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {content.summaries.map((summary) => (
                <ProductShellDrawerSummary key={summary.label} label={summary.label} value={summary.value}/>
              ))}
            </div>
            <div className="mt-5 grid gap-4">
              {content.sections.map((section) => (
                <section className="rounded-lg border border-border bg-background p-4" key={section.title}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                  <div className="mt-3 grid gap-2">
                    {section.rows.map((row) => (
                      <ProductShellStatusRow key={row.label} label={row.label} value={row.value}/>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <section className="mt-5 rounded-lg border border-border bg-background p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("disabledActions")}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{t("disabledActionsHint")}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {content.actions.map((action) => (
                  <button className="flex cursor-not-allowed items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-left opacity-70" disabled key={action.label} type="button">
                    <span className="font-semibold">{action.label}</span>
                    <span className="shrink-0 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{action.reason}</span>
                  </button>
                ))}
              </div>
            </section>
            <details className="mt-5 rounded-lg border border-border bg-background p-4">
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">{t("advancedDetails")}</summary>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <ProductShellStatusRow label={t("source")} value={t("loadedProductsData")}/>
                <ProductShellStatusRow label={t("backendWrites")} value={t("notConnectedShell")}/>
                <ProductShellStatusRow label={t("rawMetadata")} value={t("hidden")}/>
              </div>
            </details>
      </ProductDrawerFrame>
    );
}

function ProductDrawerFrame({ children, description, label, onClose, title }: {
    children: React.ReactNode;
    description: string;
    label: string;
    onClose: () => void;
    title: string;
}) {
    const { t } = useProductsT();
    return (
      <div className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72">
        <section className="flex h-full w-full max-w-none flex-col overflow-x-hidden border-l border-border bg-card shadow-2xl">
          <header className="sticky top-0 z-20 border-b border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">{label}</p>
                <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              <button aria-label={t("closeDrawer")} className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:text-foreground" type="button" onClick={onClose}>
                <X className="size-5" aria-hidden="true"/>
              </button>
            </div>
          </header>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5">
            {children}
          </div>
        </section>
      </div>
    );
}

function ProductShellDrawerSummary({ label, value }: { label: string; value: string }) {
    return (
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold">{value}</div>
      </div>
    );
}

function ProductShellStatusRow({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <span className="min-w-0 text-sm text-muted-foreground">{label}</span>
        <span className="shrink-0 text-right text-sm font-semibold">{value}</span>
      </div>
    );
}

function ProductToolDrawerBody({ categories, drawerKey, filteredProducts, onClose, operationProducts, selectedProducts, stats }: {
    categories: Category[];
    drawerKey: ProductShellDrawerKey;
    filteredProducts: Product[];
    onClose: () => void;
    operationProducts: Product[];
    selectedProducts: Product[];
    stats: ProductShellStats;
}) {
    if (drawerKey === "tool_import")
        return <ImportProductsDrawer onClose={onClose}/>;
    if (drawerKey === "tool_export")
        return <ExportProductsDrawer onClose={onClose} products={operationProducts} selectedCount={selectedProducts.length} stats={stats}/>;
    if (drawerKey === "tool_audit")
        return <BarcodeAuditDrawer onClose={onClose} products={filteredProducts} stats={stats}/>;
    if (drawerKey === "tool_print_barcode")
        return <PrintBarcodeDrawer onClose={onClose} products={operationProducts}/>;
    if (drawerKey === "tool_print_shelf")
        return <PrintShelfLabelDrawer onClose={onClose} products={operationProducts}/>;
    if (drawerKey === "tool_bulk_price")
        return <BulkPricePreviewDrawer categories={categories} filteredProducts={filteredProducts} onClose={onClose} products={operationProducts} selectedProducts={selectedProducts}/>;
    return null;
}

function ImportProductsDrawer({ onClose }: { onClose: () => void }) {
    const { t } = useProductsT();
    return (
      <div className="grid gap-5">
        <ProductToolNotice text={t("importNotice")}/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("acceptedFormats")}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {["CSV", "XLSX"].map((format) => <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold" key={format}>{format}</span>)}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[t("uploadFile"), t("reviewPreview"), t("validateRows"), t("importAfterApproval")].map((step, index) => (
              <div className="rounded-md border border-border bg-card p-3 text-sm" key={step}>
                <div className="font-semibold text-primary">{fillProductsCopy(t("stepN"), { n: index + 1 })}</div>
                <div className="mt-1 text-muted-foreground">{step}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-dashed border-border bg-background p-5 text-center">
          <Upload className="mx-auto size-10 text-muted-foreground" aria-hidden="true"/>
          <div className="mt-2 font-semibold">{t("uploadAreaDisabled")}</div>
          <p className="mt-1 text-sm text-muted-foreground">{t("importDisabledHint")}</p>
        </section>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("sampleColumns")}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {getImportFields(t).slice(0, 8).map((field) => <span className="rounded-md border border-border bg-card px-3 py-2 text-sm" key={field}>{field}</span>)}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("upload"), reason: t("notConnectedYet") }, { label: t("import"), reason: t("disabled") }]}/>
      </div>
    );
}

function ExportProductsDrawer({ onClose, products, selectedCount, stats }: {
    onClose: () => void;
    products: Product[];
    selectedCount: number;
    stats: ProductShellStats;
}) {
    const { t } = useProductsT();
    const [selectedIds, setSelectedIds] = useState<string[]>(products.slice(0, 8).map((product) => product.id));
    const previewProducts = products.slice(0, 12);
    const fields = [t("productName"), t("barcode"), t("sku"), t("category"), t("sellingPrice"), t("costPrice"), t("stock"), t("status"), t("imageStatus")];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text={t("exportNotice")}/>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProductShellDrawerSummary label={t("totalProducts")} value={formatShellCount(products.length)}/>
          <ProductShellDrawerSummary label={t("selectedRows")} value={formatShellCount(selectedIds.length)}/>
          <ProductShellDrawerSummary label={t("missingBarcode")} value={formatShellCount(stats.missingBarcode)}/>
          <ProductShellDrawerSummary label={t("missingImage")} value={formatShellCount(stats.missingImages)}/>
        </div>
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("productSelectionPreview")}</h3>
            <div className="flex gap-2">
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setSelectedIds(previewProducts.map((product) => product.id))}>{t("selectAllPreview")}</button>
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setSelectedIds([])}>{t("clearSelection")}</button>
            </div>
          </div>
          <ProductPreviewTable products={previewProducts} selectedIds={selectedIds} onToggle={(productId) => setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])}/>
          <p className="mt-3 text-xs text-muted-foreground">{selectedCount > 0 ? t("exportScopeSelected") : t("exportScopeFilters")}</p>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <ProductOptionPanel title={t("fieldsSelection")} options={fields}/>
          <ProductOptionPanel title={t("exportFormat")} options={["CSV", "XLSX"]}/>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("exportCsv"), reason: t("disabled") }, { label: t("exportXlsx"), reason: t("disabled") }]}/>
      </div>
    );
}

function BarcodeAuditDrawer({ onClose, products, stats }: { onClose: () => void; products: Product[]; stats: ProductShellStats }) {
    const { t, locale } = useProductsT();
    const [filter, setFilter] = useState("all");
    const audit = getBarcodeAudit(products, locale);
    const missingSku = products.filter((product) => !product.sku);
    const issueLabels: Record<string, string> = {
        "Missing barcode": t("missingBarcode"),
        "Duplicate barcode": t("duplicateBarcode"),
        "Invalid barcode": t("invalidBarcode"),
        "Missing SKU": t("missingSku"),
    };
    const rows = [
        ...audit.missing.map((item) => ({ issue: "Missing barcode", productName: item.productName, unitName: item.unitName ?? t("product"), value: "-" })),
        ...audit.duplicates.map((item) => ({ issue: "Duplicate barcode", productName: item.productName, unitName: item.unitName ?? t("product"), value: item.barcode })),
        ...audit.invalid.map((item) => ({ issue: "Invalid barcode", productName: item.productName, unitName: item.unitName ?? t("product"), value: item.barcode ?? "-" })),
        ...missingSku.map((product) => ({ issue: "Missing SKU", productName: localizedProductName(product, locale), unitName: t("product"), value: product.barcode || "-" })),
    ].filter((row) => filter === "all" || row.issue.toLowerCase().replaceAll(" ", "_") === filter);
    return (
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProductShellDrawerSummary label={t("totalProducts")} value={formatShellCount(stats.totalProducts)}/>
          <ProductShellDrawerSummary label={t("missingBarcode")} value={formatShellCount(audit.missing.length)}/>
          <ProductShellDrawerSummary label={t("duplicateBarcode")} value={formatShellCount(audit.duplicates.length)}/>
          <ProductShellDrawerSummary label={t("invalidBarcode")} value={formatShellCount(audit.invalid.length)}/>
          <ProductShellDrawerSummary label={t("missingSku")} value={formatShellCount(missingSku.length)}/>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["all", t("all")],
            ["missing_barcode", t("missingBarcode")],
            ["duplicate_barcode", t("duplicateBarcode")],
            ["invalid_barcode", t("invalidBarcode")],
            ["missing_sku", t("missingSku")],
          ].map(([value, label]) => (
            <button className={cn("h-9 rounded-full border px-3 text-xs font-semibold", filter === value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")} key={value} type="button" onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <section className="overflow-hidden rounded-lg border border-border bg-background">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
                <tr><th className="p-3">{t("issue")}</th><th className="p-3">{t("product")}</th><th className="p-3">{t("unit")}</th><th className="p-3">{t("barcodeSku")}</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr className="border-t border-border" key={`${row.issue}-${row.productName}-${index}`}>
                    <td className="p-3 font-semibold">{issueLabels[row.issue] ?? row.issue}</td>
                    <td className="p-3">{row.productName}</td>
                    <td className="p-3">{row.unitName}</td>
                    <td className="p-3 font-mono text-xs">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">{t("noBarcodeIssues")}</div> : null}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("autoFix"), reason: t("disabled") }, { label: t("exportAudit"), reason: t("disabled") }]}/>
      </div>
    );
}

function PrintBarcodeDrawer({ onClose, products }: { onClose: () => void; products: Product[] }) {
    const { t, locale } = useProductsT();
    const [quantity, setQuantity] = useState("1");
    const [labelSize, setLabelSize] = useState("40x30mm");
    const [paper, setPaper] = useState("A4");
    const previewProduct = products[0];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text={t("printBarcodeNotice")}/>
        <PrintLayoutControls labelOptions={["40x30mm", "50x30mm", "60x40mm", "Custom"]} labelValue={labelSize} paperValue={paper} quantity={quantity} onLabelChange={setLabelSize} onPaperChange={setPaper} onQuantityChange={setQuantity}/>
        <ProductSelectionPreview products={products}/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("barcodeLabelPreview")}</h3>
          <div className="mt-4 max-w-sm rounded-md border border-border bg-card p-4 text-center">
            <div className="truncate text-sm font-semibold">{previewProduct ? localizedProductName(previewProduct, locale) : t("productName")}</div>
            <div className="mt-2 rounded bg-background p-3 font-mono text-xs tracking-[0.2em]">{previewProduct?.barcode || previewProduct?.sku || "BARCODE"}</div>
            <div className="mt-2 text-sm font-semibold">{previewProduct ? formatLak(previewProduct.sellingPriceLak) : t("price")}</div>
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("printPreview"), reason: t("disabled") }]}/>
      </div>
    );
}

function PrintShelfLabelDrawer({ onClose, products }: { onClose: () => void; products: Product[] }) {
    const { t, locale } = useProductsT();
    const [paper, setPaper] = useState("A4");
    const previewProduct = products[0];
    const toggles = [t("productName"), t("price"), t("unit"), t("barcodeOptional"), t("promoTagOptional")];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text={t("printShelfNotice")}/>
        <section className="grid gap-4 lg:grid-cols-2">
          <ProductOptionPanel title={t("shelfLabelLayout")} options={["A4", "A5", "80mm roll", "Custom"]} selected={paper} onSelect={setPaper}/>
          <ProductOptionPanel title={t("labelContent")} options={toggles}/>
        </section>
        <ProductSelectionPreview products={products}/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("shelfLabelPreview")}</h3>
          <div className="mt-4 max-w-sm rounded-md border border-border bg-card p-4">
            <div className="truncate text-lg font-semibold">{previewProduct ? localizedProductName(previewProduct, locale) : t("productName")}</div>
            <div className="mt-2 text-2xl font-black text-primary">{previewProduct ? formatLak(previewProduct.sellingPriceLak) : t("price")}</div>
            <div className="mt-2 text-xs text-muted-foreground">{previewProduct?.units[0]?.unitName ?? t("unit")} | {previewProduct?.barcode || t("barcodeOptional")}</div>
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("printPreview"), reason: t("disabled") }]}/>
      </div>
    );
}

function BulkPricePreviewDrawer({ categories, filteredProducts, onClose, products, selectedProducts }: {
    categories: Category[];
    filteredProducts: Product[];
    onClose: () => void;
    products: Product[];
    selectedProducts: Product[];
}) {
    const { locale, t } = useProductsT();
    const [target, setTarget] = useState<"all" | "category" | "selected">("all");
    const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
    const [adjustmentMode, setAdjustmentMode] = useState<"increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount">("increase_percent");
    const [adjustmentValue, setAdjustmentValue] = useState("10");
    const [roundingLak, setRoundingLak] = useState(0);
    const [fields, setFields] = useState({ costPrice: false, sellingPrice: true, studentPrice: false });
    const [previewEnabled, setPreviewEnabled] = useState(true);
    const targetProducts = target === "all"
        ? filteredProducts
        : target === "category"
            ? filteredProducts.filter((product) => product.categoryId === categoryId)
            : selectedProducts.length > 0 ? selectedProducts : products;
    const previewRows = previewEnabled ? buildBulkPricePreview(targetProducts, {
        adjustmentMode,
        adjustmentValue: parseMoney(adjustmentValue),
        fields,
        roundingLak,
    }, locale).slice(0, 20) : [];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text={t("bulkPreviewNotice")}/>
        <section className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">{t("applyTo")}<select className="field-input" value={target} onChange={(event) => setTarget(event.target.value as typeof target)}><option value="all">{t("applyToAll")}</option><option value="selected">{t("applyToSelected")}</option><option value="category">{t("applyToCategory")}</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">{t("category")}<select className="field-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={target !== "category"}>{categories.map((category) => <option key={category.id} value={category.id}>{locale === "lo" ? (category.nameLo || category.nameEn) : (category.nameEn || category.nameLo)}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">{t("adjustment")}<select className="field-input" value={adjustmentMode} onChange={(event) => setAdjustmentMode(event.target.value as typeof adjustmentMode)}><option value="increase_percent">{t("increasePercent")}</option><option value="decrease_percent">{t("decreasePercent")}</option><option value="increase_amount">{t("increaseAmount")}</option><option value="decrease_amount">{t("decreaseAmount")}</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">{t("value")}<input className="field-input" inputMode="decimal" value={formatMoneyInput(adjustmentValue)} onChange={(event) => setAdjustmentValue(event.target.value.replace(/[^\d.]/g, ""))}/></label>
          <label className="grid gap-1 text-sm font-semibold">{t("rounding")}<select className="field-input" value={roundingLak} onChange={(event) => setRoundingLak(Number(event.target.value))}><option value={0}>{t("noRounding")}</option><option value={500}>{t("round500")}</option><option value={1000}>{t("round1000")}</option></select></label>
          <div className="grid gap-2 rounded-md border border-border bg-card p-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.costPrice} onChange={(event) => setFields((current) => ({ ...current, costPrice: event.target.checked }))}/> {t("costPrice")}</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.sellingPrice} onChange={(event) => setFields((current) => ({ ...current, sellingPrice: event.target.checked }))}/> {t("sellingPrice")}</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.studentPrice} onChange={(event) => setFields((current) => ({ ...current, studentPrice: event.target.checked }))}/> {t("studentPrice")}</label>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("previewTable")}</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{fillProductsCopy(t("previewRows"), { count: previewRows.length.toLocaleString("en-US") })}</span>
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setPreviewEnabled(true)}>{t("previewChanges")}</button>
            </div>
          </div>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="sticky top-0 bg-background text-muted-foreground">
                <tr><th className="p-2">{t("product")}</th><th className="p-2 text-right">{t("oldCost")}</th><th className="p-2 text-right">{t("previewCost")}</th><th className="p-2 text-right">{t("oldSelling")}</th><th className="p-2 text-right">{t("previewSelling")}</th><th className="p-2 text-right">{t("oldStudent")}</th><th className="p-2 text-right">{t("previewStudent")}</th></tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr className="border-t border-border" key={`${row.productId}-${row.unitId}`}>
                    <td className="p-2 font-semibold">{row.productName}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.oldCost) : "-"}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.newCost) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.oldSelling) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.newSelling) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.oldStudent) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.newStudent) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">{t("noProductsAvailablePreview")}</div> : null}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: t("applyChanges"), reason: t("disabled") }]}/>
      </div>
    );
}

function ProductToolNotice({ text }: { text: string }) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
        {text}
      </div>
    );
}

function ProductToolFooter({ actions, onClose }: { actions: Array<{ label: string; reason: string }>; onClose: () => void }) {
    const { t } = useProductsT();
    return (
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("close")}</button>
        {actions.map((action) => (
          <button className="h-10 cursor-not-allowed rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground opacity-70" disabled key={action.label} type="button">
            {action.label} - {action.reason}
          </button>
        ))}
      </div>
    );
}

function ProductPreviewTable({ onToggle, products, selectedIds }: {
    onToggle: (productId: string) => void;
    products: Product[];
    selectedIds: string[];
}) {
    const { t, locale } = useProductsT();
    return (
      <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr><th className="p-2">{t("select")}</th><th className="p-2">{t("product")}</th><th className="p-2">{t("barcode")}</th><th className="p-2">{t("sku")}</th><th className="p-2">{t("status")}</th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr className="border-t border-border" key={product.id}>
                <td className="p-2"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => onToggle(product.id)} aria-label={fillProductsCopy(t("selectProductPreview"), { name: localizedProductName(product, locale) })}/></td>
                <td className="p-2 font-semibold">{localizedProductName(product, locale)}</td>
                <td className="p-2 font-mono">{product.barcode || "-"}</td>
                <td className="p-2 font-mono">{product.sku || "-"}</td>
                <td className="p-2">{productStatusLabel(product.status, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">{t("noProductsAvailablePreview")}</div> : null}
      </div>
    );
}

function ProductOptionPanel({ onSelect, options, selected, title }: {
    onSelect?: (value: string) => void;
    options: string[];
    selected?: string;
    title: string;
}) {
    const { t } = useProductsT();
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="mt-3 grid gap-2">
          {options.map((option) => (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold" key={option}>
              <span>{option === "Custom" ? t("custom") : option}</span>
              <input type="checkbox" checked={selected ? selected === option : true} readOnly={!onSelect} onChange={() => onSelect?.(option)}/>
            </label>
          ))}
        </div>
      </section>
    );
}

function PrintLayoutControls({ labelOptions, labelValue, onLabelChange, onPaperChange, onQuantityChange, paperValue, quantity }: {
    labelOptions: string[];
    labelValue: string;
    onLabelChange: (value: string) => void;
    onPaperChange: (value: string) => void;
    onQuantityChange: (value: string) => void;
    paperValue: string;
    quantity: string;
}) {
    const { t } = useProductsT();
    return (
      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{t("quantityPerProduct")}<input className="field-input" inputMode="numeric" value={quantity} onChange={(event) => onQuantityChange(event.target.value.replace(/[^\d]/g, ""))}/></label>
        <label className="grid gap-1 text-sm font-semibold">{t("labelSize")}<select className="field-input" value={labelValue} onChange={(event) => onLabelChange(event.target.value)}>{labelOptions.map((option) => <option key={option} value={option}>{option === "Custom" ? t("custom") : option}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">{t("paperLayout")}<select className="field-input" value={paperValue} onChange={(event) => onPaperChange(event.target.value)}>{["A4", "A5", "80mm roll", "Custom"].map((option) => <option key={option} value={option}>{option === "Custom" ? t("custom") : option}</option>)}</select></label>
      </section>
    );
}

function ProductSelectionPreview({ products }: { products: Product[] }) {
    const { t, locale } = useProductsT();
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t("productSelectionPreview")}</h3>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">{fillProductsCopy(t("selectedFiltered"), { count: products.length.toLocaleString("en-US") })}</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {products.slice(0, 6).map((product) => (
            <div className="rounded-md border border-border bg-card p-3 text-sm" key={product.id}>
              <div className="truncate font-semibold">{localizedProductName(product, locale)}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{product.barcode || product.sku || t("noCode")}</div>
            </div>
          ))}
        </div>
        {products.length === 0 ? <div className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t("noProductsAvailablePreview")}</div> : null}
      </section>
    );
}

function isProductToolDrawer(drawerKey: ProductShellDrawerKey) {
    return drawerKey.startsWith("tool_");
}

function getProductToolTitle(drawerKey: ProductShellDrawerKey, t: ProductsTranslate) {
    const titles: Record<string, string> = {
        tool_audit: t("barcodeSkuAudit"),
        tool_bulk_price: t("bulkPriceUpdate"),
        tool_export: t("exportProducts"),
        tool_import: t("importProducts"),
        tool_print_barcode: t("printBarcode"),
        tool_print_shelf: t("printShelfLabel"),
    };
    return titles[drawerKey] ?? t("productsTool");
}

function getProductToolDescription(drawerKey: ProductShellDrawerKey, t: ProductsTranslate) {
    const descriptions: Record<string, string> = {
        tool_audit: t("barcodeSkuAuditDesc"),
        tool_bulk_price: t("bulkPriceUpdateDesc"),
        tool_export: t("exportProductsDesc"),
        tool_import: t("importProductsDesc"),
        tool_print_barcode: t("printBarcodeDesc"),
        tool_print_shelf: t("printShelfLabelDesc"),
    };
    return descriptions[drawerKey] ?? t("productsTool");
}
function SummaryCard({ active, color, count, expanded = false, icon: Icon, label, onExpand, onViewAll, }: {
    active: boolean;
    color: "blue" | "red" | "orange" | "yellow" | "purple";
    count: number;
    expanded?: boolean;
    icon: typeof Package;
    label: string;
    onExpand: () => void;
    onViewAll: () => void;
}) {
    const { t } = useProductsT();
    const styles = {
        blue: "border-blue-500/40 text-blue-400 bg-blue-500/10",
        orange: "border-orange-500/40 text-orange-400 bg-orange-500/10",
        purple: "border-purple-500/40 text-purple-400 bg-purple-500/10",
        red: "border-red-500/40 text-red-400 bg-red-500/10",
        yellow: "border-yellow-500/40 text-yellow-300 bg-yellow-500/10",
    }[color];
    return (<article className={cn("rounded-lg border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-sm", active ? styles : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
          <div className={cn("mt-2 text-3xl font-bold", styles.split(" ")[1])}>{count.toLocaleString("en-US")}</div>
          <div className="mt-1 text-xs text-muted-foreground">{count === 1 ? t("productCountOne") : fillProductsCopy(t("productCountMany"), { count: count.toLocaleString("en-US") })}</div>
        </div>
        <div className={cn("grid size-10 place-items-center rounded-md border", styles)}>
          <Icon aria-hidden="true" className="size-5"/>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button className="text-sm font-semibold text-primary transition hover:underline" type="button" onClick={onViewAll}>{t("viewAll")}</button>
        <button className="grid size-8 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onExpand} aria-label={fillProductsCopy(t("expandCard"), { label })}>
          {expanded ? <ChevronUp aria-hidden="true" className="size-4"/> : <ChevronDown aria-hidden="true" className="size-4"/>}
        </button>
      </div>
    </article>);
}
function InsightPanel({ emptyText, filter, onSelectProduct, products, }: {
    emptyText: string;
    filter: SummaryInsight;
    onSelectProduct: (product: Product) => void;
    products: Product[];
}) {
    const { t, locale } = useProductsT();
    const title = filter === "all"
        ? t("allProducts")
        : filter === "out_of_stock"
            ? t("outOfStockProducts")
            : filter === "low_stock"
                ? t("lowStockProducts")
                : filter === "near_expiry"
                    ? t("nearExpiryProducts")
                    : t("deadStockProducts");
    return (<section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{fillProductsCopy(t("itemCount"), { count: products.length.toLocaleString("en-US") })}</span>
      </div>
      {products.length === 0 ? (<div className="mt-4 rounded-md border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">{emptyText}</div>) : (<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.slice(0, 9).map((product) => (<button className="rounded-md border border-border bg-background p-3 text-left transition hover:border-primary" key={product.id} type="button" onClick={() => onSelectProduct(product)}>
              <div className="truncate font-semibold">{localizedProductName(product, locale)}</div>
              <div className="mt-2 text-xs text-muted-foreground">{getInsightDetail(product, filter, t)}</div>
            </button>))}
        </div>)}
    </section>);
}
function ProductThumbnail({ product }: {
    product: Product;
}) {
    const { locale } = useProductsT();
    const thumbUrl = preferredProductThumbUrl(product);
    if (thumbUrl) {
        return <img alt={localizedProductName(product, locale)} className="size-full object-cover" decoding="async" loading="lazy" src={thumbUrl}/>;
    }
    return <ProductImagePlaceholder />;
}
function StockBadge({ label, minStock, stock }: {
    label: string;
    minStock: number;
    stock: number;
}) {
    const style = stock <= 0
        ? "border-danger/40 bg-danger/10 text-danger"
        : stock <= minStock
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border bg-background text-foreground";
    return <span className={cn("inline-flex min-w-12 justify-center rounded-full border px-2 py-1 text-xs font-bold", style)}>{label}</span>;
}
function ExpiryBadge({ status }: {
    status: ExpiryStatus;
}) {
    const { t } = useProductsT();
    const labels: Record<ExpiryStatus, string> = {
        expired: t("expiredStatus"),
        near_expiry: t("nearExpiry"),
        no_expiry: t("noExpiry"),
        normal: t("normal"),
    };
    const styles: Record<ExpiryStatus, string> = {
        expired: "border-danger/40 bg-danger/10 text-danger",
        near_expiry: "border-warning/40 bg-warning/10 text-warning",
        no_expiry: "border-muted bg-muted text-muted-foreground",
        normal: "border-success/40 bg-success/10 text-success",
    };
    return <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-semibold", styles[status])}>{labels[status]}</span>;
}
function ImagePreviewModal({ onClose, product }: {
    onClose: () => void;
    product: Product;
}) {
    const { t, locale } = useProductsT();
    return (<ProductSmallModal closeAriaLabel={t("closeModal")} closeOnBackdrop={true} closeOnEscape={true} onClose={onClose} size="xl" title={t("productImage")}>
      <div className="grid gap-4">
        <div className="grid min-h-72 place-items-center overflow-hidden rounded-lg border border-border bg-background p-4">
          {preferredProductDisplayUrl(product) ? (<img alt={localizedProductName(product, locale)} className="max-h-[60vh] max-w-full rounded-md object-contain" src={preferredProductDisplayUrl(product)}/>) : preferredProductThumbUrl(product) ? (<img alt={localizedProductName(product, locale)} className="max-h-[60vh] max-w-full rounded-md object-contain" src={preferredProductThumbUrl(product)}/>) : (<div className="grid gap-3 text-center text-muted-foreground">
              <ImageIcon className="mx-auto size-14" aria-hidden="true"/>
              <div className="text-sm font-semibold">{t("noProductImage")}</div>
            </div>)}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{localizedProductName(product, locale)}</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{product.barcode || t("noBarcode")} / {product.sku || t("noSku")}</p>
        </div>
      </div>
    </ProductSmallModal>);
}
function getProductStock(product: Product) {
    return Math.max(0, Math.round(product.currentStock ?? 0));
}
function formatStockDisplay(product: Product) {
    const stock = getProductStock(product);
    const baseUnit = product.units.find((unit) => unit.isBaseUnit) ?? product.units[0];
    if (product.stockDisplayMode !== "breakdown") {
        return `${stock} ${baseUnit?.unitName ?? ""}`.trim();
    }
    let remaining = stock;
    const breakdownUnits = [...product.units]
        .filter((unit) => unit.status !== "inactive" && unit.conversionQty > 0)
        .sort((left, right) => right.conversionQty - left.conversionQty);
    const parts: string[] = [];
    for (const unit of breakdownUnits) {
        const count = Math.floor(remaining / unit.conversionQty);
        if (count > 0) {
            parts.push(`${count} ${unit.unitName}`);
            remaining -= count * unit.conversionQty;
        }
    }
    return parts.length > 0 ? parts.join(" ") : `${stock} ${baseUnit?.unitName ?? ""}`.trim();
}
function getExpiryStatus(product: Product): ExpiryStatus {
    if (!product.expiryDate)
        return "no_expiry";
    const today = new Date();
    const expiry = new Date(`${product.expiryDate}T00:00:00`);
    const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    if (days < 0)
        return "expired";
    if (days <= 30)
        return "near_expiry";
    return "normal";
}
function getProductInsights(products: Product[]) {
    return {
        deadStock: products.filter(isDeadStock).length,
        lowStock: products.filter((product) => {
            const stock = getProductStock(product);
            return stock > 0 && stock <= product.minStock;
        }).length,
        nearExpiry: products.filter((product) => getExpiryStatus(product) === "near_expiry").length,
        outOfStock: products.filter((product) => getProductStock(product) === 0).length,
        total: products.length,
    };
}
function getProductShellStats(products: Product[], categories: Category[]) {
    const barcodeAudit = getBarcodeAudit(products);
    const missingBarcode = products.filter((product) => !product.barcode && product.units.every((unit) => !unit.barcode)).length;
    const missingImages = products.filter((product) => !productHasImageRef(product)).length;
    const missingCost = products.filter((product) => Number(product.costPriceLak ?? 0) <= 0 && product.units.every((unit) => Number(unit.costPriceLak ?? 0) <= 0)).length;
    const lowMargin = products.filter((product) => Number(product.sellingPriceLak ?? 0) > 0 && Number(product.sellingPriceLak ?? 0) <= Number(product.costPriceLak ?? 0)).length;
    const inactiveProducts = products.filter((product) => product.status !== "active").length;
    const outOfStock = products.filter((product) => getProductStock(product) === 0).length;
    const lowStock = products.filter((product) => {
        const stock = getProductStock(product);
        return stock > 0 && stock <= product.minStock;
    }).length;
    const nearExpiry = products.filter((product) => getExpiryStatus(product) === "near_expiry").length;
    const deadStock = products.filter(isDeadStock).length;
    return {
        activeProducts: products.filter((product) => product.status === "active").length,
        categories: categories.length,
        deadStock,
        duplicateBarcode: barcodeAudit.duplicates.length,
        healthIssueCount: missingBarcode + missingImages + missingCost + lowMargin + inactiveProducts + barcodeAudit.duplicates.length,
        inactiveProducts,
        invalidBarcode: barcodeAudit.invalid.length,
        lowMargin,
        lowStock,
        missingBarcode,
        missingCost,
        missingImages,
        nearExpiry,
        outOfStock,
        totalProducts: products.length,
        withBarcode: products.length - missingBarcode,
        withImages: products.length - missingImages,
    };
}
function getProductShellDrawerContent(drawerKey: ProductShellDrawerKey, stats: ProductShellStats, t: ProductsTranslate): ProductShellDrawerContent {
    const readOnlyAction = { label: t("openFilteredList"), reason: t("readOnly") };
    const productWorkflowActions = [
        { label: t("addProduct"), reason: t("requiresWorkflow") },
        { label: t("editProduct"), reason: t("requiresWorkflow") },
        { label: t("deleteProduct"), reason: t("disabledHere") },
    ];
    const imageActions = [
        { label: t("uploadImage"), reason: t("notConnectedYet") },
        { label: t("bulkImageUpload"), reason: t("comingSoon") },
        { label: t("deleteImage"), reason: t("disabledHere") },
    ];
    const barcodeActions = [
        { label: t("generateBarcode"), reason: t("notConnectedYet") },
        { label: t("printLabels"), reason: t("disabledHere") },
        { label: t("runDuplicateScan"), reason: t("readOnly") },
    ];
    if (drawerKey === "total") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: t("totalOverview"),
            sections: [
                { title: t("productCounts"), rows: [
                    { label: t("totalProducts"), value: formatShellCount(stats.totalProducts) },
                    { label: t("activeProducts"), value: formatShellCount(stats.activeProducts) },
                    { label: t("inactiveOrDraft"), value: formatShellCount(stats.inactiveProducts) },
                    { label: t("categories"), value: formatShellCount(stats.categories) },
                ] },
                { title: t("readiness"), rows: [
                    { label: t("productsWithBarcode"), value: formatShellCount(stats.withBarcode) },
                    { label: t("productsWithImage"), value: formatShellCount(stats.withImages) },
                    { label: t("productHealth"), value: stats.healthIssueCount > 0 ? fillProductsCopy(t("healthSignalsCount"), { count: formatShellCount(stats.healthIssueCount) }) : t("noSignals") },
                ] },
            ],
            summaries: [
                { label: t("total"), value: formatShellCount(stats.totalProducts) },
                { label: t("active"), value: formatShellCount(stats.activeProducts) },
                { label: t("categories"), value: formatShellCount(stats.categories) },
                { label: t("healthSignals"), value: formatShellCount(stats.healthIssueCount) },
            ],
            title: t("totalProductsTitle"),
        };
    }
    if (drawerKey === "active") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: t("activeStatusOverview"),
            sections: [
                { title: t("statusSplit"), rows: [
                    { label: t("activeProducts"), value: formatShellCount(stats.activeProducts) },
                    { label: t("inactiveOrDraft"), value: formatShellCount(stats.inactiveProducts) },
                    { label: t("totalProducts"), value: formatShellCount(stats.totalProducts) },
                ] },
                { title: t("notes"), rows: [
                    { label: t("filteredListShortcut"), value: t("comingSoon") },
                    { label: t("statusEdits"), value: t("disabledHere") },
                ] },
            ],
            summaries: [
                { label: t("active"), value: formatShellCount(stats.activeProducts) },
                { label: t("inactiveDraft"), value: formatShellCount(stats.inactiveProducts) },
                { label: t("total"), value: formatShellCount(stats.totalProducts) },
            ],
            title: t("activeProductsTitle"),
        };
    }
    if (drawerKey === "missing_images" || drawerKey === "images") {
        return {
            actions: imageActions,
            description: t("imageCoverageOverview"),
            sections: [
                { title: t("imageCoverage"), rows: [
                    { label: t("productsWithImage"), value: formatShellCount(stats.withImages) },
                    { label: t("productsMissingImage"), value: formatShellCount(stats.missingImages) },
                    { label: t("bulkImageWorkflow"), value: t("notConnectedYet") },
                ] },
                { title: t("disabledImageActions"), rows: [
                    { label: t("uploadChangeImage"), value: t("disabled") },
                    { label: t("deleteImage"), value: t("disabled") },
                    { label: t("zipImage"), value: t("notEnabled") },
                ] },
            ],
            summaries: [
                { label: t("withImage"), value: formatShellCount(stats.withImages) },
                { label: t("missingImage"), value: formatShellCount(stats.missingImages) },
                { label: t("total"), value: formatShellCount(stats.totalProducts) },
            ],
            title: drawerKey === "images" ? t("productImages") : t("missingImagesTitle"),
        };
    }
    if (drawerKey === "missing_barcode" || drawerKey === "barcode_sku") {
        return {
            actions: barcodeActions,
            description: t("barcodeSkuOverview"),
            sections: [
                { title: t("barcodeReadiness"), rows: [
                    { label: t("productsWithBarcode"), value: formatShellCount(stats.withBarcode) },
                    { label: t("productsMissingBarcode"), value: formatShellCount(stats.missingBarcode) },
                    { label: t("duplicateBarcodeEntries"), value: formatShellCount(stats.duplicateBarcode) },
                    { label: t("invalidBarcodeEntries"), value: formatShellCount(stats.invalidBarcode) },
                ] },
                { title: t("scannerLabelNotes"), rows: [
                    { label: t("scannerSupport"), value: t("usesExistingWorkflow") },
                    { label: t("barcodeGeneration"), value: t("notConnectedYet") },
                    { label: t("labelPrint"), value: t("disabledFromShell") },
                ] },
            ],
            summaries: [
                { label: t("withBarcode"), value: formatShellCount(stats.withBarcode) },
                { label: t("missingBarcode"), value: formatShellCount(stats.missingBarcode) },
                { label: t("duplicateEntries"), value: formatShellCount(stats.duplicateBarcode) },
                { label: t("invalidEntries"), value: formatShellCount(stats.invalidBarcode) },
            ],
            title: drawerKey === "barcode_sku" ? t("barcodeSku") : t("missingBarcode"),
        };
    }
    if (drawerKey === "categories") {
        return {
            actions: [
                { label: t("addCategoryAction"), reason: t("requiresCategoryWorkflow") },
                { label: t("editCategoryAction"), reason: t("comingSoon") },
                { label: t("deleteCategoryAction"), reason: t("disabledHere") },
            ],
            description: t("categoryOverview"),
            sections: [
                { title: t("categoryStatus"), rows: [
                    { label: t("categories"), value: formatShellCount(stats.categories) },
                    { label: t("categoryAssignmentCheck"), value: t("usesLoadedProductData") },
                    { label: t("categoryManagement"), value: t("existingWorkflowUnchanged") },
                ] },
            ],
            summaries: [
                { label: t("categories"), value: formatShellCount(stats.categories) },
                { label: t("products"), value: formatShellCount(stats.totalProducts) },
            ],
            title: t("categories"),
        };
    }
    if (drawerKey === "labels") {
        return {
            actions: [
                { label: t("printBarcodeLabel"), reason: t("disabledHere") },
                { label: t("printPriceLabel"), reason: t("disabledHere") },
                { label: t("savePrintHistory"), reason: t("notConnectedYet") },
            ],
            description: t("labelsOverview"),
            sections: [
                { title: t("labelReadiness"), rows: [
                    { label: t("productsWithBarcode"), value: formatShellCount(stats.withBarcode) },
                    { label: t("productsMissingBarcode"), value: formatShellCount(stats.missingBarcode) },
                    { label: t("printBackend"), value: t("notConnectedShell") },
                ] },
                { title: t("safeStatus"), rows: [
                    { label: t("browserPrintCall"), value: t("notEnabledHere") },
                    { label: t("printHistory"), value: t("notConnected") },
                ] },
            ],
            summaries: [
                { label: t("readyForLabels"), value: formatShellCount(stats.withBarcode) },
                { label: t("needsBarcode"), value: formatShellCount(stats.missingBarcode) },
            ],
            title: t("labels"),
        };
    }
    if (drawerKey === "product_list") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: t("listOverview"),
            sections: [
                { title: t("listReadiness"), rows: [
                    { label: t("loadedProducts"), value: formatShellCount(stats.totalProducts) },
                    { label: t("searchAndFilters"), value: t("available") },
                    { label: t("tableShell"), value: t("available") },
                    { label: t("pagination"), value: t("available") },
                ] },
                { title: t("writeActions"), rows: [
                    { label: t("addProduct"), value: t("disabledFromShell") },
                    { label: t("editProduct"), value: t("disabledFromShell") },
                    { label: t("deleteProduct"), value: t("disabledFromShell") },
                ] },
            ],
            summaries: [
                { label: t("products"), value: formatShellCount(stats.totalProducts) },
                { label: t("active"), value: formatShellCount(stats.activeProducts) },
                { label: t("healthSignals"), value: formatShellCount(stats.healthIssueCount) },
            ],
            title: t("productsListTitle"),
        };
    }
    return {
        actions: [
            { label: t("resolveIssues"), reason: t("comingSoon") },
            { label: t("runFullAudit"), reason: t("notConnectedYet") },
            { label: t("exportHealthReport"), reason: t("disabledHere") },
        ],
        description: t("healthOverview"),
        sections: [
            { title: t("healthChecks"), rows: [
                { label: t("missingImage"), value: formatShellCount(stats.missingImages) },
                { label: t("missingBarcode"), value: formatShellCount(stats.missingBarcode) },
                { label: t("missingCost"), value: formatShellCount(stats.missingCost) },
                { label: t("lowMargin"), value: formatShellCount(stats.lowMargin) },
                { label: t("inactiveProducts"), value: formatShellCount(stats.inactiveProducts) },
                { label: t("duplicateSkuBarcode"), value: stats.duplicateBarcode > 0 ? formatShellCount(stats.duplicateBarcode) : t("notConnectedSku") },
            ] },
            { title: t("stockExpirySignals"), rows: [
                { label: t("outOfStockLower"), value: formatShellCount(stats.outOfStock) },
                { label: t("lowStockLower"), value: formatShellCount(stats.lowStock) },
                { label: t("nearExpiryLower"), value: formatShellCount(stats.nearExpiry) },
                { label: t("deadStockLower"), value: formatShellCount(stats.deadStock) },
            ] },
        ],
        summaries: [
            { label: t("healthSignals"), value: formatShellCount(stats.healthIssueCount) },
            { label: t("missingImage"), value: formatShellCount(stats.missingImages) },
            { label: t("missingBarcode"), value: formatShellCount(stats.missingBarcode) },
            { label: t("inactive"), value: formatShellCount(stats.inactiveProducts) },
        ],
        title: t("productHealth"),
    };
}
function formatShellCount(value: number) {
    return value.toLocaleString("en-US");
}
function getInsightProducts(products: Product[]): Record<SummaryInsight, Product[]> {
    return {
        all: products,
        dead_stock: products.filter(isDeadStock),
        low_stock: products.filter((product) => {
            const stock = getProductStock(product);
            return stock > 0 && stock <= product.minStock;
        }),
        near_expiry: products.filter((product) => getExpiryStatus(product) === "near_expiry"),
        out_of_stock: products.filter((product) => getProductStock(product) === 0),
    };
}
function getInsightDetail(product: Product, filter: SummaryInsight, t: ProductsTranslate) {
    if (filter === "near_expiry")
        return getExpiryStatus(product) === "near_expiry" ? t("expiryStatusNear") : t("expiryStatusNormal");
    if (filter === "dead_stock")
        return t("noSales90Days");
    return fillProductsCopy(t("currentStock"), { stock: formatStockDisplay(product) });
}
function matchesInsightFilter(product: Product, filter: InsightFilter) {
    const stock = getProductStock(product);
    if (filter === "out_of_stock")
        return stock === 0;
    if (filter === "low_stock")
        return stock > 0 && stock <= product.minStock;
    if (filter === "near_expiry")
        return getExpiryStatus(product) === "near_expiry";
    if (filter === "dead_stock")
        return isDeadStock(product);
    if (filter === "missing_barcode")
        return !product.barcode && product.units.every((unit) => !unit.barcode);
    if (filter === "no_image")
        return !productHasImageRef(product);
    return true;
}
function isDeadStock(product: Product) {
    const updatedAt = new Date(`${product.updatedAt || "1970-01-01"}T00:00:00`);
    const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / 86400000;
    return daysSinceUpdate >= 90;
}
function parseMoney(value: unknown) {
    return Number(String(value ?? "").replaceAll(",", "")) || 0;
}
function formatMoneyInput(value: string) {
    const numeric = parseMoney(value);
    return value ? numeric.toLocaleString("en-US") : "";
}
function applyBulkAdjustment(value: number, config: {
    adjustmentMode: "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount" | "set_exact";
    adjustmentValue: number;
    roundingLak: number;
}) {
    const raw = config.adjustmentMode === "increase_percent"
        ? value + value * (config.adjustmentValue / 100)
        : config.adjustmentMode === "decrease_percent"
            ? value - value * (config.adjustmentValue / 100)
            : config.adjustmentMode === "increase_amount"
                ? value + config.adjustmentValue
                : config.adjustmentMode === "decrease_amount"
                    ? value - config.adjustmentValue
                    : config.adjustmentValue;
    const rounded = config.roundingLak > 0 ? Math.round(raw / config.roundingLak) * config.roundingLak : Math.round(raw);
    return Math.max(0, rounded);
}
function buildBulkPricePreview(products: Product[], config: {
    adjustmentMode: "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount" | "set_exact";
    adjustmentValue: number;
    fields: {
        costPrice?: boolean;
        sellingPrice?: boolean;
        studentPrice?: boolean;
    };
    roundingLak: number;
}, locale?: SupportedLocale) {
    return products.flatMap((product) => {
        const units = product.units.length > 0 ? product.units : [{
                costPriceLak: product.costPriceLak,
                id: product.id,
                sellingPriceLak: product.sellingPriceLak,
                unitName: "Product",
            }];
        return units.map((unit) => {
            const oldCost = Number(unit.costPriceLak ?? product.costPriceLak);
            const oldSelling = Number(unit.sellingPriceLak ?? product.sellingPriceLak);
            const oldStudent = oldSelling;
            return {
                newCost: applyBulkAdjustment(oldCost, config),
                newSelling: applyBulkAdjustment(oldSelling, config),
                newStudent: applyBulkAdjustment(oldStudent, config),
                oldCost,
                oldSelling,
                oldStudent,
                productId: product.id,
                productName: localizedProductName(product, locale),
                unitId: unit.id,
                unitName: unit.unitName,
            };
        });
    });
}
function getBarcodeAudit(products: Product[], locale?: SupportedLocale) {
    const barcodeMap = new Map<string, Array<{
        productName: string;
        unitName?: string;
        barcode: string;
    }>>();
    const missing: Array<{
        issue: string;
        productName: string;
        unitName?: string;
        barcode?: string;
    }> = [];
    const invalid: Array<{
        issue: string;
        productName: string;
        unitName?: string;
        barcode?: string;
    }> = [];
    for (const product of products) {
        const productName = localizedProductName(product, locale);
        const entries = [
            { barcode: product.barcode, productName },
            ...product.units.map((unit) => ({ barcode: unit.barcode, productName, unitName: unit.unitName })),
        ];
        for (const entry of entries) {
            if (!entry.barcode) {
                missing.push({ ...entry, issue: "Missing Barcode" });
                continue;
            }
            if (!/^[A-Za-z0-9-]{4,64}$/.test(entry.barcode)) {
                invalid.push({ ...entry, issue: "Invalid Barcode" });
            }
            const current = barcodeMap.get(entry.barcode) ?? [];
            current.push(entry);
            barcodeMap.set(entry.barcode, current);
        }
    }
    const duplicates = Array.from(barcodeMap.entries()).flatMap(([barcode, entries]) => entries.length > 1 ? entries.map((entry) => ({ ...entry, barcode, issue: "Duplicate Barcode" })) : []);
    return { duplicates, invalid, missing };
}
function isRenderableImage(imageUrl?: string) {
    return Boolean(imageUrl && (/^(https?:|data:image|blob:)/.test(imageUrl)));
}
