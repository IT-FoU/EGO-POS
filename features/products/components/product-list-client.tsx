"use client";

import {
  displayProductUnitName,
  fillProductsCopy,
  localizeProductError,
  productStatusLabel,
  tProducts,
} from "@/lib/i18n/products-copy";
import { localizedProductName } from "@/features/pos/product-display-name";
import { hasAssignedUnitBarcode, missingBarcodeUnits, missingImageUnits, productMissingBarcode, productMissingImage, sellableCoverageUnits } from "@/features/products/unit-coverage";
import { preferredProductDisplayUrl, preferredProductThumbUrl } from "@/lib/storage/product-image-ref";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import type { SupportedLocale } from "@/lib/constants";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Edit3, Eye, FileSpreadsheet, ChevronDown, ChevronUp, ImageIcon, MoreHorizontal, Plus, Printer, Search, SlidersHorizontal, Tags, Upload, AlertCircle, Archive, Clock, Package, Boxes, X, Trash2, } from "lucide-react";
import type { Brand, Category, Product, ProductStatus } from "@/features/products/types";
import type { ProductListPage, ProductInsightFilter, ProductListQuery } from "@/features/products/list-query";
import { BarcodeAuditDrawer } from "@/features/products/components/product-barcode-audit-drawer";
import { PrintBarcodeDrawer } from "@/features/products/components/product-print-barcode-drawer";
import { PrintShelfLabelDrawer } from "@/features/products/components/product-print-shelf-drawer";
import { BulkPriceDrawer } from "@/features/products/components/product-bulk-price-drawer";
import { ExportProductsDrawer } from "@/features/products/components/product-export-drawer";
import { ImportProductsDrawer } from "@/features/products/components/product-import-drawer";
import { ProductImagePlaceholder } from "@/features/products/components/product-image-placeholder";
import { StatusBadge } from "@/features/products/components/status-badge";
import { ProductSmallModal } from "@/features/products/components/product-small-modal";
import { formatLak } from "@/features/products/format";
import { deleteProductAction, loadPermanentDeleteEligibilityAction, loadProductListAction, loadProductListIdsAction, permanentDeleteProductAction } from "@/features/products/actions";
import { isProductDeleteBlockReason, type ProductDeleteBlockReason } from "@/features/products/product-delete";
import { readProductListPageSize, readProductListSort, writeProductListPageSize, writeProductListSort } from "@/features/products/list-preferences";
import { DEFAULT_PRODUCT_SORT_MODE, PRODUCT_SORT_MODES, sortProductRecords, type ProductSortMode } from "@/features/products/product-sort";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import type { Supplier } from "@/features/suppliers/types";
import { cn } from "@/lib/utils";
const statusOptions: Array<ProductStatus | "all"> = ["all", "active", "draft", "inactive", "deleted"];
const PRODUCT_SELECTION_KEY = "ego-pos-product-selection";
const NEW_PRODUCT_WINDOW_MS = 30 * 86_400_000;

function readStoredSelection() {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.sessionStorage.getItem(PRODUCT_SELECTION_KEY) ?? "[]");
        return Array.isArray(parsed) ? parsed.filter((id: unknown): id is string => typeof id === "string" && id.length > 0) : [];
    }
    catch {
        return [];
    }
}
type ProductsTranslate = (key: string) => string;

type ProductsModal = "image" | null;
type ExpiryStatus = "normal" | "near_expiry" | "expired" | "no_expiry";
type InsightFilter = ProductInsightFilter;
type SummaryInsight = Exclude<InsightFilter, "missing_barcode" | "new_products" | "no_image">;
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

