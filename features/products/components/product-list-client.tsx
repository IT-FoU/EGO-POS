"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Edit3, Eye, FileSpreadsheet, ChevronDown, ChevronUp, ImageIcon, MoreHorizontal, Plus, Printer, Search, SlidersHorizontal, Tags, Upload, AlertCircle, Archive, Clock, Package, Boxes, X, Trash2, } from "lucide-react";
import type { Category, Product, ProductStatus } from "@/features/products/types";
import type { ProductListPage, ProductInsightFilter } from "@/features/products/list-query";
import { ProductImagePlaceholder } from "@/features/products/components/product-image-placeholder";
import { StatusBadge } from "@/features/products/components/status-badge";
import { formatLak } from "@/features/products/format";
import { deleteProductAction, loadProductListAction } from "@/features/products/actions";
import { cn } from "@/lib/utils";
const statusOptions: Array<ProductStatus | "all"> = ["all", "active", "draft", "inactive", "deleted"];
const importFields = [
    "Product Name",
    "Barcode",
    "SKU",
    "Internal Code",
    "Category",
    "Supplier",
    "Cost Price",
    "Selling Price",
    "Stock",
    "Unit",
    "Expiry Enabled",
    "Expiry Date",
    "Status",
    "Image URL",
] as const;
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
export function ProductListClient({ products: initialProducts, categories: initialCategories, listPage: initialListPage, }: {
    products: Product[];
    categories: Category[];
    listPage?: ProductListPage;
}) {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [listPage, setListPage] = useState<ProductListPage | undefined>(initialListPage);
    const [query, setQuery] = useState("");
    const [categoryId, setCategoryId] = useState("all");
    const [status, setStatus] = useState<ProductStatus | "all">("all");
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
        setCategories(initialCategories);
    }, [initialCategories]);
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
                    categoryId,
                    insight: insightFilter,
                    page,
                    pageSize,
                    search: query,
                    status,
                });
                if (!result.ok || !result.data) return;
                const next = result.data as ProductListPage;
                setListPage(next);
                setProducts(next.products);
            });
        }, 250);
        return () => window.clearTimeout(handle);
    }, [categoryId, initialListPage, insightFilter, page, pageSize, query, status]);
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
        { color: "blue" as const, count: productInsights.total, drawerKey: "total" as ProductShellDrawerKey, emptyText: t("ui.no.products.found"), filter: "all" as SummaryInsight, icon: Boxes, label: "Total Products" },
        { color: "red" as const, count: productInsights.outOfStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("ui.no.out.of.stock.products"), filter: "out_of_stock" as SummaryInsight, icon: AlertCircle, label: "Out of Stock" },
        { color: "orange" as const, count: productInsights.lowStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("ui.no.low.stock.items"), filter: "low_stock" as SummaryInsight, icon: Package, label: "Low Stock" },
        { color: "yellow" as const, count: productInsights.nearExpiry, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("ui.no.products.near.expiry"), filter: "near_expiry" as SummaryInsight, icon: Clock, label: "Near Expiry" },
        { color: "purple" as const, count: productInsights.deadStock, drawerKey: "product_health" as ProductShellDrawerKey, emptyText: t("ui.no.dead.stock.products"), filter: "dead_stock" as SummaryInsight, icon: Archive, label: "Dead Stock" },
    ]), [productInsights]);
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
                    product.supplierName,
                    ...product.units.map((unit) => unit.barcode),
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(normalizedQuery);
            const matchesCategory = categoryId === "all" || product.categoryId === categoryId;
            const matchesStatus = status === "all" || product.status === status;
            const matchesInsight = matchesInsightFilter(product, insightFilter);
            return matchesQuery && matchesCategory && matchesStatus && matchesInsight;
        });
    }, [categoryId, insightFilter, products, query, status]);
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
                setMessage(result.error ?? "Product delete failed.");
                return;
            }
            setProducts((current) => current.filter((product) => product.id !== productId));
            setSelectedProductIds((current) => current.filter((id) => id !== productId));
            setMessage("Product deleted.");
            router.refresh();
        });
    }
    function bulkDeleteSelectedProducts() {
        if (selectedProductIds.length === 0) {
            setMessage("Select products to delete.");
            return;
        }
        startTransition(async () => {
            for (const productId of selectedProductIds) {
                const result = await deleteProductAction(productId);
                if (!result.ok) {
                    setMessage(result.error ?? "Bulk delete failed.");
                    return;
                }
            }
            setProducts((current) => current.filter((product) => !selectedProductIds.includes(product.id)));
            setMessage(`${selectedProductIds.length} products deleted.`);
            setSelectedProductIds([]);
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
      {expandedInsight ? (<InsightPanel emptyText={summaryCards.find((card) => card.filter === expandedInsight)?.emptyText ?? t("ui.no.products.found")} filter={expandedInsight} products={insightProducts[expandedInsight]} onSelectProduct={(product) => {
                setQuery(product.nameEn || product.nameLo);
                applyInsightFilter(expandedInsight);
            }}/>) : null}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3">
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(360px,1fr)_220px_180px]">
            <label className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/>
              <input className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary" placeholder={t("ui.search.barcode.sku.product.name")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }}/>
            </label>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} aria-label="Filter by category">
              <option value="all">All categories</option>
              {categories.map((category) => (<option value={category.id} key={category.id}>
                  {category.nameEn}
                </option>))}
            </select>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm capitalize outline-none transition focus:border-primary" value={status} onChange={(event) => { setStatus(event.target.value as ProductStatus | "all"); setPage(1); }} aria-label="Filter by status">
              {statusOptions.map((option) => (<option value={option} key={option}>
                  {option === "all" ? "All statuses" : option}
                </option>))}
            </select>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" value={insightFilter} onChange={(event) => applyInsightFilter(event.target.value as InsightFilter)} aria-label="Product insight filter">
              <option value="all">All product health</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="near_expiry">Near Expiry</option>
              <option value="dead_stock">Dead Stock</option>
              <option value="missing_barcode">Missing Barcode</option>
              <option value="no_image">No Image</option>
            </select>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button className="inline-flex h-11 items-center gap-2 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50" type="button" disabled={selectedProductIds.length === 0 || isPending} onClick={bulkDeleteSelectedProducts}>
              <Trash2 aria-hidden="true" className="size-4"/>
              Delete Selected
            </button>
            <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" href="/products/categories">
              <SlidersHorizontal aria-hidden="true" className="size-4"/>
              Categories
            </Link>
            <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/products/new">
              <Plus aria-hidden="true" className="size-4"/>
              Create Product
            </Link>
            <div className="relative">
              <button className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setActionMenuOpen((current) => !current)}>
                <MoreHorizontal aria-hidden="true" className="size-4"/>
                More Actions
              </button>
              {actionMenuOpen ? (<div className="absolute right-0 z-30 mt-2 grid w-56 gap-1 rounded-lg border border-border bg-card p-2 shadow-xl">
                  <ActionMenuButton icon={Upload} label="Import Products" onClick={() => openOperationDrawer("tool_import")}/>
                  <ActionMenuButton icon={Download} label="Export Products" onClick={() => openOperationDrawer("tool_export")}/>
                  <ActionMenuButton icon={Search} label="Barcode Audit" onClick={() => openOperationDrawer("tool_audit")}/>
                  <ActionMenuButton icon={Printer} label="Print Barcode" onClick={() => openOperationDrawer("tool_print_barcode")}/>
                  <ActionMenuButton icon={Tags} label="Print Shelf Label" onClick={() => openOperationDrawer("tool_print_shelf")}/>
                  <ActionMenuButton icon={FileSpreadsheet} label="Bulk Price Update" onClick={() => openOperationDrawer("tool_bulk_price")}/>
                </div>) : null}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {pageStart}-{pageEnd} of {totalCount}{t("ui.products")}{selectedProductIds.length > 0 ? `${selectedProductIds.length} selected.` : t("ui.operations.use.current.filters.if.nothing.is")}
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
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllFilteredProducts} aria-label="Select all visible products"/>
                </th>
                <th className="w-16 px-3 py-3 font-semibold">Image</th>
                <th className="px-3 py-3 font-semibold">Product Name</th>
                <th className="px-3 py-3 font-semibold">Barcode</th>
                <th className="px-3 py-3 font-semibold">SKU</th>
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 text-right font-semibold">Stock</th>
                <th className="px-3 py-3 text-right font-semibold">Cost</th>
                <th className="px-3 py-3 text-right font-semibold">Price</th>
                <th className="px-3 py-3 font-semibold">Expiry Status</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => {
            const stock = getProductStock(product);
            const expiryStatus = getExpiryStatus(product);
            return (<tr className="border-b border-border last:border-b-0" key={product.id}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} aria-label={`Select ${product.nameEn || product.nameLo}`}/>
                    </td>
                    <td className="px-3 py-3">
                      <button className="group relative size-12 overflow-hidden rounded-md text-left outline-none ring-primary transition focus:ring-2" type="button" onClick={() => openImagePreview(product)} aria-label={`Preview image for ${product.nameEn || product.nameLo}`}>
                        <ProductThumbnail product={product}/>
                        <span className="absolute inset-0 hidden place-items-center bg-black/40 text-white group-hover:grid">
                          <Eye className="size-4" aria-hidden="true"/>
                        </span>
                      </button>
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      <div className="truncate font-semibold">{product.nameLo}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{product.nameEn}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{product.barcode || "-"}</td>
                    <td className="px-3 py-3 font-mono text-xs">{product.sku || "-"}</td>
                    <td className="px-3 py-3">{product.categoryName || "-"}</td>
                    <td className="px-3 py-3 text-right"><StockBadge label={formatStockDisplay(product)} stock={stock} minStock={product.minStock}/></td>
                    <td className="px-3 py-3 text-right">{formatLak(product.costPriceLak)}</td>
                    <td className="px-3 py-3 text-right font-semibold">{formatLak(product.sellingPriceLak)}</td>
                    <td className="px-3 py-3"><ExpiryBadge status={expiryStatus}/></td>
                    <td className="px-3 py-3"><StatusBadge status={product.status}/></td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" href={`/products/${product.id}/edit`}>
                          <Edit3 aria-hidden="true" className="size-4"/>
                          Edit
                        </Link>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={() => deleteProduct(product.id)}>
                          <Trash2 aria-hidden="true" className="size-4"/>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>);
        })}
            </tbody>
          </table>
        </div>
        {totalCount === 0 ? (<div className="p-8 text-center text-sm text-muted-foreground">{t("ui.no.products.match.the.current.search.and.fil")}</div>) : null}
        <div className="flex flex-col gap-3 border-t border-border bg-background px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page</span>
            <select className="h-9 rounded-md border border-border bg-card px-2" value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value))}>
              {pageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="font-semibold">Page {safePage} of {totalPages}</span>
            <button className="h-9 rounded-md border border-border px-3 font-semibold disabled:opacity-40" type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
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
    const topics = [
        { description: "Review product records, prices, stock signals, and images.", drawerKey: "product_list" as ProductShellDrawerKey, icon: Boxes, label: "Product list" },
        { description: "Organize products by category before editing category records.", drawerKey: "categories" as ProductShellDrawerKey, icon: Tags, label: "Categories" },
        { description: "Check barcode and SKU readiness before printing or importing.", drawerKey: "barcode_sku" as ProductShellDrawerKey, icon: Search, label: "Barcode / SKU" },
        { description: "Review image coverage without changing product images.", drawerKey: "images" as ProductShellDrawerKey, icon: ImageIcon, label: "Product images" },
        { description: "Review price label and barcode label readiness.", drawerKey: "labels" as ProductShellDrawerKey, icon: Printer, label: "Labels" },
        { description: "Review product data quality signals without changing records.", drawerKey: "product_health" as ProductShellDrawerKey, icon: AlertCircle, label: "Product Health" },
    ];

    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Products workspace</p>
            <h2 className="mt-1 text-xl font-semibold">Product management overview</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              A read-only workspace summary for product records, categories, barcodes, and image readiness.
            </p>
          </div>
          <span className="w-fit rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
            Read-only shell
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProductShellMetric icon={Boxes} label="Total products" value={stats.totalProducts} onClick={() => onOpenDrawer("total")}/>
          <ProductShellMetric icon={Package} label="Active products" value={stats.activeProducts} onClick={() => onOpenDrawer("active")}/>
          <ProductShellMetric icon={ImageIcon} label="Missing images" value={stats.missingImages} onClick={() => onOpenDrawer("missing_images")}/>
          <ProductShellMetric icon={Search} label="Missing barcode" value={stats.missingBarcode} onClick={() => onOpenDrawer("missing_barcode")}/>
          <ProductShellMetric icon={AlertCircle} label="Product Health" value={stats.healthIssueCount} onClick={() => onOpenDrawer("product_health")}/>
        </div>

        <div className="mt-4 grid gap-2">
          {topics.map((topic) => (
            <ProductShellTopic description={topic.description} icon={topic.icon} key={topic.label} label={topic.label} onClick={() => onOpenDrawer(topic.drawerKey)}/>
          ))}
        </div>

        {stats.totalProducts === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            No products are available yet. Create real products through the existing product workflow when ready.
          </div>
        ) : stats.missingImages > 0 ? (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
            {stats.missingImages} product{stats.missingImages === 1 ? "" : "s"} missing image coverage.
          </div>
        ) : null}
      </section>
    );
}

