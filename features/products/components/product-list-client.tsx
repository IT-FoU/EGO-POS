"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Edit3, Eye, FileSpreadsheet, ChevronDown, ChevronUp, ImageIcon, MoreHorizontal, Plus, Printer, Search, SlidersHorizontal, Tags, Upload, AlertCircle, Archive, Clock, Package, Boxes, X, Trash2, } from "lucide-react";
import type { Category, Product, ProductStatus } from "@/features/products/types";
import { ProductImagePlaceholder } from "@/features/products/components/product-image-placeholder";
import { StatusBadge } from "@/features/products/components/status-badge";
import { formatLak } from "@/features/products/format";
import { bulkPriceUpdateAction, deleteProductAction } from "@/features/products/actions";
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
type ProductsModal = "import" | "export" | "barcode" | "audit" | "shelf" | "bulk" | "image" | null;
type ExpiryStatus = "normal" | "near_expiry" | "expired" | "no_expiry";
type InsightFilter = "all" | "out_of_stock" | "low_stock" | "near_expiry" | "dead_stock" | "missing_barcode" | "no_image";
type SummaryInsight = Exclude<InsightFilter, "missing_barcode" | "no_image">;
const pageSizeOptions = [25, 50, 100, 200] as const;
export function ProductListClient({ products: initialProducts, categories: initialCategories, }: {
    products: Product[];
    categories: Category[];
}) {
    const router = useRouter();
    const [products, setProducts] = useState<Product[]>(initialProducts);
    const [categories, setCategories] = useState<Category[]>(initialCategories);
    const [query, setQuery] = useState("");
    const [categoryId, setCategoryId] = useState("all");
    const [status, setStatus] = useState<ProductStatus | "all">("all");
    const [insightFilter, setInsightFilter] = useState<InsightFilter>("all");
    const [expandedInsight, setExpandedInsight] = useState<SummaryInsight | null>(null);
    const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(100);
    const [page, setPage] = useState(1);
    const [activeModal, setActiveModal] = useState<ProductsModal>(null);
    const [actionMenuOpen, setActionMenuOpen] = useState(false);
    const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
    const [previewProduct, setPreviewProduct] = useState<Product | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    useEffect(() => {
        setProducts(initialProducts);
    }, [initialProducts]);
    useEffect(() => {
        setCategories(initialCategories);
    }, [initialCategories]);
    const productInsights = useMemo(() => getProductInsights(products), [products]);
    const insightProducts = useMemo(() => getInsightProducts(products), [products]);
    const summaryCards = useMemo(() => ([
        { color: "blue" as const, count: productInsights.total, emptyText: t("ui.no.products.found"), filter: "all" as SummaryInsight, icon: Boxes, label: "Total Products" },
        { color: "red" as const, count: productInsights.outOfStock, emptyText: t("ui.no.out.of.stock.products"), filter: "out_of_stock" as SummaryInsight, icon: AlertCircle, label: "Out of Stock" },
        { color: "orange" as const, count: productInsights.lowStock, emptyText: t("ui.no.low.stock.items"), filter: "low_stock" as SummaryInsight, icon: Package, label: "Low Stock" },
        { color: "yellow" as const, count: productInsights.nearExpiry, emptyText: t("ui.no.products.near.expiry"), filter: "near_expiry" as SummaryInsight, icon: Clock, label: "Near Expiry" },
        { color: "purple" as const, count: productInsights.deadStock, emptyText: t("ui.no.dead.stock.products"), filter: "dead_stock" as SummaryInsight, icon: Archive, label: "Dead Stock" },
    ]), [productInsights]);
    const filteredProducts = useMemo(() => {
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
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const pageStart = filteredProducts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const pageEnd = Math.min(safePage * pageSize, filteredProducts.length);
    const paginatedProducts = filteredProducts.slice(pageStart > 0 ? pageStart - 1 : 0, pageEnd);
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
    function exportCsv() {
        const csv = toCsv(operationProducts);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = t("ui.igo.products.export.csv");
        link.click();
        URL.revokeObjectURL(url);
        setMessage(`CSV export prepared for ${operationProducts.length} products.`);
    }
    function openOperationModal(modal: Exclude<ProductsModal, "image" | null>) {
        setActiveModal(modal);
        setActionMenuOpen(false);
    }
    return (<div className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (<SummaryCard active={insightFilter === card.filter} color={card.color} count={card.count} expanded={expandedInsight === card.filter} icon={card.icon} key={card.filter} label={card.label} onExpand={() => {
                setExpandedInsight((current) => current === card.filter ? null : card.filter);
                applyInsightFilter(card.filter);
            }} onViewAll={() => applyInsightFilter(card.filter)}/>))}
      </section>
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
                  <ActionMenuButton icon={Upload} label="Import Products" onClick={() => openOperationModal("import")}/>
                  <ActionMenuButton icon={Download} label="Export Products" onClick={() => openOperationModal("export")}/>
                  <ActionMenuButton icon={Search} label="Barcode Audit" onClick={() => openOperationModal("audit")}/>
                  <ActionMenuButton icon={Printer} label="Print Barcode" onClick={() => openOperationModal("barcode")}/>
                  <ActionMenuButton icon={Tags} label="Print Shelf Label" onClick={() => openOperationModal("shelf")}/>
                  <ActionMenuButton icon={FileSpreadsheet} label="Bulk Price Update" onClick={() => openOperationModal("bulk")}/>
                </div>) : null}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {pageStart}-{pageEnd} of {filteredProducts.length}{t("ui.products")}{selectedProductIds.length > 0 ? `${selectedProductIds.length} selected.` : t("ui.operations.use.current.filters.if.nothing.is")}
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
        {filteredProducts.length === 0 ? (<div className="p-8 text-center text-sm text-muted-foreground">{t("ui.no.products.match.the.current.search.and.fil")}</div>) : null}
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

      {activeModal === "import" ? <ImportProductsModal onClose={closeModal} products={filteredProducts} onDone={(text) => setMessage(text)}/> : null}
      {activeModal === "export" ? <ExportProductsModal onClose={closeModal} products={operationProducts} onCsv={exportCsv} onDone={(text) => setMessage(text)}/> : null}
      {activeModal === "barcode" ? <LabelPreviewModal kind="barcode" onClose={closeModal} products={operationProducts}/> : null}
      {activeModal === "audit" ? <BarcodeAuditModal onClose={closeModal} products={products}/> : null}
      {activeModal === "shelf" ? <LabelPreviewModal kind="shelf" onClose={closeModal} products={operationProducts}/> : null}
      {activeModal === "bulk" ? (<BulkUpdateModal categories={categories} filteredProducts={filteredProducts} isPending={isPending} onClose={closeModal} onDone={(text) => { setMessage(text); router.refresh(); }} products={products} selectedProducts={selectedProducts} startTransition={startTransition}/>) : null}
      {activeModal === "image" && previewProduct ? <ImagePreviewModal product={previewProduct} onClose={closeModal}/> : null}
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
function AuditCountCard({ count, label }: {
    count: number;
    label: string;
}) {
    return (<div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold">{count.toLocaleString("en-US")}</div>
    </div>);
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
function ImportProductsModal({ onClose, onDone, products }: {
    onClose: () => void;
    onDone: (message: string) => void;
    products: Product[];
}) {
    const [fileName, setFileName] = useState("");
    return (<Modal title="Import Products" onClose={onClose}>
      <div className="grid gap-4">
        <label className="grid min-h-32 cursor-pointer place-items-center rounded-md border border-dashed border-border bg-background p-4 text-center transition hover:border-primary">
          <span>
            <Upload className="mx-auto mb-2 text-primary" aria-hidden="true"/>
            <span className="block text-sm font-semibold">{fileName || t("ui.upload.csv.xlsx.xls.or.tsv")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{t("ui.minimum.required.fields.product.name.and.sel")}</span>
          </span>
          <input className="sr-only" type="file" accept=".csv,.xlsx,.xls,.tsv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}/>
        </label>

        <StepList steps={["Upload file", "Preview first rows", "Map columns", "Validate data", "Confirm import"]}/>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Preview first rows</div>
          <div className="grid gap-2 text-xs">
            {products.slice(0, 3).map((product) => (<div className="grid grid-cols-[1fr_90px_90px] gap-2 rounded-md border border-border bg-card p-2" key={product.id}>
                <span className="truncate font-semibold">{product.nameEn || product.nameLo}</span>
                <span className="font-mono">{product.barcode || "No barcode"}</span>
                <span className="text-right">{formatLak(product.sellingPriceLak)}</span>
              </div>))}
          </div>
        </div>

        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Column mapping</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {importFields.slice(0, 8).map((field) => (<label className="grid gap-1 text-xs font-semibold" key={field}>
                {field}
                <select className="field-input h-9 text-xs" defaultValue={field}>
                  <option>{field}</option>
                  <option>Skip column</option>
                </select>
              </label>))}
          </div>
        </div>

        <div className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success">{t("ui.validation.ready.rows.missing.product.name.o")}</div>
        <div className="flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => { onDone(t("ui.import.preview.confirmed.real.import.worker.")); onClose(); }}>Confirm import</button>
        </div>
      </div>
    </Modal>);
}
function ExportProductsModal({ onClose, onCsv, onDone, products }: {
    onClose: () => void;
    onCsv: () => void;
    onDone: (message: string) => void;
    products: Product[];
}) {
    return (<Modal title="Export Products" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t("ui.export.includes.current.filters.or.selected.")}</p>
        <div className="rounded-md border border-border bg-background p-3 text-sm">
          <span className="font-semibold">{products.length}</span>{t("ui.products.ready.to.export")}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => { onDone(t("ui.xlsx.export.placeholder.prepared.for.filtere")); onClose(); }}>Export XLSX</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => { onCsv(); onClose(); }}>Export CSV</button>
        </div>
      </div>
    </Modal>);
}
function LabelPreviewModal({ kind, onClose, products }: {
    kind: "barcode" | "shelf";
    onClose: () => void;
    products: Product[];
}) {
    const isBarcode = kind === "barcode";
    return (<Modal title={isBarcode ? "Print Barcode" : "Print Shelf Label"} onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{products.length}{t("ui.products.in.preview.real.printer.integration")}</p>
        <div className="grid max-h-[420px] gap-3 overflow-auto sm:grid-cols-2">
          {products.slice(0, 12).map((product) => (<div className="rounded-md border border-border bg-background p-3 text-center" key={product.id}>
              <div className="truncate text-sm font-semibold">{product.nameEn || product.nameLo}</div>
              <div className="mt-1 text-lg font-black">{formatLak(product.sellingPriceLak)} LAK</div>
              {isBarcode ? (<div className="mt-2 rounded bg-card p-2 font-mono text-xs tracking-[0.2em]">{product.barcode || product.sku || "NO-CODE"}</div>) : (<div className="mt-2 text-xs text-muted-foreground">{product.units[0]?.unitName ?? "Unit"} | {product.barcode || product.sku || "No code"}</div>)}
              <div className="mt-2 text-xs font-semibold">EGO POS</div>
            </div>))}
        </div>
        <div className="flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Close</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => window.print()}>Print preview</button>
        </div>
      </div>
    </Modal>);
}
function BulkUpdateModal({ categories, filteredProducts, isPending, onClose, onDone, products, selectedProducts, startTransition, }: {
    categories: Category[];
    filteredProducts: Product[];
    isPending: boolean;
    onClose: () => void;
    onDone: (message: string) => void;
    products: Product[];
    selectedProducts: Product[];
    startTransition: React.TransitionStartFunction;
}) {
    const [target, setTarget] = useState<"all" | "category" | "selected">("all");
    const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
    const [adjustmentMode, setAdjustmentMode] = useState<"increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount" | "set_exact">("increase_percent");
    const [adjustmentValue, setAdjustmentValue] = useState("10");
    const [roundingLak, setRoundingLak] = useState(0);
    const [fields, setFields] = useState({ costPrice: false, sellingPrice: true, studentPrice: false });
    const targetProducts = target === "all"
        ? products
        : target === "category"
            ? products.filter((product) => product.categoryId === categoryId)
            : selectedProducts;
    const previewRows = buildBulkPricePreview(targetProducts, {
        adjustmentMode,
        adjustmentValue: parseMoney(adjustmentValue),
        fields,
        roundingLak,
    }).slice(0, 20);
    function submitBulkUpdate() {
        startTransition(async () => {
            const result = await bulkPriceUpdateAction({
                adjustmentMode,
                adjustmentValue: parseMoney(adjustmentValue),
                categoryId: target === "category" ? categoryId : undefined,
                fields,
                productIds: target === "selected" ? selectedProducts.map((product) => product.id) : undefined,
                roundingLak,
                target,
            });
            if (!result.ok) {
                onDone(result.error ?? t("ui.bulk.price.update.failed"));
                return;
            }
            onDone(`Bulk price update applied to ${result.data?.updatedProducts ?? targetProducts.length} products. Price history was recorded.`);
            onClose();
        });
    }
    return (<Modal title="Bulk Price Update" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm text-muted-foreground">{t("ui.preview.and.confirm.changes.before.applying.")}</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-semibold">Apply to<select className="field-input" value={target} onChange={(event) => setTarget(event.target.value as typeof target)}><option value="all">All products</option><option value="category">By category</option><option value="selected">Selected products only</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Category<select className="field-input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={target !== "category"}>{categories.map((category) => <option key={category.id} value={category.id}>{category.nameEn || category.nameLo}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Adjustment<select className="field-input" value={adjustmentMode} onChange={(event) => setAdjustmentMode(event.target.value as typeof adjustmentMode)}><option value="increase_percent">{t("ui.increase.by")}</option><option value="decrease_percent">{t("ui.decrease.by")}</option><option value="increase_amount">Increase by amount</option><option value="decrease_amount">Decrease by amount</option><option value="set_exact">Set exact value</option></select></label>
          <label className="grid gap-1 text-sm font-semibold">Value<input className="field-input" inputMode="decimal" value={formatMoneyInput(adjustmentValue)} onChange={(event) => setAdjustmentValue(event.target.value.replace(/[^\d.]/g, ""))}/></label>
          <label className="grid gap-1 text-sm font-semibold">Rounding<select className="field-input" value={roundingLak} onChange={(event) => setRoundingLak(Number(event.target.value))}><option value={0}>No rounding</option><option value={500}>Nearest 500 LAK</option><option value={1000}>{t("ui.nearest.1.000.lak")}</option><option value={5000}>{t("ui.nearest.5.000.lak")}</option></select></label>
          <div className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.costPrice} onChange={(event) => setFields((current) => ({ ...current, costPrice: event.target.checked }))}/> Cost Price</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.sellingPrice} onChange={(event) => setFields((current) => ({ ...current, sellingPrice: event.target.checked }))}/> Selling Price</label>
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={fields.studentPrice} onChange={(event) => setFields((current) => ({ ...current, studentPrice: event.target.checked }))}/> Student Price</label>
          </div>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold uppercase text-muted-foreground">
            <span>{t("ui.preview")}{targetProducts.length.toLocaleString("en-US")}{t("ui.products.2")}</span>
            {fields.studentPrice ? <span>{t("ui.student.price.requires.future.schema.persist")}</span> : null}
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-background text-muted-foreground">
                <tr><th className="p-2">Product</th><th className="p-2">Unit</th><th className="p-2 text-right">Old Cost</th><th className="p-2 text-right">New Cost</th><th className="p-2 text-right">Old Selling</th><th className="p-2 text-right">New Selling</th><th className="p-2 text-right">Old Student</th><th className="p-2 text-right">New Student</th></tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (<tr className="border-t border-border" key={`${row.productId}-${row.unitId}`}>
                    <td className="p-2 font-semibold">{row.productName}</td><td className="p-2">{row.unitName}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.oldCost) : "-"}</td><td className="p-2 text-right">{fields.costPrice ? formatLak(row.newCost) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.oldSelling) : "-"}</td><td className="p-2 text-right">{fields.sellingPrice ? formatLak(row.newSelling) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.oldStudent) : "-"}</td><td className="p-2 text-right">{fields.studentPrice ? formatLak(row.newStudent) : "-"}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
          <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50" type="button" disabled={isPending || targetProducts.length === 0 || (!fields.costPrice && !fields.sellingPrice && !fields.studentPrice)} onClick={submitBulkUpdate}>Confirm and Apply</button>
        </div>
      </div>
    </Modal>);
}
function BarcodeAuditModal({ onClose, products }: {
    onClose: () => void;
    products: Product[];
}) {
    const audit = getBarcodeAudit(products);
    return (<Modal title="Barcode Audit" onClose={onClose}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <AuditCountCard label="Missing Barcode" count={audit.missing.length}/>
          <AuditCountCard label="Duplicate Barcode" count={audit.duplicates.length}/>
          <AuditCountCard label="Invalid Barcode" count={audit.invalid.length}/>
        </div>
        <div className="max-h-[420px] overflow-auto rounded-md border border-border bg-background">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="sticky top-0 bg-background text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Issue</th><th className="p-3">Product</th><th className="p-3">Unit</th><th className="p-3">Barcode</th></tr>
            </thead>
            <tbody>
              {[...audit.missing, ...audit.duplicates, ...audit.invalid].map((item, index) => (<tr className="border-t border-border" key={`${item.productName}-${item.barcode}-${index}`}>
                  <td className="p-3 font-semibold">{item.issue}</td>
                  <td className="p-3">{item.productName}</td>
                  <td className="p-3">{item.unitName || "Product"}</td>
                  <td className="p-3 font-mono text-xs">{item.barcode || "-"}</td>
                </tr>))}
            </tbody>
          </table>
          {audit.missing.length + audit.duplicates.length + audit.invalid.length === 0 ? (<div className="p-6 text-center text-sm text-muted-foreground">{t("ui.no.barcode.issues.found")}</div>) : null}
        </div>
      </div>
    </Modal>);
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
function StepList({ steps }: {
    steps: string[];
}) {
    return (<div className="grid gap-2 sm:grid-cols-5">
      {steps.map((step, index) => (<div className="rounded-md border border-border bg-background p-2 text-xs" key={step}>
          <div className="font-semibold text-primary">Step {index + 1}</div>
          <div className="mt-1 text-muted-foreground">{step}</div>
        </div>))}
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
function toCsv(products: Product[]) {
    const rows = [
        ["Product Name", "Barcode", "SKU", "Internal Code", "Category", "Supplier", "Cost Price", "Selling Price", "Stock", "Unit", "Expiry Status", "Expiry Date", "Status"],
        ...products.map((product) => [
            product.nameEn || product.nameLo,
            product.barcode,
            product.sku,
            product.productCode ?? "",
            product.categoryName,
            product.supplierName,
            String(product.costPriceLak),
            String(product.sellingPriceLak),
            String(getProductStock(product)),
            product.units[0]?.unitName ?? "",
            getExpiryStatus(product),
            product.expiryDate ?? "",
            product.status,
        ]),
    ];
    return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}
function isRenderableImage(imageUrl?: string) {
    return Boolean(imageUrl && (/^(https?:|data:image|blob:|\/)/.test(imageUrl)));
}