export function ProductListClient({ access, products: initialProducts, brands: initialBrands = [], categories: initialCategories, listPage: initialListPage, suppliers: initialSuppliers = [] }: {
    access?: { archive: boolean; create: boolean; editPrice: boolean; printBarcode: boolean; viewCost: boolean };
    products: Product[];
    brands?: Brand[];
    categories: Category[];
    listPage?: ProductListPage;
    suppliers?: Supplier[];
}) {
    const router = useRouter();
    const { locale, t } = useProductsT();
    const productAccess = access ?? { archive: true, create: true, editPrice: true, printBarcode: true, viewCost: true };
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
    const [sortMode, setSortMode] = useState<ProductSortMode>(DEFAULT_PRODUCT_SORT_MODE);
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
    const actionMenuRef = useRef<HTMLDivElement>(null);
    const actionMenuButtonRef = useRef<HTMLButtonElement>(null);
    const skipServerFetch = useRef(true);
    const skipSelectionWrite = useRef(true);
    useEffect(() => {
        setSelectedProductIds(readStoredSelection());
    }, []);
    useEffect(() => {
        if (skipSelectionWrite.current) {
            skipSelectionWrite.current = false;
            return;
        }
        window.sessionStorage.setItem(PRODUCT_SELECTION_KEY, JSON.stringify(selectedProductIds));
    }, [selectedProductIds]);
    useEffect(() => {
        const storedPageSize = readProductListPageSize();
        const storedSort = readProductListSort();
        setPageSize(storedPageSize);
        setSortMode(storedSort);
    }, []);
    useEffect(() => {
        if (!actionMenuOpen) return;
        const firstItem = actionMenuRef.current?.querySelector<HTMLElement>("[role='menuitem']");
        firstItem?.focus();
        function onPointerDown(event: PointerEvent) {
            const target = event.target;
            if (!(target instanceof Node) || actionMenuRef.current?.contains(target)) return;
            setActionMenuOpen(false);
        }
        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.preventDefault();
            setActionMenuOpen(false);
            actionMenuButtonRef.current?.focus();
        }
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [actionMenuOpen]);
    const nameLocale = locale === "lo" ? "lo" : "en";
    const sortLocale = sortMode === "name_asc" || sortMode === "name_desc" ? nameLocale : "en";
    useEffect(() => {
        if (!initialListPage) return;
        const matchesServerList = sortMode === DEFAULT_PRODUCT_SORT_MODE
            && page === (initialListPage.page || 1)
            && pageSize === (initialListPage.pageSize || 100)
            && status === "active"
            && query.trim() === ""
            && categoryId === "all"
            && brandId === "all"
            && supplierId === "all"
            && insightFilter === "all";
        if (skipServerFetch.current) {
            skipServerFetch.current = false;
            if (matchesServerList) return;
        }
        const handle = window.setTimeout(() => {
            startTransition(async () => {
                const result = await loadProductListAction({
                    brandId,
                    categoryId,
                    insight: insightFilter,
                    nameLocale: sortLocale,
                    page,
                    pageSize,
                    search: query,
                    sort: sortMode,
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
    }, [brandId, categoryId, initialListPage, insightFilter, page, pageSize, query, sortLocale, sortMode, status, supplierId]);
    const reloadProductList = useCallback(async () => {
        const result = await loadProductListAction({
            brandId,
            categoryId,
            insight: insightFilter,
            nameLocale: sortLocale,
            page,
            pageSize,
            search: query,
            sort: sortMode,
            status,
            supplierId,
        });
        if (!result.ok || !result.data) return;
        const next = result.data as ProductListPage;
        setListPage(next);
        setProducts(next.products);
        signalPosCatalogueInvalidation();
    }, [brandId, categoryId, insightFilter, page, pageSize, query, sortLocale, sortMode, status, supplierId]);
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
            const matchesSupplier = supplierId === "all"
                || product.supplierId === supplierId
                || (product.supplierIds ?? []).includes(supplierId)
                || (product.productSuppliers ?? []).some((row) => row.supplierId === supplierId);
            const matchesStatus = status === "all" || product.status === status;
            const matchesInsight = matchesInsightFilter(product, insightFilter);
            return matchesQuery && matchesCategory && matchesBrand && matchesSupplier && matchesStatus && matchesInsight;
        });
    }, [brandId, categoryId, insightFilter, products, query, status, supplierId]);
    const filteredProducts = listPage ? products : sortProductRecords(clientFilteredProducts, sortMode, nameLocale);
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
            if (visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))) {
                return current.filter((id) => !visibleIds.includes(id));
            }
            return Array.from(new Set([...current, ...visibleIds]));
        });
    }
    function selectAllFilteredProducts() {
        startTransition(async () => {
            const result = await loadProductListIdsAction({
                brandId,
                categoryId,
                insight: insightFilter,
                nameLocale: sortLocale,
                page: 1,
                pageSize,
                search: query,
                sort: sortMode,
                status,
                supplierId,
            });
            if (!result.ok || !Array.isArray(result.data)) return;
            const ids = result.data.filter((id): id is string => typeof id === "string");
            setSelectedProductIds((current) => Array.from(new Set([...current, ...ids])));
        });
    }
    const pageSelectionMixed = paginatedProducts.some((product) => selectedProductIds.includes(product.id)) && !allVisibleSelected;
    const selectionRequired = selectedProductIds.length === 0;
    function applyInsightFilter(nextFilter: InsightFilter) {
        setInsightFilter(nextFilter);
        setPage(1);
    }
    const [deleteEligibility, setDeleteEligibility] = useState<Record<string, { allowed: boolean; reason: ProductDeleteBlockReason | null }>>({});
    const [deleteTimings, setDeleteTimings] = useState<{ cleanupMs: number; eligibilityMs: number; statementMs: number } | null>(null);
    const [deleteImageCleanup, setDeleteImageCleanup] = useState("");
    const [permanentTarget, setPermanentTarget] = useState<Product | null>(null);
    const deletedIds = useMemo(() => products.filter((product) => product.status === "deleted").map((product) => product.id).join(","), [products]);
    useEffect(() => {
        const ids = deletedIds ? deletedIds.split(",") : [];
        if (ids.length === 0) return;
        let cancelled = false;
        void loadPermanentDeleteEligibilityAction(ids).then((result) => {
            if (cancelled) return;
            if (!result.ok || !result.data) {
                const next: Record<string, { allowed: boolean; reason: ProductDeleteBlockReason | null }> = {};
                for (const id of ids) next[id] = { allowed: false, reason: "TEMPORARILY_UNAVAILABLE" };
                setDeleteEligibility(next);
                return;
            }
            const next: Record<string, { allowed: boolean; reason: ProductDeleteBlockReason | null }> = {};
            for (const row of result.data) {
                next[row.productId] = { allowed: row.allowed, reason: row.reason };
            }
            setDeleteEligibility(next);
        });
        return () => {
            cancelled = true;
        };
    }, [deletedIds]);
    function deleteReasonText(reason: ProductDeleteBlockReason | null) {
        if (reason === "HAS_TRANSACTION_HISTORY") return t("deleteHistoryReason");
        if (reason === "HAS_STOCK") return t("deleteStockReason");
        if (reason === "NEEDS_RECOUNT") return t("deleteRecountReason");
        if (reason === "HAS_LOTS") return t("deleteLotReason");
        if (reason === "HAS_RESERVATION") return t("deleteReservationReason");
        if (reason === "REFERENCED_RECORD") return t("deleteReferencedReason");
        if (reason === "NOT_DELETED") return t("deleteNotDeletedReason");
        if (reason === "TEMPORARILY_UNAVAILABLE") return t("deleteTemporarilyUnavailable");
        return "";
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
            setMessage(t("productRemovedFromCatalogue"));
            signalPosCatalogueInvalidation();
            router.refresh();
        });
    }
    function confirmPermanentDelete() {
        if (!permanentTarget) return;
        const productId = permanentTarget.id;
        startTransition(async () => {
            const result = await permanentDeleteProductAction(productId);
            if (!result.ok) {
                const reason = isProductDeleteBlockReason(String(result.error ?? "")) ? result.error as ProductDeleteBlockReason : "TEMPORARILY_UNAVAILABLE";
                setMessage(localizeProductError(reason));
                setPermanentTarget(null);
                setDeleteEligibility((current) => ({ ...current, [productId]: { allowed: false, reason } }));
                return;
            }
            const payload = result.data && typeof result.data === "object" ? result.data as { imageCleanup?: string; timings?: { cleanupMs: number; eligibilityMs: number; statementMs: number } } : null;
            setDeleteTimings(payload?.timings ?? null);
            setDeleteImageCleanup(payload?.imageCleanup ?? "");
            setProducts((current) => current.filter((product) => product.id !== productId));
            setSelectedProductIds((current) => current.filter((id) => id !== productId));
            setPermanentTarget(null);
            setMessage(t("productDeleted"));
            signalPosCatalogueInvalidation();
            router.refresh();
        });
    }
    function bulkDeleteSelectedProducts() {
        if (selectedProductIds.length === 0) {
            setMessage(t("selectProductsToDelete"));
            return;
        }
        const softIds = selectedProductIds.filter((productId) => products.find((product) => product.id === productId)?.status !== "deleted");
        if (softIds.length === 0) {
            setMessage(t("deletePermanently"));
            return;
        }
        startTransition(async () => {
            for (const productId of softIds) {
                const result = await deleteProductAction(productId);
                if (!result.ok) {
                    setMessage(localizeProductError(result.error ?? "Bulk delete failed."));
                    return;
                }
            }
            setProducts((current) => current.filter((product) => !softIds.includes(product.id)));
            setMessage(t("productRemovedFromCatalogue"));
            setSelectedProductIds((current) => current.filter((id) => !softIds.includes(id)));
            signalPosCatalogueInvalidation();
            router.refresh();
        });
    }
    function updatePageSize(nextPageSize: number) {
        const size = pageSizeOptions.includes(nextPageSize as (typeof pageSizeOptions)[number])
            ? (nextPageSize as (typeof pageSizeOptions)[number])
            : 100;
        setPageSize(size);
        setPage(1);
        writeProductListPageSize(size);
    }
    function updateSortMode(nextSort: ProductSortMode) {
        setSortMode(nextSort);
        setPage(1);
        writeProductListSort(nextSort);
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
      <ProductsVisualShell stats={productShellStats} onOpenDrawer={(drawerKey) => {
        if (drawerKey === "missing_images") applyInsightFilter("no_image");
        if (drawerKey === "missing_barcode") applyInsightFilter("missing_barcode");
        setShellDrawer(drawerKey);
      }}/>
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" data-testid="products-health-filter" value={insightFilter} onChange={(event) => applyInsightFilter(event.target.value as InsightFilter)} aria-label={t("insightFilter")}>
              <option value="all">{t("allProductHealth")}</option>
              <option value="out_of_stock">{t("outOfStock")}</option>
              <option value="low_stock">{t("lowStock")}</option>
              <option value="near_expiry">{t("nearExpiry")}</option>
              <option value="dead_stock">{t("deadStock")}</option>
              <option value="missing_barcode">{t("missingBarcode")}</option>
              <option value="no_image">{t("noImage")}</option>
              <option value="new_products">{t("newProductsFilter")}</option>
            </select>
            <select className="h-11 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-primary" data-testid="products-sort" value={sortMode} onChange={(event) => updateSortMode(event.target.value as ProductSortMode)} aria-label={t("sortBy")}>
              {PRODUCT_SORT_MODES.map((mode) => (
                <option value={mode} key={mode}>
                  {mode === "name_asc" ? t("sortNameAsc") : mode === "name_desc" ? t("sortNameDesc") : mode === "newest" ? t("sortNewest") : t("sortOldest")}
                </option>
              ))}
            </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {productAccess.archive ? <button className="inline-flex h-11 items-center gap-2 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50" type="button" disabled={selectedProductIds.length === 0 || isPending} onClick={bulkDeleteSelectedProducts}>
              <Trash2 aria-hidden="true" className="size-4"/>
              {t("deleteSelected")}
            </button> : null}
            <Link className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" href="/products/categories">
              <SlidersHorizontal aria-hidden="true" className="size-4"/>
              {t("categories")}
            </Link>
            {productAccess.create ? <Link className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href="/products/new">
              <Plus aria-hidden="true" className="size-4"/>
              {t("createProduct")}
            </Link> : null}
            <div className="relative" ref={actionMenuRef}>
              <button ref={actionMenuButtonRef} className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" aria-controls="products-more-actions" aria-expanded={actionMenuOpen} aria-haspopup="menu" data-testid="products-more-actions" onClick={() => setActionMenuOpen((current) => !current)}>
                <MoreHorizontal aria-hidden="true" className="size-4"/>
                {t("moreActions")}
              </button>
              {actionMenuOpen ? (<div className="absolute right-0 z-30 mt-2 grid w-72 gap-1 rounded-lg border border-border bg-card p-2 shadow-xl" id="products-more-actions" role="menu">
                  <p className="px-3 py-1 text-xs font-semibold text-muted-foreground" data-testid="products-selection-context">{selectedProductIds.length > 0 ? fillProductsCopy(t("productsSelected"), { count: selectedProductIds.length }) : t("noProductsSelected")}</p>
                  <ActionMenuButton icon={Upload} label={t("importProducts")} testId="products-import-action" onClick={() => openOperationDrawer("tool_import")}/>
                  <ActionMenuButton icon={Download} label={t("exportProducts")} testId="products-export-action" onClick={() => openOperationDrawer("tool_export")}/>
                  <ActionMenuButton icon={Search} label={t("barcodeAudit")} testId="products-barcode-audit-action" onClick={() => openOperationDrawer("tool_audit")}/>
                  {productAccess.printBarcode ? <ActionMenuButton disabled={selectionRequired} hint={selectionRequired ? t("selectProductsFirst") : undefined} icon={Printer} label={t("printBarcode")} testId="products-print-barcode-action" onClick={() => openOperationDrawer("tool_print_barcode")}/> : null}
                  {productAccess.printBarcode ? <ActionMenuButton disabled={selectionRequired} hint={selectionRequired ? t("selectProductsFirst") : undefined} icon={Tags} label={t("printShelfLabel")} testId="products-print-shelf-action" onClick={() => openOperationDrawer("tool_print_shelf")}/> : null}
                  {productAccess.editPrice ? <ActionMenuButton disabled={selectionRequired} hint={selectionRequired ? t("selectProductsFirst") : undefined} icon={FileSpreadsheet} label={t("bulkPriceUpdate")} testId="products-bulk-price-action" onClick={() => openOperationDrawer("tool_bulk_price")}/> : null}
                </div>) : null}
            </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {fillProductsCopy(t("showingRange"), { from: pageStart, to: pageEnd, total: totalCount })}
            {insightFilter === "new_products" ? <span data-testid="products-new-count"> · {t("newProducts")} · {t("last30Days")} · {totalCount}</span> : null}
          </span>
          {message ? <span className="rounded-full bg-success/10 px-3 py-1 font-semibold text-success" data-cleanup-ms={deleteTimings?.cleanupMs ?? ""} data-eligibility-ms={deleteTimings?.eligibilityMs ?? ""} data-image-cleanup={deleteImageCleanup} data-statement-ms={deleteTimings?.statementMs ?? ""} data-testid={deleteTimings ? "products-delete-timings" : undefined}>{message}</span> : null}
        </div>
      </section>

      {selectedProductIds.length > 0 ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2" data-testid="products-selected-bar">
        <span className="text-sm font-semibold" data-testid="products-selected-count">{fillProductsCopy(t("productsSelected"), { count: selectedProductIds.length })}</span>
        <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-selected-more" type="button" onClick={() => { setActionMenuOpen(true); actionMenuButtonRef.current?.scrollIntoView({ block: "nearest" }); }}>{t("moreActions")}</button>
        <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold" data-testid="products-clear-selection" type="button" onClick={() => setSelectedProductIds([])}>{t("clearSelection")}</button>
        {totalCount > paginatedProducts.length ? <button className="h-9 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-50" data-testid="products-select-filtered" disabled={isPending} type="button" onClick={selectAllFilteredProducts}>{fillProductsCopy(t("selectAllFiltered"), { count: totalCount })}</button> : null}
      </div> : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="max-h-[68vh] max-w-full overflow-auto">
          <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3 font-semibold">
                  <input type="checkbox" checked={allVisibleSelected} data-testid="products-select-page" ref={(element) => { if (element) element.indeterminate = pageSelectionMixed; }} onChange={toggleAllFilteredProducts} aria-label={t("selectPage")}/>
                </th>
                <th className="w-16 px-3 py-3 font-semibold">{t("image")}</th>
                <th className="px-3 py-3 font-semibold">{t("productName")}</th>
                <th className="px-3 py-3 font-semibold">{t("barcode")}</th>
                <th className="px-3 py-3 font-semibold">{t("sku")}</th>
                <th className="px-3 py-3 font-semibold">{t("category")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("stock")}</th>
                {productAccess.viewCost ? <th className="px-3 py-3 text-right font-semibold">{t("cost")}</th> : null}
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
                      <input type="checkbox" checked={selectedProductIds.includes(product.id)} data-testid="products-row-select" onChange={() => toggleProductSelection(product.id)} aria-label={fillProductsCopy(t("selectProduct"), { name: primaryName })}/>
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
                      {insightFilter === "no_image" ? <CoverageGapLine kind="image" locale={locale} product={product} t={t}/> : null}
                      {insightFilter === "missing_barcode" ? <CoverageGapLine kind="barcode" locale={locale} product={product} t={t}/> : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{product.barcode || "-"}</td>
                    <td className="px-3 py-3 font-mono text-xs">{product.sku || "-"}</td>
                    <td className="px-3 py-3">{product.categoryName || "-"}</td>
                    <td className="px-3 py-3 text-right"><StockBadge label={formatStockDisplay(product)} stock={stock} minStock={product.minStock}/></td>
                    {productAccess.viewCost ? <td className="px-3 py-3 text-right">{formatLak(product.costPriceLak)}</td> : null}
                    <td className="px-3 py-3 text-right font-semibold">{formatLak(product.sellingPriceLak)}</td>
                    <td className="px-3 py-3"><ExpiryBadge status={expiryStatus}/></td>
                    <td className="px-3 py-3"><StatusBadge locale={locale} status={product.status}/></td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" href={`/products/${product.id}/edit`}>
                          <Edit3 aria-hidden="true" className="size-4"/>
                          {t("edit")}
                        </Link>
                        {productAccess.archive && product.status !== "deleted" ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/10" data-testid="products-soft-delete" type="button" onClick={() => deleteProduct(product.id)}>
                          <Trash2 aria-hidden="true" className="size-4"/>
                          {t("delete")}
                        </button> : null}
                        {productAccess.archive && product.status === "deleted" ? <div className="grid justify-items-end gap-1">
                          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50" data-allowed={deleteEligibility[product.id]?.allowed ? "true" : "false"} data-reason={deleteEligibility[product.id]?.reason ?? ""} data-testid="products-permanent-delete" disabled={!deleteEligibility[product.id]?.allowed || isPending} type="button" onClick={() => setPermanentTarget(product)}>
                            <Trash2 aria-hidden="true" className="size-4"/>
                            {t("deletePermanently")}
                          </button>
                          {deleteEligibility[product.id] && !deleteEligibility[product.id]?.allowed ? <span className="max-w-64 text-right text-[11px] leading-4 text-muted-foreground" data-testid="products-delete-reason">{deleteReasonText(deleteEligibility[product.id]?.reason ?? null)}</span> : null}
                        </div> : null}
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
            <select className="h-9 rounded-md border border-border bg-card px-2" data-testid="products-rows-per-page" value={pageSize} onChange={(event) => updatePageSize(Number(event.target.value))}>
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
      {permanentTarget ? <ProductSmallModal closeAriaLabel={t("close")} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex justify-end gap-2">
          <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setPermanentTarget(null)}>{t("cancel")}</button>
          <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white disabled:opacity-50" data-testid="products-permanent-confirm" disabled={isPending} type="button" onClick={confirmPermanentDelete}>{t("deletePermanently")}</button>
        </div>} onClose={() => setPermanentTarget(null)} size="sm" title={t("deletePermanently")}>
          <div className="grid gap-2 text-sm" data-testid="products-permanent-dialog">
            <p>{t("deletePermanentUndo")}</p>
            <p className="font-semibold">{localizedProductName(permanentTarget, locale)}</p>
            <p className="font-mono text-xs">{permanentTarget.sku || "-"}</p>
          </div>
        </ProductSmallModal> : null}
      <ProductShellDrawer canImport={productAccess.create} categories={categories} drawerKey={shellDrawer} exportQuery={{ brandId, categoryId, insight: insightFilter, nameLocale: sortLocale, search: query, sort: sortMode, status, supplierId }} filteredProducts={filteredProducts} operationProducts={operationProducts} selectedIds={selectedProductIds} selectedProducts={selectedProducts} stats={productShellStats} onClose={() => setShellDrawer(null)} onImported={reloadProductList}/>
    </div>);
}
function ActionMenuButton({ disabled = false, hint, icon: Icon, label, onClick, testId }: {
    disabled?: boolean;
    hint?: string;
    icon: typeof Upload;
    label: string;
    onClick: () => void;
    testId?: string;
}) {
    return (<button aria-disabled={disabled || undefined} className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50" data-disabled={disabled ? "true" : "false"} data-testid={testId} disabled={disabled} type="button" role="menuitem" onClick={onClick}>
      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true"/>
      <span className="grid">
        <span>{label}</span>
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </span>
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
        { description: t("labelsHint"), drawerKey: "labels" as ProductShellDrawerKey, icon: Printer, label: t("labels") },
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

        <div className="mt-4 grid gap-2" data-testid="products-workspace-topics">
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

function ProductShellDrawer({ canImport, categories, drawerKey, exportQuery, filteredProducts, onClose, onImported, operationProducts, selectedIds, selectedProducts, stats }: {
    canImport: boolean;
    categories: Category[];
    drawerKey: ProductShellDrawerKey | null;
    exportQuery: ProductListQuery;
    filteredProducts: Product[];
    onClose: () => void;
    onImported: () => Promise<void> | void;
    operationProducts: Product[];
    selectedIds: string[];
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
            <ProductToolDrawerBody canImport={canImport} categories={categories} drawerKey={drawerKey} exportQuery={exportQuery} filteredProducts={filteredProducts} operationProducts={operationProducts} selectedIds={selectedIds} selectedProducts={selectedProducts} stats={stats} onClose={onClose} onImported={onImported}/>
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

function ProductToolDrawerBody({ canImport, categories, drawerKey, exportQuery, filteredProducts, onClose, onImported, operationProducts, selectedIds, selectedProducts, stats }: {
    canImport: boolean;
    categories: Category[];
    drawerKey: ProductShellDrawerKey;
    exportQuery: ProductListQuery;
    filteredProducts: Product[];
    onClose: () => void;
    onImported: () => Promise<void> | void;
    operationProducts: Product[];
    selectedIds: string[];
    selectedProducts: Product[];
    stats: ProductShellStats;
}) {
    if (drawerKey === "tool_import")
        return <ImportProductsDrawer canImport={canImport} onClose={onClose} onImported={onImported}/>;
    if (drawerKey === "tool_export")
        return <ExportProductsDrawer onClose={onClose} query={exportQuery} selectedIds={selectedIds}/>;
    if (drawerKey === "tool_audit")
        return <BarcodeAuditDrawer onClose={onClose}/>;
    if (drawerKey === "tool_print_barcode")
        return <PrintBarcodeDrawer onClose={onClose} selectedIds={selectedIds}/>;
    if (drawerKey === "tool_print_shelf")
        return <PrintShelfLabelDrawer onClose={onClose} selectedIds={selectedIds}/>;
    if (drawerKey === "tool_bulk_price")
        return <BulkPriceDrawer onApplied={onImported} onClose={onClose} query={exportQuery} selectedIds={selectedIds}/>;
    return null;
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
    const missingBarcode = products.filter((product) => productMissingBarcode(product)).length;
    const missingImages = products.filter((product) => productMissingImage(product)).length;
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
function CoverageGapLine({ kind, locale, product, t }: {
    kind: "barcode" | "image";
    locale: SupportedLocale;
    product: Product;
    t: ProductsTranslate;
}) {
    const units = (kind === "image" ? missingImageUnits(product) : missingBarcodeUnits(product))
        .map((unit) => displayProductUnitName(unit.unitName || "Piece", locale));
    if (units.length === 0) return null;
    return (
      <div className="mt-1 text-xs text-warning" data-testid={kind === "image" ? "missing-image-units" : "missing-barcode-units"}>
        {fillProductsCopy(kind === "image" ? t("missingImageUnits") : t("missingBarcodeUnits"), { units: units.join(", ") })}
      </div>
    );
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
        return productMissingBarcode(product);
    if (filter === "no_image")
        return productMissingImage(product);
    if (filter === "new_products")
        return isCreatedWithin30Days(product.createdAt);
    return true;
}
function isCreatedWithin30Days(createdAt?: string | null, now = Date.now()) {
    if (!createdAt) return false;
    const created = Date.parse(createdAt);
    return Number.isFinite(created) && created >= now - NEW_PRODUCT_WINDOW_MS && created <= now;
}
function isDeadStock(product: Product) {
    const updatedAt = new Date(`${product.updatedAt || "1970-01-01"}T00:00:00`);
    const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / 86400000;
    return daysSinceUpdate >= 90;
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
        for (const unit of missingBarcodeUnits(product)) {
            missing.push({ barcode: unit.barcode?.trim() || undefined, issue: "Missing Barcode", productName, unitName: unit.unitName || undefined });
        }
        const entries = [
            ...(product.units.length > 0 && product.barcode.trim() ? [{ barcode: product.barcode.trim(), productName }] : []),
            ...sellableCoverageUnits(product)
                .filter((unit) => hasAssignedUnitBarcode(unit.barcode))
                .map((unit) => ({ barcode: unit.barcode!.trim(), productName, unitName: unit.unitName || undefined })),
        ];
        for (const entry of entries) {
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