function ProductShellMetric({ icon: Icon, label, onClick, value }: { icon: typeof Boxes; label: string; onClick: () => void; value: number }) {
    return (
      <button className="rounded-lg border border-border bg-background p-3 text-left transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40" type="button" onClick={onClick}>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon aria-hidden="true" className="size-4 text-primary"/>
          {label}
        </div>
        <div className="mt-2 text-2xl font-semibold">{value.toLocaleString("en-US")}</div>
        <div className="mt-1 text-xs font-semibold text-primary">View details</div>
      </button>
    );
}

function ProductShellTopic({ description, icon: Icon, label, onClick }: { description: string; icon: typeof Boxes; label: string; onClick: () => void }) {
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
          Open drawer
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
          <ProductDrawerFrame description={getProductToolDescription(drawerKey)} label="Products tool" title={getProductToolTitle(drawerKey)} onClose={onClose}>
            <ProductToolDrawerBody categories={categories} drawerKey={drawerKey} filteredProducts={filteredProducts} operationProducts={operationProducts} selectedProducts={selectedProducts} stats={stats} onClose={onClose}/>
          </ProductDrawerFrame>
        );
    }
    const content = getProductShellDrawerContent(drawerKey, stats);
    return (
      <ProductDrawerFrame description={content.description} label="Products detail" title={content.title} onClose={onClose}>
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
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Disabled Actions</h3>
              <p className="mt-2 text-sm text-muted-foreground">These controls are read-only until the product workflow connection is approved.</p>
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
              <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Advanced Details</summary>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                <ProductShellStatusRow label="Source" value="Loaded Products page data"/>
                <ProductShellStatusRow label="Backend writes" value="Not connected from this shell"/>
                <ProductShellStatusRow label="Raw metadata" value="Hidden"/>
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
    return (
      <div className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-[var(--dashboard-sidebar-width,5rem)]">
        <section className="flex h-full w-full max-w-none flex-col overflow-x-hidden border-l border-border bg-card shadow-2xl">
          <header className="sticky top-0 z-20 border-b border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-primary">{label}</p>
                <h2 className="mt-1 text-2xl font-semibold">{title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
              <button aria-label="Close drawer" className="grid size-10 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition hover:text-foreground" type="button" onClick={onClose}>
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
    return (
      <div className="grid gap-5">
        <ProductToolNotice text="Import is a read-only setup preview. Product records will not be created or changed from this drawer."/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Accepted Formats</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {["CSV", "XLSX"].map((format) => <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-semibold" key={format}>{format}</span>)}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {["Upload file", "Review preview", "Validate rows", "Import after owner approval"].map((step, index) => (
              <div className="rounded-md border border-border bg-card p-3 text-sm" key={step}>
                <div className="font-semibold text-primary">Step {index + 1}</div>
                <div className="mt-1 text-muted-foreground">{step}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-lg border border-dashed border-border bg-background p-5 text-center">
          <Upload className="mx-auto size-10 text-muted-foreground" aria-hidden="true"/>
          <div className="mt-2 font-semibold">Upload area disabled</div>
          <p className="mt-1 text-sm text-muted-foreground">File parsing and import worker are not connected yet.</p>
        </section>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sample Columns</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {importFields.slice(0, 8).map((field) => <span className="rounded-md border border-border bg-card px-3 py-2 text-sm" key={field}>{field}</span>)}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Upload", reason: "Not connected yet" }, { label: "Import", reason: "Disabled" }]}/>
      </div>
    );
}

function ExportProductsDrawer({ onClose, products, selectedCount, stats }: {
    onClose: () => void;
    products: Product[];
    selectedCount: number;
    stats: ProductShellStats;
}) {
    const [selectedIds, setSelectedIds] = useState<string[]>(products.slice(0, 8).map((product) => product.id));
    const previewProducts = products.slice(0, 12);
    const fields = ["Product name", "Barcode", "SKU", "Category", "Selling price", "Cost price", "Stock", "Status", "Image status"];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text="Choose product data and format before export is enabled. This drawer does not download files."/>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ProductShellDrawerSummary label="Total products" value={formatShellCount(products.length)}/>
          <ProductShellDrawerSummary label="Selected rows" value={formatShellCount(selectedIds.length)}/>
          <ProductShellDrawerSummary label="Missing barcode" value={formatShellCount(stats.missingBarcode)}/>
          <ProductShellDrawerSummary label="Missing image" value={formatShellCount(stats.missingImages)}/>
        </div>
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product Selection Preview</h3>
            <div className="flex gap-2">
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setSelectedIds(previewProducts.map((product) => product.id))}>Select all preview</button>
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setSelectedIds([])}>Clear selection</button>
            </div>
          </div>
          <ProductPreviewTable products={previewProducts} selectedIds={selectedIds} onToggle={(productId) => setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId])}/>
          <p className="mt-3 text-xs text-muted-foreground">{selectedCount > 0 ? "Existing table selection was used as the starting export scope." : "Current filters are used as the export preview scope."}</p>
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          <ProductOptionPanel title="Fields Selection" options={fields}/>
          <ProductOptionPanel title="Export Format" options={["CSV", "XLSX"]}/>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Export CSV", reason: "Disabled" }, { label: "Export XLSX", reason: "Disabled" }]}/>
      </div>
    );
}

function BarcodeAuditDrawer({ onClose, products, stats }: { onClose: () => void; products: Product[]; stats: ProductShellStats }) {
    const [filter, setFilter] = useState("all");
    const audit = getBarcodeAudit(products);
    const missingSku = products.filter((product) => !product.sku);
    const rows = [
        ...audit.missing.map((item) => ({ issue: "Missing barcode", productName: item.productName, unitName: item.unitName ?? "Product", value: "-" })),
        ...audit.duplicates.map((item) => ({ issue: "Duplicate barcode", productName: item.productName, unitName: item.unitName ?? "Product", value: item.barcode })),
        ...audit.invalid.map((item) => ({ issue: "Invalid barcode", productName: item.productName, unitName: item.unitName ?? "Product", value: item.barcode ?? "-" })),
        ...missingSku.map((product) => ({ issue: "Missing SKU", productName: product.nameEn || product.nameLo, unitName: "Product", value: product.barcode || "-" })),
    ].filter((row) => filter === "all" || row.issue.toLowerCase().replaceAll(" ", "_") === filter);
    return (
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <ProductShellDrawerSummary label="Total products" value={formatShellCount(stats.totalProducts)}/>
          <ProductShellDrawerSummary label="Missing barcode" value={formatShellCount(audit.missing.length)}/>
          <ProductShellDrawerSummary label="Duplicate barcode" value={formatShellCount(audit.duplicates.length)}/>
          <ProductShellDrawerSummary label="Invalid barcode" value={formatShellCount(audit.invalid.length)}/>
          <ProductShellDrawerSummary label="Missing SKU" value={formatShellCount(missingSku.length)}/>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["all", "All"],
            ["missing_barcode", "Missing barcode"],
            ["duplicate_barcode", "Duplicate barcode"],
            ["invalid_barcode", "Invalid barcode"],
            ["missing_sku", "Missing SKU"],
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
                <tr><th className="p-3">Issue</th><th className="p-3">Product</th><th className="p-3">Unit</th><th className="p-3">Barcode / SKU</th></tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr className="border-t border-border" key={`${row.issue}-${row.productName}-${index}`}>
                    <td className="p-3 font-semibold">{row.issue}</td>
                    <td className="p-3">{row.productName}</td>
                    <td className="p-3">{row.unitName}</td>
                    <td className="p-3 font-mono text-xs">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No barcode or SKU issues in the current preview.</div> : null}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Auto fix", reason: "Disabled" }, { label: "Export audit", reason: "Disabled" }]}/>
      </div>
    );
}

function PrintBarcodeDrawer({ onClose, products }: { onClose: () => void; products: Product[] }) {
    const [quantity, setQuantity] = useState("1");
    const [labelSize, setLabelSize] = useState("40x30mm");
    const [paper, setPaper] = useState("A4");
    const previewProduct = products[0];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text="Barcode print is a preview shell only. Real printer integration can be connected later."/>
        <PrintLayoutControls labelOptions={["40x30mm", "50x30mm", "60x40mm", "Custom"]} labelValue={labelSize} paperValue={paper} quantity={quantity} onLabelChange={setLabelSize} onPaperChange={setPaper} onQuantityChange={setQuantity}/>
        <ProductSelectionPreview products={products}/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Barcode Label Preview</h3>
          <div className="mt-4 max-w-sm rounded-md border border-border bg-card p-4 text-center">
            <div className="truncate text-sm font-semibold">{previewProduct ? previewProduct.nameEn || previewProduct.nameLo : "Product name"}</div>
            <div className="mt-2 rounded bg-background p-3 font-mono text-xs tracking-[0.2em]">{previewProduct?.barcode || previewProduct?.sku || "BARCODE"}</div>
            <div className="mt-2 text-sm font-semibold">{previewProduct ? formatLak(previewProduct.sellingPriceLak) : "Price"}</div>
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Print Preview", reason: "Disabled" }]}/>
      </div>
    );
}

function PrintShelfLabelDrawer({ onClose, products }: { onClose: () => void; products: Product[] }) {
    const [paper, setPaper] = useState("A4");
    const previewProduct = products[0];
    const toggles = ["Product name", "Price", "Unit", "Barcode optional", "Promo tag optional"];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text="Shelf label print is a preview shell only. Real printer integration can be connected later."/>
        <section className="grid gap-4 lg:grid-cols-2">
          <ProductOptionPanel title="Shelf Label Layout" options={["A4", "A5", "80mm roll", "Custom"]} selected={paper} onSelect={setPaper}/>
          <ProductOptionPanel title="Label Content" options={toggles}/>
        </section>
        <ProductSelectionPreview products={products}/>
        <section className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Shelf Label Preview</h3>
          <div className="mt-4 max-w-sm rounded-md border border-border bg-card p-4">
            <div className="truncate text-lg font-semibold">{previewProduct ? previewProduct.nameEn || previewProduct.nameLo : "Product name"}</div>
            <div className="mt-2 text-2xl font-black text-primary">{previewProduct ? formatLak(previewProduct.sellingPriceLak) : "Price"}</div>
            <div className="mt-2 text-xs text-muted-foreground">{previewProduct?.units[0]?.unitName ?? "Unit"} | {previewProduct?.barcode || "Barcode optional"}</div>
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Print Preview", reason: "Disabled" }]}/>
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
    }).slice(0, 20) : [];
    return (
      <div className="grid gap-5">
        <ProductToolNotice text="Preview only. No price changes will be applied in this version."/>
        <section className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">Apply to<select className="field-input" value={target} onChange={(event) => setTarget(event.target.value as typeof target)}><option value="all">All products</option><option value="selected">Selected products</option><option value="category">Category</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Category<select className="field-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={target !== "category"}>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn || category.nameLo}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Adjustment<select className="field-input" value={adjustmentMode} onChange={(event) => setAdjustmentMode(event.target.value as typeof adjustmentMode)}><option value="increase_percent">Increase by %</option><option value="decrease_percent">Decrease by %</option><option value="increase_amount">Increase by amount</option><option value="decrease_amount">Decrease by amount</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Value<input className="field-input" inputMode="decimal" value={formatMoneyInput(adjustmentValue)} onChange={(event) => setAdjustmentValue(event.target.value.replace(/[^\d.]/g, ""))}/></label>
          <label className="grid gap-1 text-sm font-semibold">Rounding<select className="field-input" value={roundingLak} onChange={(event) => setRoundingLak(Number(event.target.value))}><option value={0}>No rounding</option><option value={500}>Round to nearest 500</option><option value={1000}>Round to nearest 1000</option></select></label>
          <div className="grid gap-2 rounded-md border border-border bg-card p-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.costPrice} onChange={(event) => setFields((current) => ({ ...current, costPrice: event.target.checked }))}/> Cost price</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.sellingPrice} onChange={(event) => setFields((current) => ({ ...current, sellingPrice: event.target.checked }))}/> Selling price</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.studentPrice} onChange={(event) => setFields((current) => ({ ...current, studentPrice: event.target.checked }))}/> Student price</label>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview Table</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{previewRows.length.toLocaleString("en-US")} preview rows</span>
              <button className="h-9 rounded-md border border-border px-3 text-xs font-semibold" type="button" onClick={() => setPreviewEnabled(true)}>Preview changes</button>
            </div>
          </div>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="sticky top-0 bg-background text-muted-foreground">
                <tr><th className="p-2">Product</th><th className="p-2 text-right">Old cost</th><th className="p-2 text-right">Preview cost</th><th className="p-2 text-right">Old selling</th><th className="p-2 text-right">Preview selling</th><th className="p-2 text-right">Old student</th><th className="p-2 text-right">Preview student</th></tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr className="border-t border-border" key={`${row.productId}-${row.unitId}`}>
                    <td className="p-2 font-semibold">{row.productName}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.oldCost) : "-"}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.newCost) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.oldSelling) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.newSelling) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.oldStudent) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.newStudent) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No products available for preview.</div> : null}
          </div>
        </section>
        <ProductToolFooter onClose={onClose} actions={[{ label: "Apply changes", reason: "Disabled" }]}/>
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
    return (
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
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
    return (
      <div className="mt-3 max-h-80 overflow-auto rounded-md border border-border">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 bg-background text-muted-foreground">
            <tr><th className="p-2">Select</th><th className="p-2">Product</th><th className="p-2">Barcode</th><th className="p-2">SKU</th><th className="p-2">Status</th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr className="border-t border-border" key={product.id}>
                <td className="p-2"><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => onToggle(product.id)} aria-label={`Select ${product.nameEn || product.nameLo} for preview`}/></td>
                <td className="p-2 font-semibold">{product.nameEn || product.nameLo}</td>
                <td className="p-2 font-mono">{product.barcode || "-"}</td>
                <td className="p-2 font-mono">{product.sku || "-"}</td>
                <td className="p-2">{product.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {products.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No products available in this preview.</div> : null}
      </div>
    );
}

function ProductOptionPanel({ onSelect, options, selected, title }: {
    onSelect?: (value: string) => void;
    options: string[];
    selected?: string;
    title: string;
}) {
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="mt-3 grid gap-2">
          {options.map((option) => (
            <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold" key={option}>
              <span>{option}</span>
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
    return (
      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 lg:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">Quantity per product<input className="field-input" inputMode="numeric" value={quantity} onChange={(event) => onQuantityChange(event.target.value.replace(/[^\d]/g, ""))}/></label>
        <label className="grid gap-1 text-sm font-semibold">Label size<select className="field-input" value={labelValue} onChange={(event) => onLabelChange(event.target.value)}>{labelOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-semibold">Paper / layout<select className="field-input" value={paperValue} onChange={(event) => onPaperChange(event.target.value)}>{["A4", "A5", "80mm roll", "Custom"].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </section>
    );
}

function ProductSelectionPreview({ products }: { products: Product[] }) {
    return (
      <section className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Product Selection Preview</h3>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">{products.length.toLocaleString("en-US")} selected / filtered</span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {products.slice(0, 6).map((product) => (
            <div className="rounded-md border border-border bg-card p-3 text-sm" key={product.id}>
              <div className="truncate font-semibold">{product.nameEn || product.nameLo}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{product.barcode || product.sku || "No code"}</div>
            </div>
          ))}
        </div>
        {products.length === 0 ? <div className="mt-3 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No products available for preview.</div> : null}
      </section>
    );
}

function isProductToolDrawer(drawerKey: ProductShellDrawerKey) {
    return drawerKey.startsWith("tool_");
}

function getProductToolTitle(drawerKey: ProductShellDrawerKey) {
    const titles: Record<string, string> = {
        tool_audit: "Barcode / SKU Audit",
        tool_bulk_price: "Bulk Price Update",
        tool_export: "Export Products",
        tool_import: "Import Products",
        tool_print_barcode: "Print Barcode",
        tool_print_shelf: "Print Shelf Label",
    };
    return titles[drawerKey] ?? "Products Tool";
}

function getProductToolDescription(drawerKey: ProductShellDrawerKey) {
    const descriptions: Record<string, string> = {
        tool_audit: "Review barcode and SKU issues without changing product records.",
        tool_bulk_price: "Preview bulk price changes locally. Applying changes is disabled.",
        tool_export: "Choose product data and file format before export is enabled.",
        tool_import: "Review the future import workflow. File parsing and import are disabled.",
        tool_print_barcode: "Preview barcode label layout without printing or downloading.",
        tool_print_shelf: "Preview shelf label layout without printing or downloading.",
    };
    return descriptions[drawerKey] ?? "Read-only Products tool.";
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
          <div className="mt-1 text-xs text-muted-foreground">{count === 1 ? "1 Product" : `${count.toLocaleString("en-US")} Products`}</div>
        </div>
        <div className={cn("grid size-10 place-items-center rounded-md border", styles)}>
          <Icon aria-hidden="true" className="size-5"/>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button className="text-sm font-semibold text-primary transition hover:underline" type="button" onClick={onViewAll}>{t("ui.view.all")}</button>
        <button className="grid size-8 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onExpand} aria-label={`Expand ${label}`}>
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
    const title = filter === "all"
        ? "All Products"
        : filter === "out_of_stock"
            ? "Out of Stock Products"
            : filter === "low_stock"
                ? "Low Stock Products"
                : filter === "near_expiry"
                    ? "Near Expiry Products"
                    : "Dead Stock Products";
    return (<section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{products.length.toLocaleString("en-US")}{t("ui.item.s")}</span>
      </div>
      {products.length === 0 ? (<div className="mt-4 rounded-md border border-dashed border-border bg-background p-5 text-center text-sm text-muted-foreground">{emptyText}</div>) : (<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.slice(0, 9).map((product) => (<button className="rounded-md border border-border bg-background p-3 text-left transition hover:border-primary" key={product.id} type="button" onClick={() => onSelectProduct(product)}>
              <div className="truncate font-semibold">{product.nameEn || product.nameLo}</div>
              <div className="mt-2 text-xs text-muted-foreground">{getInsightDetail(product, filter)}</div>
            </button>))}
        </div>)}
    </section>);
}
function ProductThumbnail({ product }: {
    product: Product;
}) {
    if (isRenderableImage(product.imageUrl)) {
        return <img alt={product.nameEn || product.nameLo} className="size-full object-cover" src={product.imageUrl}/>;
    }
    const defaultUnitImage = product.units.find((unit) => unit.isDefaultSaleUnit && isRenderableImage(unit.imageUrl))?.imageUrl;
    if (isRenderableImage(defaultUnitImage)) {
        return <img alt={product.nameEn || product.nameLo} className="size-full object-cover" src={defaultUnitImage}/>;
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
    const labels: Record<ExpiryStatus, string> = {
        expired: "Expired",
        near_expiry: "Near Expiry",
        no_expiry: "No Expiry",
        normal: "Normal",
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
    return (<Modal title="Product Image" onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid min-h-72 place-items-center rounded-lg border border-border bg-background p-4">
          {isRenderableImage(product.imageUrl) ? (<img alt={product.nameEn || product.nameLo} className="max-h-[420px] max-w-full rounded-md object-contain" src={product.imageUrl}/>) : isRenderableImage(product.units.find((unit) => unit.isDefaultSaleUnit)?.imageUrl) ? (<img alt={product.nameEn || product.nameLo} className="max-h-[420px] max-w-full rounded-md object-contain" src={product.units.find((unit) => unit.isDefaultSaleUnit)?.imageUrl}/>) : (<div className="grid gap-3 text-center text-muted-foreground">
              <ImageIcon className="mx-auto size-14" aria-hidden="true"/>
              <div className="text-sm font-semibold">No product image</div>
            </div>)}
        </div>
        <div>
          <h3 className="text-lg font-semibold">{product.nameEn || product.nameLo}</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{product.barcode || "No barcode"} / {product.sku || "No SKU"}</p>
        </div>
      </div>
    </Modal>);
}
function Modal({ children, onClose, title }: {
    children: React.ReactNode;
    onClose: () => void;
    title: string;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="grid size-9 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onClose} aria-label="Close modal">
            <X className="size-4" aria-hidden="true"/>
          </button>
        </div>
        {children}
      </section>
    </div>);
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
    const missingImages = products.filter((product) => !isRenderableImage(product.imageUrl) && product.units.every((unit) => !isRenderableImage(unit.imageUrl))).length;
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
function getProductShellDrawerContent(drawerKey: ProductShellDrawerKey, stats: ProductShellStats): ProductShellDrawerContent {
    const readOnlyAction = { label: "Open filtered list", reason: "Read-only" };
    const productWorkflowActions = [
        { label: "Add product", reason: "Requires product workflow connection" },
        { label: "Edit product", reason: "Requires product workflow connection" },
        { label: "Delete product", reason: "Disabled here" },
    ];
    const imageActions = [
        { label: "Upload image", reason: "Not connected yet" },
        { label: "Bulk image upload", reason: "Coming soon" },
        { label: "Delete image", reason: "Disabled here" },
    ];
    const barcodeActions = [
        { label: "Generate barcode", reason: "Not connected yet" },
        { label: "Print labels", reason: "Disabled here" },
        { label: "Run duplicate scan", reason: "Read-only" },
    ];
    if (drawerKey === "total") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: "Read-only overview of all loaded product records.",
            sections: [
                { title: "Product Counts", rows: [
                    { label: "Total products", value: formatShellCount(stats.totalProducts) },
                    { label: "Active products", value: formatShellCount(stats.activeProducts) },
                    { label: "Inactive or draft products", value: formatShellCount(stats.inactiveProducts) },
                    { label: "Categories", value: formatShellCount(stats.categories) },
                ] },
                { title: "Readiness", rows: [
                    { label: "Products with barcode", value: formatShellCount(stats.withBarcode) },
                    { label: "Products with image", value: formatShellCount(stats.withImages) },
                    { label: "Product Health", value: stats.healthIssueCount > 0 ? `${formatShellCount(stats.healthIssueCount)} signals` : "No signals" },
                ] },
            ],
            summaries: [
                { label: "Total", value: formatShellCount(stats.totalProducts) },
                { label: "Active", value: formatShellCount(stats.activeProducts) },
                { label: "Categories", value: formatShellCount(stats.categories) },
                { label: "Health Signals", value: formatShellCount(stats.healthIssueCount) },
            ],
            title: "Total Products",
        };
    }
    if (drawerKey === "active") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: "Read-only status for products currently marked active or inactive.",
            sections: [
                { title: "Status Split", rows: [
                    { label: "Active products", value: formatShellCount(stats.activeProducts) },
                    { label: "Inactive or draft products", value: formatShellCount(stats.inactiveProducts) },
                    { label: "Total products", value: formatShellCount(stats.totalProducts) },
                ] },
                { title: "Notes", rows: [
                    { label: "Filtered list shortcut", value: "Coming soon" },
                    { label: "Status edits", value: "Disabled here" },
                ] },
            ],
            summaries: [
                { label: "Active", value: formatShellCount(stats.activeProducts) },
                { label: "Inactive/Draft", value: formatShellCount(stats.inactiveProducts) },
                { label: "Total", value: formatShellCount(stats.totalProducts) },
            ],
            title: "Active Products",
        };
    }
    if (drawerKey === "missing_images" || drawerKey === "images") {
        return {
            actions: imageActions,
            description: "Read-only image coverage status for loaded product records.",
            sections: [
                { title: "Image Coverage", rows: [
                    { label: "Products with image", value: formatShellCount(stats.withImages) },
                    { label: "Products missing image", value: formatShellCount(stats.missingImages) },
                    { label: "Bulk image workflow", value: "Not connected yet" },
                ] },
                { title: "Disabled Image Actions", rows: [
                    { label: "Upload/change image", value: "Disabled" },
                    { label: "Delete image", value: "Disabled" },
                    { label: "ZIP image import/export", value: "Not enabled" },
                ] },
            ],
            summaries: [
                { label: "With Image", value: formatShellCount(stats.withImages) },
                { label: "Missing Image", value: formatShellCount(stats.missingImages) },
                { label: "Total", value: formatShellCount(stats.totalProducts) },
            ],
            title: drawerKey === "images" ? "Product Images" : "Missing Images",
        };
    }
    if (drawerKey === "missing_barcode" || drawerKey === "barcode_sku") {
        return {
            actions: barcodeActions,
            description: "Read-only barcode and SKU readiness for loaded products and units.",
            sections: [
                { title: "Barcode Readiness", rows: [
                    { label: "Products with barcode", value: formatShellCount(stats.withBarcode) },
                    { label: "Products missing barcode", value: formatShellCount(stats.missingBarcode) },
                    { label: "Duplicate barcode entries", value: formatShellCount(stats.duplicateBarcode) },
                    { label: "Invalid barcode entries", value: formatShellCount(stats.invalidBarcode) },
                ] },
                { title: "Scanner / Label Notes", rows: [
                    { label: "Scanner support", value: "Uses existing product workflow" },
                    { label: "Barcode generation", value: "Not connected yet" },
                    { label: "Label print", value: "Disabled from this shell" },
                ] },
            ],
            summaries: [
                { label: "With Barcode", value: formatShellCount(stats.withBarcode) },
                { label: "Missing Barcode", value: formatShellCount(stats.missingBarcode) },
                { label: "Duplicate Entries", value: formatShellCount(stats.duplicateBarcode) },
                { label: "Invalid Entries", value: formatShellCount(stats.invalidBarcode) },
            ],
            title: drawerKey === "barcode_sku" ? "Barcode / SKU" : "Missing Barcode",
        };
    }
    if (drawerKey === "categories") {
        return {
            actions: [
                { label: "Add category", reason: "Requires category workflow connection" },
                { label: "Edit category", reason: "Coming soon" },
                { label: "Delete category", reason: "Disabled here" },
            ],
            description: "Read-only category management status for the loaded product workspace.",
            sections: [
                { title: "Category Status", rows: [
                    { label: "Categories", value: formatShellCount(stats.categories) },
                    { label: "Category assignment check", value: "Uses loaded product data" },
                    { label: "Category management", value: "Existing workflow unchanged" },
                ] },
            ],
            summaries: [
                { label: "Categories", value: formatShellCount(stats.categories) },
                { label: "Products", value: formatShellCount(stats.totalProducts) },
            ],
            title: "Categories",
        };
    }
    if (drawerKey === "labels") {
        return {
            actions: [
                { label: "Print barcode label", reason: "Disabled here" },
                { label: "Print price label", reason: "Disabled here" },
                { label: "Save print history", reason: "Not connected yet" },
            ],
            description: "Read-only label readiness for price labels and barcode labels.",
            sections: [
                { title: "Label Readiness", rows: [
                    { label: "Products with barcode", value: formatShellCount(stats.withBarcode) },
                    { label: "Products missing barcode", value: formatShellCount(stats.missingBarcode) },
                    { label: "Print backend", value: "Not connected from this shell" },
                ] },
                { title: "Safe Status", rows: [
                    { label: "Browser print call", value: "Not enabled here" },
                    { label: "Print history", value: "Not connected" },
                ] },
            ],
            summaries: [
                { label: "Ready for Labels", value: formatShellCount(stats.withBarcode) },
                { label: "Needs Barcode", value: formatShellCount(stats.missingBarcode) },
            ],
            title: "Labels",
        };
    }
    if (drawerKey === "product_list") {
        return {
            actions: [readOnlyAction, ...productWorkflowActions],
            description: "Read-only status for the product list, search, filters, and table shell.",
            sections: [
                { title: "List Readiness", rows: [
                    { label: "Loaded products", value: formatShellCount(stats.totalProducts) },
                    { label: "Search and filters", value: "Available" },
                    { label: "Table shell", value: "Available" },
                    { label: "Pagination", value: "Available" },
                ] },
                { title: "Write Actions", rows: [
                    { label: "Add product", value: "Disabled from this shell" },
                    { label: "Edit product", value: "Disabled from this shell" },
                    { label: "Delete product", value: "Disabled from this shell" },
                ] },
            ],
            summaries: [
                { label: "Products", value: formatShellCount(stats.totalProducts) },
                { label: "Active", value: formatShellCount(stats.activeProducts) },
                { label: "Health Signals", value: formatShellCount(stats.healthIssueCount) },
            ],
            title: "Products List",
        };
    }
    return {
        actions: [
            { label: "Resolve product issues", reason: "Coming soon" },
            { label: "Run full product audit", reason: "Not connected yet" },
            { label: "Export health report", reason: "Disabled here" },
        ],
        description: "Read-only product health status using only the currently loaded Products page data.",
        sections: [
            { title: "Health Checks", rows: [
                { label: "Missing image", value: formatShellCount(stats.missingImages) },
                { label: "Missing barcode", value: formatShellCount(stats.missingBarcode) },
                { label: "Missing cost", value: formatShellCount(stats.missingCost) },
                { label: "Low margin", value: formatShellCount(stats.lowMargin) },
                { label: "Inactive products", value: formatShellCount(stats.inactiveProducts) },
                { label: "Duplicate SKU/barcode", value: stats.duplicateBarcode > 0 ? formatShellCount(stats.duplicateBarcode) : "Not connected for SKU / 0 barcode duplicates" },
            ] },
            { title: "Stock / Expiry Signals", rows: [
                { label: "Out of stock", value: formatShellCount(stats.outOfStock) },
                { label: "Low stock", value: formatShellCount(stats.lowStock) },
                { label: "Near expiry", value: formatShellCount(stats.nearExpiry) },
                { label: "Dead stock", value: formatShellCount(stats.deadStock) },
            ] },
        ],
        summaries: [
            { label: "Health Signals", value: formatShellCount(stats.healthIssueCount) },
            { label: "Missing Image", value: formatShellCount(stats.missingImages) },
            { label: "Missing Barcode", value: formatShellCount(stats.missingBarcode) },
            { label: "Inactive", value: formatShellCount(stats.inactiveProducts) },
        ],
        title: "Product Health",
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
function getInsightDetail(product: Product, filter: SummaryInsight) {
    if (filter === "near_expiry")
        return `Expiry Status: ${getExpiryStatus(product) === "near_expiry" ? "Near Expiry" : "Normal"}`;
    if (filter === "dead_stock")
        return t("ui.no.sales.activity.for.90.days");
    return `Current Stock: ${formatStockDisplay(product)}`;
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
        return !isRenderableImage(product.imageUrl) && product.units.every((unit) => !isRenderableImage(unit.imageUrl));
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
}) {
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
                productName: product.nameEn || product.nameLo,
                unitId: unit.id,
                unitName: unit.unitName,
            };
        });
    });
}
function getBarcodeAudit(products: Product[]) {
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
        const productName = product.nameEn || product.nameLo;
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
    return Boolean(imageUrl && (/^(https?:|data:image|blob:|\/)/.test(imageUrl)));
}
