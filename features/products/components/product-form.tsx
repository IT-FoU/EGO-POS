"use client";

import {
  displayProductUnitName,
  fillProductsCopy,
  localizeProductError,
  productStatusLabel,
  tProducts,
} from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import type { SupportedLocale } from "@/lib/constants";

const t = tProducts;
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Save, Search, Trash2, X, } from "lucide-react";
import type { Category, MockProductImage, Product, ProductUnit, } from "@/features/products/types";
import { duplicateProductAction, archiveProductAction, createProductAction, deleteProductAction, deleteCategoryAction, updateProductAction, upsertCategoryAction, uploadProductImageAction, clearProductImageAction, searchProductImagesAction, importRemoteProductImageAction, } from "@/features/products/actions";
import { signalPosCatalogueInvalidation } from "@/features/pos/pos-catalogue-refresh";
import { optimizeProductImageFile } from "@/features/products/product-image-optimize";
import { isProductStoragePath, isRenderableImageUrl } from "@/lib/storage/product-image-ref";
import { ProductSmallModal } from "@/features/products/components/product-small-modal";
import { applyAutomaticSellingPrices, applyRoundingToAllUnits, applyUnitPricingPatch } from "@/features/products/unit-pricing";
import { applyHierarchyConversions, hierarchyRelationText, hydrateHierarchyQty, isActiveUnitQtyInvalid, isUnitEnabled, parseIntegerQty, parsePositiveIntQty } from "@/features/products/unit-hierarchy";
import { onQtyInputBlur, onQtyInputChange } from "@/features/products/unit-qty-input";
import {
  formatMoneyDigits,
  moneyInputDisplay,
  moneyInputFromCommitted,
  onMoneyInputBlur,
  onMoneyInputChange,
  onMoneyInputFocus,
  parseMoneyDigits,
} from "@/features/products/money-input";
import {
  onOpeningQtyBlur,
  onOpeningQtyChange,
  onOpeningQtyFocus,
  openingQtyDisplay,
  openingQtyFromCommitted,
} from "@/features/products/opening-qty-input";
import { applyDefaultsToNewUnit, type UnitPricingDefaultsMap } from "@/features/products/unit-pricing-defaults";
import {
    applyLastCreateUnitSetupToDefaults,
    extractLastCreateUnitSetupFromUnits,
    readLastCreateUnitSetup,
    writeLastCreateUnitSetup,
} from "@/features/products/last-create-unit-setup";
import type { ProductImageSearchHit } from "@/features/products/product-image-search";
import {
    buildSkuFromProductName,
    collectProductRequiredGaps,
    ensureSkuWhenEmpty,
    type ProductRequiredFieldKey,
} from "@/features/products/product-sku";
import {
    activeAssignableUnits,
    applyProductImageAssignment,
    assignImageToNewUnit,
    clearImageAssignments,
    inferAssignmentMode,
    inferUnitImageOrigins,
    markUnitImageChoice,
    productImageRef,
    replaceInheritedProductImage,
    resolveUnitImageDisplay,
    toggleUnitImageAssignment,
    unitImageSelectValue,
    unitUsesProductImage,
    type ProductImageAssignmentMode,
    type UnitImageOrigin,
} from "@/features/products/unit-image-assignment";
const QUICK_UNIT_NAMES = [
    "Piece",
    "Pack",
    "Box",
];
type ProductFormImage = {
    id: string;
    label: string;
    url: string;
    assignedUnitId?: string;
    pendingMain?: File;
    pendingThumb?: File;
    storagePath?: string;
};
type CategoryDialogState = {
    mode: "add" | "edit" | "delete";
    categoryId?: string;
} | null;
type ProductStatusConfirm = "archive" | "delete" | null;
type InitialStockPreviewValue = {
    addOpeningStock: boolean;
    receiveUnitId: string;
    quantityReceived: number;
    lotNumber: string;
    expiryDate: string;
    receiveDate: string;
    supplier: string;
    costLak: number;
    note: string;
};
type BarcodeAliasState = Record<string, string[]>;
type DuplicateBarcodeMatch = {
    matchedBarcode: string;
    matchedUnitId?: string;
    matchedUnitName?: string;
    productCode?: string;
    productId: string;
    productName: string;
    sku: string;
    unitId: string;
};
type ProductPreviewSnapshot = {
    basic: {
        productName: string;
        productCode: string;
        sku: string;
        category: string;
        supplierName: string;
        brandName: string;
        description: string;
    };
    images: ProductFormImage[];
    selectedImageId?: string;
    initialStock: InitialStockPreviewValue;
    barcodeAliases: BarcodeAliasState;
    units: ProductUnit[];
};
const emptyUnit: ProductUnit = {
    addAmountLak: 0,
    allowManualUnitSelect: true,
    id: "unit-new",
    unitName: "",
    conversionQty: 1,
    barcode: "",
    costPriceLak: 0,
    imageUrl: undefined,
    sellingPriceLak: 0,
    isBaseUnit: false,
    isDefaultSaleUnit: false,
    isPurchaseUnit: false,
    markupPercent: 0,
    pricingMode: "manual",
    roundingLak: 0,
    sortOrder: 0,
    status: "active",
};
function createDefaultSharedUnits(defaults: UnitPricingDefaultsMap | undefined, inventoryHandoffBarcode: string): ProductUnit[] {
    return [
        applyDefaultsToNewUnit({
            ...emptyUnit,
            barcode: inventoryHandoffBarcode,
            id: "unit-base",
            isBaseUnit: true,
            isDefaultSaleUnit: true,
            isPurchaseUnit: true,
            sortOrder: 0,
            unitName: "Piece",
        }, defaults),
        applyDefaultsToNewUnit({
            ...emptyUnit,
            conversionQty: 6,
            id: "unit-pack",
            sortOrder: 1,
            unitName: "Pack",
        }, defaults),
        applyDefaultsToNewUnit({
            ...emptyUnit,
            conversionQty: 60,
            id: "unit-box",
            sortOrder: 2,
            unitName: "Box",
        }, defaults),
    ];
}
export function ProductForm({ mode, product, categories, images: _images, initialBarcode, sourceFlow, locale: localeProp, pricingDefaults, }: {
    mode: "create" | "edit";
    product?: Product;
    categories: Category[];
    images: MockProductImage[];
    initialBarcode?: string;
    sourceFlow?: string;
    locale?: SupportedLocale;
    pricingDefaults?: UnitPricingDefaultsMap;
}) {
    const locale = useAppLocale(localeProp);
    const t = (key: string) => tProducts(key, locale);
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const duplicateBarcodeRequestRef = useRef(0);
    const [barcode] = useState(product?.barcode ?? "");
    const inventoryHandoffBarcode = mode === "create" && sourceFlow === "inventory" ? (initialBarcode ?? "").trim() : "";
    const hasInventoryHandoffBarcode = inventoryHandoffBarcode.length > 0;
    const [sku, setSku] = useState(product?.sku ?? "");
    const [productCode, setProductCode] = useState(product?.productCode ?? "");
    const [productName, setProductName] = useState(product?.nameEn || product?.nameLo || "");
    const [selectedImageId, setSelectedImageId] = useState<string | undefined>(product?.imageUrl || product?.imageDisplayUrl ? "product-main-image" : undefined);
    const [productImages, setProductImages] = useState<ProductFormImage[]>(() => {
        const initialImages: ProductFormImage[] = [];
        if (product?.imageUrl || product?.imageDisplayUrl || product?.imageThumbUrl) {
            initialImages.push({
                id: "product-main-image",
                label: t("mainProductImage"),
                storagePath: isProductStoragePath(product.imageUrl) ? product.imageUrl : undefined,
                url: product.imageDisplayUrl || product.imageThumbUrl || (isRenderableImageUrl(product.imageUrl) ? product.imageUrl : "") || "",
            });
        }
        for (const unit of product?.units ?? []) {
            const unitPath = isProductStoragePath(unit.imageUrl) ? unit.imageUrl : undefined;
            const unitUrl = unit.imageDisplayUrl || unit.imageThumbUrl || (isRenderableImageUrl(unit.imageUrl) ? unit.imageUrl : "");
            if ((unitPath || unitUrl) && !initialImages.some((image) => image.storagePath === unitPath && unitPath || image.url === unitUrl)) {
                initialImages.push({
                    assignedUnitId: unit.id,
                    id: `unit-image-${unit.id}`,
                    label: fillProductsCopy(t("unitImageLabel"), { unit: displayProductUnitName(unit.unitName) }),
                    storagePath: unitPath,
                    url: unitUrl || "",
                });
            }
        }
        return initialImages.filter((image) => image.url || image.storagePath);
    });
    const [customUnitName, setCustomUnitName] = useState("");
    const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null);
    const [statusConfirm, setStatusConfirm] = useState<ProductStatusConfirm>(null);
    const [localCategories, setLocalCategories] = useState<Category[]>([]);
    const [barcodeAliases, setBarcodeAliases] = useState<BarcodeAliasState>({});
    const [duplicateBarcodeMatch, setDuplicateBarcodeMatch] = useState<DuplicateBarcodeMatch | null>(null);
    const [checkingBarcodeUnitId, setCheckingBarcodeUnitId] = useState<string | null>(null);
    const [aliasDrawerUnitId, setAliasDrawerUnitId] = useState<string | null>(null);
    const [aliasInput, setAliasInput] = useState("");
    const [unitsShareStock, setUnitsShareStock] = useState(true);
    const [conversionInvalid, setConversionInvalid] = useState(false);
    const [initialStockPreview, setInitialStockPreview] = useState<InitialStockPreviewValue>({
        addOpeningStock: false,
        receiveUnitId: "unit-base",
        quantityReceived: 0,
        lotNumber: "",
        expiryDate: "",
        receiveDate: "",
        supplier: "",
        costLak: 0,
        note: "",
    });
    const [previewSnapshot, setPreviewSnapshot] = useState<ProductPreviewSnapshot | null>(null);
    const [units, setUnits] = useState<ProductUnit[]>(() => hydrateHierarchyQty(product?.units ?? createDefaultSharedUnits(pricingDefaults, inventoryHandoffBarcode)));
    // Apply last successful Create unit setup on the client only (avoid SSR/localStorage hydration mismatch).
    useLayoutEffect(() => {
        if (mode !== "create") return;
        const remembered = readLastCreateUnitSetup();
        if (!remembered) return;
        setUnits(hydrateHierarchyQty(applyLastCreateUnitSetupToDefaults(
            createDefaultSharedUnits(pricingDefaults, inventoryHandoffBarcode),
            remembered,
        )));
    // Intentional mount-only restore for Create Product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const initialProductImage = product?.imageUrl || product?.imageDisplayUrl || product?.imageThumbUrl
        ? {
            id: "product-main-image",
            storagePath: isProductStoragePath(product.imageUrl) ? product.imageUrl : undefined,
        }
        : undefined;
    const [imageAssignmentMode, setImageAssignmentMode] = useState<ProductImageAssignmentMode | null>(() => inferAssignmentMode(product?.units ?? [], initialProductImage));
    const [unitImageOrigins, setUnitImageOrigins] = useState<Record<string, UnitImageOrigin>>(() => inferUnitImageOrigins(product?.units ?? [], initialProductImage));
    const unitImageOriginsRef = useRef(unitImageOrigins);
    unitImageOriginsRef.current = unitImageOrigins;
    const imageAssignmentModeRef = useRef(imageAssignmentMode);
    imageAssignmentModeRef.current = imageAssignmentMode;
    const [message, setMessage] = useState<string | null>(null);
    const [messageTone, setMessageTone] = useState<"success" | "error" | "warning">("success");
    const [saveValidationIssues, setSaveValidationIssues] = useState<string[]>([]);
    const formRef = useRef<HTMLFormElement | null>(null);
    const isCreate = mode === "create";

    function showFeedback(nextMessage: string, tone: "success" | "error" | "warning") {
        setMessageTone(tone);
        setMessage(nextMessage);
    }

    function labelForRequiredField(field: ProductRequiredFieldKey) {
        if (field === "productName") return t("productName");
        if (field === "sku") return t("sku");
        return t("category");
    }

    function focusRequiredField(field: ProductRequiredFieldKey) {
        const name = field === "category" ? "categoryId" : field;
        const el = formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
    }

    function scrollSaveFeedbackIntoView() {
        requestAnimationFrame(() => {
            formRef.current
                ?.querySelector<HTMLElement>('[data-testid="product-save-validation-summary"]')
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
    }

    function focusFirstInvalidQtyField() {
        const el = formRef.current?.querySelector<HTMLElement>('[data-field="qty-in-base"][data-invalid="true"]')
            ?? formRef.current?.querySelector<HTMLElement>('[data-field="qty-in-base"]');
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
    }

    function focusDuplicateConflict(errorText: string) {
        const normalized = errorText.toLowerCase();
        if (normalized.includes("sku")) {
            focusRequiredField("sku");
            return;
        }
        if (normalized.includes("barcode")) {
            const el = formRef.current?.querySelector<HTMLElement>('input[data-field="unit-barcode"]');
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
            el?.focus();
        }
    }

    function showSaveFailureNearButton(issues: string[], tone: "error" | "warning" = "error") {
        setSaveValidationIssues(issues);
        showFeedback(
            `${t("unableToSaveProduct")}\n${t("pleaseCompleteRequired")}\n${issues.map((issue) => `• ${issue}`).join("\n")}`,
            tone,
        );
        scrollSaveFeedbackIntoView();
    }

    function maybeAutofillSkuFromName(nameOverride?: string) {
        const nameValue = (nameOverride ?? productName).trim();
        setSku((current) => {
            const next = ensureSkuWhenEmpty(nameValue, current);
            return next || current;
        });
    }
    useEffect(() => {
        setLocalCategories(categories);
    }, [categories]);
    useEffect(() => {
        if (!previewSnapshot)
            return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setPreviewSnapshot(null);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [previewSnapshot]);
    useEffect(() => {
        if (!aliasDrawerUnitId)
            return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setAliasDrawerUnitId(null);
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [aliasDrawerUnitId]);
    function updateUnit(unitId: string, patch: Partial<ProductUnit>) {
        if (patch.barcode !== undefined) {
            const nextBarcode = patch.barcode.trim();
            setDuplicateBarcodeMatch((current) => current?.unitId === unitId && current.matchedBarcode !== nextBarcode ? null : current);
        }
        setUnits((current) => applyUnitPricingPatch({
            editedUnitId: unitId,
            patch,
            shareStock: unitsShareStock,
            units: current.map((unit) => {
                if (unit.id !== unitId) {
                    return {
                        ...unit,
                        ...(patch.isBaseUnit ? { isBaseUnit: false } : {}),
                        ...(patch.isDefaultSaleUnit ? { isDefaultSaleUnit: false } : {}),
                    };
                }
                return unit;
            }),
        }));
    }
    function applyRoundingToAll(roundingLak: number) {
        setUnits((current) => applyRoundingToAllUnits(current, roundingLak));
    }
    async function checkDuplicateUnitBarcode(unitId: string, value: string) {
        const normalized = value.trim();
        if (!isCreate || normalized.length < 4) {
            setDuplicateBarcodeMatch((current) => current?.unitId === unitId ? null : current);
            return;
        }
        const requestId = duplicateBarcodeRequestRef.current + 1;
        duplicateBarcodeRequestRef.current = requestId;
        setCheckingBarcodeUnitId(unitId);
        try {
            const response = await fetch(`/api/products/barcode-lookup?barcode=${encodeURIComponent(normalized)}`);
            const result = await response.json().catch(() => null);
            if (duplicateBarcodeRequestRef.current !== requestId) {
                return;
            }
            if (response.ok && result?.ok && result.data) {
                setDuplicateBarcodeMatch({
                    ...result.data,
                    unitId,
                });
                return;
            }
            setDuplicateBarcodeMatch((current) => current?.unitId === unitId ? null : current);
        } catch {
            if (duplicateBarcodeRequestRef.current === requestId) {
                setDuplicateBarcodeMatch((current) => current?.unitId === unitId ? null : current);
            }
        } finally {
            if (duplicateBarcodeRequestRef.current === requestId) {
                setCheckingBarcodeUnitId(null);
            }
        }
    }
    function addUnit() {
        addNamedUnit("");
    }
    function addNamedUnit(unitName: string) {
        setUnits((current) => {
            const created = applyDefaultsToNewUnit({
                ...emptyUnit,
                id: `unit-${Date.now()}-${current.length}`,
                sortOrder: current.length,
                unitName,
            }, pricingDefaults);
            const selected = productImages.find((image) => image.id === selectedImageId);
            const assigned = assignImageToNewUnit({
                image: selected,
                mode: imageAssignmentModeRef.current,
                origins: unitImageOriginsRef.current,
                unit: created,
            });
            setUnitImageOrigins((currentOrigins) => ({ ...currentOrigins, [assigned.unit.id]: assigned.origin }));
            return [...current, assigned.unit];
        });
    }
    function addCustomUnit() {
        const nextName = customUnitName.trim();
        if (!nextName)
            return;
        addNamedUnit(nextName);
        setCustomUnitName("");
    }
    function changeUnitImage(unitId: string, nextImageUrl: string | undefined) {
        updateUnit(unitId, { imageUrl: nextImageUrl });
        const selected = productImages.find((image) => image.id === selectedImageId);
        setUnitImageOrigins((current) => ({
            ...current,
            [unitId]: markUnitImageChoice(unitId, nextImageUrl, selected),
        }));
    }
    function setMainProductImage(imageId: string) {
        setSelectedImageId(imageId);
        const image = productImages.find((item) => item.id === imageId);
        if (!image || !imageAssignmentModeRef.current) return;
        setUnits((current) => {
            const next = replaceInheritedProductImage({
                image,
                origins: unitImageOriginsRef.current,
                units: current,
            });
            unitImageOriginsRef.current = next.origins;
            setUnitImageOrigins(next.origins);
            return next.units;
        });
    }
    function generateSku() {
        setSku(buildSkuFromProductName(productName));
    }
    function generateProductCode() {
        const timestamp = Date.now().toString().slice(-4);
        setProductCode(`P-${timestamp}`);
    }
    function removeUnit(unitId: string) {
        setUnits((current) => current.filter((unit) => unit.id !== unitId || unit.isBaseUnit));
    }
    function openCategoryDialog(mode: "add" | "edit" | "delete", categoryId?: string) {
        setCategoryDialog({ mode, categoryId });
    }
    function adoptProductImage(image: ProductFormImage) {
        setProductImages((current) => [...current, image]);
        setSelectedImageId(image.id);
        const mode = imageAssignmentModeRef.current;
        if (!mode) return;
        setUnits((current) => {
            const next = replaceInheritedProductImage({
                image,
                origins: unitImageOriginsRef.current,
                units: current,
            });
            setUnitImageOrigins(next.origins);
            return next.units;
        });
    }
    function applyImageAssignment(mode: ProductImageAssignmentMode, image?: ProductFormImage) {
        const selected = image ?? productImages.find((item) => item.id === selectedImageId);
        if (!selected) return;
        setImageAssignmentMode(mode);
        imageAssignmentModeRef.current = mode;
        setUnits((current) => {
            const next = applyProductImageAssignment({
                image: selected,
                mode,
                origins: unitImageOriginsRef.current,
                units: current,
            });
            unitImageOriginsRef.current = next.origins;
            setUnitImageOrigins(next.origins);
            return next.units;
        });
    }
    function selectUploadedImage(file: File | undefined) {
        if (!file)
            return;
        void (async () => {
            try {
                const optimized = await optimizeProductImageFile(file);
                const previewUrl = URL.createObjectURL(optimized.thumb);
                const image: ProductFormImage = {
                    id: `uploaded-${Date.now()}`,
                    label: file.name,
                    pendingMain: optimized.main,
                    pendingThumb: optimized.thumb,
                    url: previewUrl,
                };
                adoptProductImage(image);
                showFeedback(fillProductsCopy(t("uploadedForPreview"), { name: file.name }), "success");
            }
            catch (error) {
                showFeedback(localizeProductError(error instanceof Error ? error.message : t("imageOptimizeFailed")), "error");
            }
        })();
    }
    async function importSearchedImage(hit: ProductImageSearchHit) {
        const imported = await importRemoteProductImageAction(hit.importUrl);
        if (!imported.ok || !imported.data) {
            throw new Error(imported.error ?? t("imageOptimizeFailed"));
        }
        const bytes = Uint8Array.from(atob(imported.data.bytesBase64), (character) => character.charCodeAt(0));
        const file = new File([bytes], imported.data.filename, { type: imported.data.mime });
        const optimized = await optimizeProductImageFile(file);
        const previewUrl = URL.createObjectURL(optimized.thumb);
        const image: ProductFormImage = {
            id: `imported-${Date.now()}`,
            label: hit.title || imported.data.filename,
            pendingMain: optimized.main,
            pendingThumb: optimized.thumb,
            url: previewUrl,
        };
        adoptProductImage(image);
        return image;
    }
    function toggleImageUnitAssignment(imageId: string, unitId: string, assign: boolean) {
        const image = productImages.find((item) => item.id === imageId);
        if (!image) return;
        const mainImage = productImages.find((item) => item.id === selectedImageId);
        setUnits((current) => {
            const next = toggleUnitImageAssignment({
                assign,
                image,
                mainImage,
                origins: unitImageOriginsRef.current,
                unitId,
                units: current,
            });
            unitImageOriginsRef.current = next.origins;
            setUnitImageOrigins(next.origins);
            return next.units;
        });
    }
    function removeProductImage(imageId: string) {
        const removed = productImages.find((image) => image.id === imageId);
        setProductImages((current) => {
            const target = current.find((image) => image.id === imageId);
            if (target?.url.startsWith("blob:")) {
                URL.revokeObjectURL(target.url);
            }
            return current.filter((image) => image.id !== imageId);
        });
        if (selectedImageId === imageId) {
            setSelectedImageId(undefined);
        }
        if (!removed) return;
        setUnits((current) => {
            const next = clearImageAssignments({
                image: removed,
                origins: unitImageOriginsRef.current,
                units: current,
            });
            unitImageOriginsRef.current = next.origins;
            setUnitImageOrigins(next.origins);
            return next.units;
        });
    }
    function addBarcodeAlias(unitId: string) {
        const nextAlias = aliasInput.trim();
        if (!nextAlias)
            return;
        setBarcodeAliases((current) => {
            const currentAliases = current[unitId] ?? [];
            return { ...current, [unitId]: [...currentAliases, nextAlias] };
        });
        setAliasInput("");
    }
    function removeBarcodeAlias(unitId: string, aliasIndex: number) {
        setBarcodeAliases((current) => {
            const nextAliases = (current[unitId] ?? []).filter((_, index) => index !== aliasIndex);
            return { ...current, [unitId]: nextAliases };
        });
    }
    function categoryLabel(categoryId: string) {
        const category = localCategories.find((item) => item.id === categoryId);
        return category ? `${category.nameEn} / ${category.nameLo}` : "—";
    }
    function openProductPreview(form: HTMLFormElement | null) {
        if (!form)
            return;
        const formData = new FormData(form);
        const previewUnits = units.filter((unit) => unit.unitName.trim().length > 0);
        setPreviewSnapshot({
            basic: {
                productName,
                productCode,
                sku,
                category: categoryLabel(String(formData.get("categoryId") ?? "")),
                supplierName: String(formData.get("supplierName") ?? "").trim() || "—",
                brandName: String(formData.get("brandName") ?? "").trim() || "—",
                description: String(formData.get("description") ?? "").trim() || "—",
            },
            images: productImages,
            selectedImageId,
            initialStock: initialStockPreview,
            barcodeAliases,
            units: previewUnits,
        });
    }
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        saveProductFromForm(event.currentTarget);
    }
    function handleSaveClick() {
        if (isPending) return;
        if (formRef.current) {
            saveProductFromForm(formRef.current);
        }
    }
    function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
        if (event.key !== "Enter") return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const tag = target.tagName;
        if (tag === "TEXTAREA") return;
        if (tag === "BUTTON" && (target as HTMLButtonElement).type === "submit") return;
        // Barcode scanners and ordinary inputs must never implicit-submit the product form.
        event.preventDefault();
    }
    function saveProductFromForm(form: HTMLFormElement) {
        const formData = new FormData(form);
        const nameValue = String(formData.get("productName") ?? productName).trim();
        const resolvedSku = ensureSkuWhenEmpty(nameValue, sku);
        if (resolvedSku && resolvedSku !== sku) {
            setSku(resolvedSku);
        }
        const categoryId = String(formData.get("categoryId") ?? "").trim();
        const requireCategory = localCategories.length > 0;
        const gaps = collectProductRequiredGaps({
            categoryId,
            productName: nameValue,
            requireCategory,
            sku: resolvedSku,
        });
        if (gaps.length > 0) {
            const labels = gaps.map(labelForRequiredField);
            showSaveFailureNearButton(labels, "error");
            focusRequiredField(gaps[0]!);
            return;
        }
        setSaveValidationIssues([]);
        const tags = String(formData.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        const visibleUnits = units.filter((unit) => unit.unitName.trim().length > 0);
        if (conversionInvalid || visibleUnits.some(isActiveUnitQtyInvalid)) {
            showSaveFailureNearButton([t("qtyInBaseMustBePositive")], "error");
            focusFirstInvalidQtyField();
            return;
        }
        const preparedUnits = applyAutomaticSellingPrices(applyHierarchyConversions(visibleUnits));
        const sourceUnits = preparedUnits.length > 0 ? preparedUnits : [{
                ...emptyUnit,
                barcode,
                costPriceLak: product?.costPriceLak ?? 0,
                isBaseUnit: true,
                isDefaultSaleUnit: true,
                isPurchaseUnit: true,
                sellingPriceLak: product?.sellingPriceLak ?? 0,
                unitName: "Piece",
            }];
        const baseUnit = sourceUnits.find((unit) => unit.isBaseUnit) ?? sourceUnits[0];
        const defaultSaleUnit = sourceUnits.find((unit) => unit.isDefaultSaleUnit) ?? baseUnit;
        const firstBarcodeUnit = sourceUnits.find((unit) => unit.barcode.trim().length > 0);
        const derivedBarcode = (defaultSaleUnit?.barcode || firstBarcodeUnit?.barcode || barcode).trim();
        const costPriceLak = parseMoney(baseUnit?.costPriceLak ?? product?.costPriceLak ?? 0);
        const sellingPriceLak = parseMoney(defaultSaleUnit?.sellingPriceLak ?? product?.sellingPriceLak ?? 0);
        const hasBaseUnit = visibleUnits.some((unit) => unit.isBaseUnit);
        const productUnits = sourceUnits.map((unit, index) => {
            const conversionQty = isUnitEnabled(unit)
                ? parsePositiveIntQty(unit.conversionQty) as number
                : (parseIntegerQty(unit.conversionQty) ?? 0);
            const isBaseUnit = hasBaseUnit ? unit.isBaseUnit : index === 0;
            const unitPrice = Number(unit.sellingPriceLak) || 0;
            return {
                barcode: unit.barcode.trim() || undefined,
                allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
                addAmountLak: parseMoney(unit.addAmountLak) || undefined,
                conversionQty,
                costPriceLak: parseMoney(unit.costPriceLak) || undefined,
                id: unit.id.startsWith("unit-") ? undefined : unit.id,
                imageUrl: isProductStoragePath(unit.imageUrl) ? unit.imageUrl : productImages.find((image) => image.id === unit.imageUrl)?.storagePath,

                isBaseUnit,
                isDefaultSaleUnit: unit.isDefaultSaleUnit,
                isPurchaseUnit: unit.isPurchaseUnit || isBaseUnit,
                markupPercent: parseMoney(unit.markupPercent) || undefined,
                pricingMode: unit.pricingMode ?? "manual",
                roundingLak: parseMoney(unit.roundingLak) || 0,
                sellingPriceLak: unitPrice,
                sortOrder: unit.sortOrder ?? index,
                status: unit.status ?? "active",
                unitName: unit.unitName.trim(),
            };
        });
        const openingQuantity = Math.max(Number(initialStockPreview.quantityReceived) || 0, 0);
        const receiveUnit = sourceUnits.find((unit) => unit.id === initialStockPreview.receiveUnitId)
            ?? sourceUnits.find((unit) => unit.isPurchaseUnit)
            ?? baseUnit;
        const payload = {
            barcode: derivedBarcode,
            brandId: undefined,
            categoryId: categoryId || undefined,
            costPriceLak,
            description: String(formData.get("description") ?? "").trim() || undefined,
            imageUrl: productImages.find((image) => image.id === selectedImageId)?.storagePath,
            initialStock: mode === "create" && openingQuantity > 0 ? {
                expiryDate: initialStockPreview.expiryDate || undefined,
                lotNumber: initialStockPreview.lotNumber.trim() || undefined,
                note: initialStockPreview.note.trim() || undefined,
                quantity: openingQuantity,
                supplierName: initialStockPreview.supplier.trim() || undefined,
                unitCostLak: initialStockPreview.costLak || costPriceLak,
                unitName: receiveUnit?.unitName.trim() || undefined,
            } : undefined,
            minStock: Number(formData.get("minStock") ?? 0),
            nameEn: nameValue,
            nameLo: nameValue,
            productCode,
            sellingPriceLak,
            sku: resolvedSku,
            status: String(formData.get("status") ?? "active"),
            stockDisplayMode: String(formData.get("stockDisplayMode") ?? "base_unit_only") as "base_unit_only" | "breakdown",
            supplierId: undefined,
            tags,
            units: productUnits,
        };
        const selectedImage = productImages.find((image) => image.id === selectedImageId);
        async function persistSavedProduct(savedProduct: { id: string; units?: Array<{ id: string; unitName: string }> }) {
            const savedUnits = savedProduct.units ?? [];
            const savedIdByName = new Map(
                savedUnits.map((unit) => [unit.unitName.trim().toLowerCase(), unit.id] as const),
            );
            function mapAssignedUnitIds(image: ProductFormImage) {
                return units
                    .filter((unit) => isUnitEnabled(unit) && unitUsesProductImage(unit, image))
                    .map((unit) => {
                        if (!unit.id.startsWith("unit-") && savedUnits.some((saved) => saved.id === unit.id)) {
                            return unit.id;
                        }
                        return savedIdByName.get(unit.unitName.trim().toLowerCase());
                    })
                    .filter((unitId): unitId is string => Boolean(unitId));
            }

            const pendingImages = productImages.filter((image) => image.pendingMain && image.pendingThumb);
            // Upload main/selected first so products.image_url is set, then other assigned pending images.
            const orderedPending = [
                ...pendingImages.filter((image) => image.id === selectedImageId),
                ...pendingImages.filter((image) => image.id !== selectedImageId),
            ];

            for (const image of orderedPending) {
                const assignedUnitIds = mapAssignedUnitIds(image);
                const isMain = image.id === selectedImageId;
                // Skip non-main pending images that are not assigned to any unit.
                if (!isMain && assignedUnitIds.length === 0) continue;
                const imageData = new FormData();
                imageData.set("main", image.pendingMain!);
                imageData.set("thumb", image.pendingThumb!);
                imageData.set("setProductMain", isMain ? "true" : "false");
                if (assignedUnitIds[0]) {
                    imageData.set("assignToUnitId", assignedUnitIds[0]);
                }
                for (const unitId of assignedUnitIds) {
                    imageData.append("assignToUnitIds", unitId);
                }
                const uploaded = await uploadProductImageAction(savedProduct.id, imageData);
                if (!uploaded.ok) {
                    const imageError = localizeProductError(uploaded.error ?? t("imageUploadFailed"));
                    setSaveValidationIssues([imageError]);
                    showFeedback(imageError, "error");
                    scrollSaveFeedbackIntoView();
                    router.refresh();
                    router.push(`/products/${savedProduct.id}/edit`);
                    return false;
                }
            }

            if (orderedPending.length === 0 && mode === "edit" && !selectedImage && product?.imageUrl) {
                const cleared = await clearProductImageAction(savedProduct.id);
                if (!cleared.ok) {
                    const imageError = localizeProductError(cleared.error ?? t("imageUploadFailed"));
                    setSaveValidationIssues([imageError]);
                    showFeedback(imageError, "error");
                    scrollSaveFeedbackIntoView();
                    return false;
                }
            }
            return true;
        }
        if (mode === "create") {
            startTransition(async () => {
                const result = await createProductAction(payload);
                if (!result.ok) {
                    const errorText = localizeProductError(result.error ?? "Product save failed.");
                    setSaveValidationIssues([errorText]);
                    showFeedback(errorText, "error");
                    scrollSaveFeedbackIntoView();
                    focusDuplicateConflict(result.error ?? errorText);
                    return;
                }
                // Successful create only — failed/cancelled forms must not rewrite remembered unit setup.
                writeLastCreateUnitSetup(extractLastCreateUnitSetupFromUnits(sourceUnits));
                // Product exists even if image upload fails; POS must see it immediately.
                signalPosCatalogueInvalidation();
                const saved = result.data as { id: string; units?: Array<{ id: string; unitName: string }> };
                const uploaded = await persistSavedProduct(saved);
                if (!uploaded) return;
                setSaveValidationIssues([]);
                showFeedback(t("productSaved"), "success");
                router.refresh();
                router.push("/products");
            });
            return;
        }
        if (product) {
            startTransition(async () => {
                const result = await updateProductAction(product.id, payload);
                if (!result.ok) {
                    const errorText = localizeProductError(result.error ?? "Product save failed.");
                    setSaveValidationIssues([errorText]);
                    showFeedback(errorText, "error");
                    scrollSaveFeedbackIntoView();
                    focusDuplicateConflict(result.error ?? errorText);
                    return;
                }
                signalPosCatalogueInvalidation();
                const saved = (result.data as { id: string; units?: Array<{ id: string; unitName: string }> } | undefined) ?? product;
                const uploaded = await persistSavedProduct({ id: saved.id, units: saved.units ?? product.units });
                if (!uploaded) return;
                setSaveValidationIssues([]);
                showFeedback(t("productSaved"), "success");
                router.refresh();
                router.push("/products");
            });
            return;
        }
        showFeedback(t("productSaveFailed"), "error");
    }
    function duplicateProduct() {
        if (!product)
            return;
        startTransition(async () => {
            const result = await duplicateProductAction(product.id);
            if (!result.ok) {
                showFeedback(localizeProductError(result.error ?? "Duplicate product failed."), "error");
                return;
            }
            showFeedback(t("productDuplicated"), "success");
            signalPosCatalogueInvalidation();
            router.refresh();
            router.push("/products");
        });
    }
    function saveCategory(input: {
        id?: string;
        nameLo: string;
    }) {
        const nextName = input.nameLo.trim();
        if (!nextName) {
            showFeedback(t("categorySaveFailed"), "error");
            return;
        }
        startTransition(async () => {
            const result = await upsertCategoryAction({
                id: input.id,
                nameEn: nextName,
                nameLo: nextName,
            });
            if (!result.ok) {
                showFeedback(localizeProductError(result.error ?? "Category save failed."), "error");
                return;
            }
            showFeedback(t("categorySaved"), "success");
            setCategoryDialog(null);
            router.refresh();
        });
    }
    function deleteCategory(categoryId: string) {
        startTransition(async () => {
            const result = await deleteCategoryAction(categoryId);
            if (!result.ok) {
                showFeedback(localizeProductError(result.error ?? "Cannot delete category because products still use it."), "error");
                return;
            }
            setLocalCategories((current) => current.filter((category) => category.id !== categoryId));
            showFeedback(t("categoryDeleted"), "success");
            setCategoryDialog(null);
            router.refresh();
        });
    }
    function changeProductStatus(action: "archive" | "delete") {
        if (!product)
            return;
        startTransition(async () => {
            const result = action === "archive"
                ? await archiveProductAction(product.id)
                : await deleteProductAction(product.id);
            if (!result.ok) {
                showFeedback(localizeProductError(result.error ?? "Product save failed."), "error");
                return;
            }
            showFeedback(action === "archive" ? t("productArchived") : (
                result.data && typeof result.data === "object" && "deleteMode" in result.data
                    && (result.data as { deleteMode?: string }).deleteMode === "soft"
                    ? t("productRemovedFromCatalogue")
                    : t("productDeletedSuccess")
            ), "success");
            signalPosCatalogueInvalidation();
            router.refresh();
            router.push("/products");
        });
    }
    const barcodeForImageSearch = (units.find((unit) => unit.isDefaultSaleUnit)?.barcode ||
        units.find((unit) => unit.isBaseUnit)?.barcode ||
        units.find((unit) => unit.barcode.trim().length > 0)?.barcode ||
        barcode).trim();
    const feedbackClassName = messageTone === "success"
        ? "rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success whitespace-pre-line"
        : messageTone === "warning"
            ? "rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning whitespace-pre-line"
            : "rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger whitespace-pre-line";
    return (<form ref={formRef} className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden" onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
      <div className="sticky top-2 z-20 -mx-1 flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-background/95 px-2 py-2 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/products">
            <ArrowLeft aria-hidden="true"/>
            {t("backToProducts")}
          </Link>
          <h1 className={isCreate ? "mt-1 text-2xl font-semibold" : "mt-2 text-3xl font-semibold"}>
            {mode === "create" ? t("createProductTitle") : t("editProduct")}
          </h1>
          {!isCreate ? (<p className="mt-2 text-sm text-muted-foreground">{t("editProductSubtitle")}</p>) : null}
        </div>
        {mode === "edit" && product ? (<div className="flex flex-wrap gap-2">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary disabled:opacity-50" type="button" disabled={isPending} onClick={duplicateProduct}>
              {t("duplicateProduct")}
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-warning disabled:opacity-50" type="button" disabled={isPending} onClick={() => setStatusConfirm("archive")}>
              {t("archive")}
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-danger px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50" type="button" disabled={isPending} onClick={() => setStatusConfirm("delete")}>
              {t("delete")}
            </button>
          </div>) : null}
      </div>

      {message ? (<div className={feedbackClassName} role={messageTone === "success" ? "status" : "alert"}>
          {message}
        </div>) : null}
      {categoryDialog ? (<CategoryCrudDialog categories={localCategories} state={categoryDialog} onClose={() => setCategoryDialog(null)} onDelete={deleteCategory} onSave={saveCategory}/>) : null}
      {statusConfirm && product ? (<ProductSmallModal closeAriaLabel={t("close")} closeOnBackdrop={false} closeOnEscape={false} footer={<div className="flex justify-end gap-2">
            <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setStatusConfirm(null)}>{t("cancel")}</button>
            {statusConfirm === "archive" ? (<button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => { const action = statusConfirm; setStatusConfirm(null); changeProductStatus(action); }}>{t("archive")}</button>) : (<button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={() => { const action = statusConfirm; setStatusConfirm(null); changeProductStatus(action); }}>{t("delete")}</button>)}
          </div>} onClose={() => setStatusConfirm(null)} size="sm" title={statusConfirm === "archive" ? t("archive") : t("deleteProduct")}>
          <p className="rounded-md border border-border bg-background p-3 text-sm font-semibold">{productName || product.nameEn || product.nameLo}</p>
        </ProductSmallModal>) : null}
      {previewSnapshot ? (<ProductPreviewDrawer isPending={isPending} onClose={() => setPreviewSnapshot(null)} onSave={() => {
            setPreviewSnapshot(null);
            handleSaveClick();
        }} snapshot={previewSnapshot}/>) : null}
      {aliasDrawerUnitId ? (<BarcodeAliasDrawer aliasInput={aliasInput} aliases={barcodeAliases[aliasDrawerUnitId] ?? []} onAddAlias={() => addBarcodeAlias(aliasDrawerUnitId)} onAliasInputChange={setAliasInput} onClose={() => setAliasDrawerUnitId(null)} onRemoveAlias={(aliasIndex) => removeBarcodeAlias(aliasDrawerUnitId, aliasIndex)} onUpdateMainBarcode={(barcodeValue) => updateUnit(aliasDrawerUnitId, { barcode: barcodeValue })} unit={units.find((unit) => unit.id === aliasDrawerUnitId)}/>) : null}
      <input type="hidden" name="status" value={product?.status ?? "active"}/>
      <input type="hidden" name="minStock" value={product?.minStock ?? 0}/>
      <input type="hidden" name="stockDisplayMode" value={product?.stockDisplayMode ?? "base_unit_only"}/>
      <input type="hidden" name="tags" value={product?.tags?.join(", ") ?? ""}/>

      <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
        <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
          {isCreate ? (<>
              <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
                <h2 className="text-base font-semibold">{t("basicProductInformation")}</h2>
                <div className="mt-4 grid gap-3 lg:grid-cols-6">
                  <div className="lg:col-span-6">
                    <Field label={t("productName")}>
                      <input className="field-input" name="productName" value={productName} onChange={(event) => setProductName(event.target.value)} onBlur={(event) => maybeAutofillSkuFromName(event.currentTarget.value)} placeholder={t("productNamePlaceholder")} required/>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label={t("productCode")}>
                      <div className="flex gap-2">
                        <input className="field-input font-mono" name="productCode" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="P-0001"/>
                        <button className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateProductCode} aria-label={t("generateProductCode")}>
                          <RefreshCw aria-hidden="true"/>
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">{t("productCodeHint")}</span>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label={t("sku")}>
                      <div className="flex gap-2">
                        <input className="field-input font-mono" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} required/>
                        <button className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateSku} aria-label={t("autoGenerateSku")}>
                          <RefreshCw aria-hidden="true"/>
                        </button>
                      </div>
                      <span className="text-xs text-muted-foreground">{t("skuHint")}</span>
                    </Field>
                  </div>

                  <div className="lg:col-span-3">
                    <CategoryField categories={localCategories} defaultValue={localCategories[0]?.id} onAction={openCategoryDialog}/>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label={t("supplierName")}>
                      <input className="field-input" name="supplierName" placeholder={t("supplierNamePlaceholder")}/>
                    </Field>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label={t("brandName")}>
                      <input className="field-input" name="brandName" placeholder={t("brandNamePlaceholder")}/>
                    </Field>
                  </div>
                  <div className="lg:col-span-6">
                    <Field label={t("descriptionNotes")}>
                      <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="description" placeholder={t("staffNotesPlaceholder")}/>
                    </Field>
                  </div>
                </div>
              </section>

              <details className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4" open>
                <summary className="cursor-pointer text-sm font-semibold">{t("sellingUnitsBarcodes")}</summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("sellingUnitsHint")}</p>
                {hasInventoryHandoffBarcode ? (<div className="mt-3 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-primary">
                  {t("barcodeFromInventory")}
                </div>) : null}
                <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                  {t("unitPieceHint")}
                </div>
                {checkingBarcodeUnitId ? (<p className="mt-3 text-xs font-semibold text-muted-foreground">{t("checkingBarcode")}</p>) : null}
                {duplicateBarcodeMatch ? (<DuplicateBarcodePanel match={duplicateBarcodeMatch} onDismiss={() => setDuplicateBarcodeMatch(null)}/>) : null}
                <label className="mt-4 flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold">
                  <input className="mt-1" type="checkbox" checked={unitsShareStock} onChange={(event) => setUnitsShareStock(event.target.checked)}/>
                  <span>
                    {t("unitsShareStock")}
                    <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                      {t("unitsShareStockHint")}
                    </span>
                  </span>
                </label>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK_UNIT_NAMES.map((unitName) => (<button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" key={unitName} type="button" onClick={() => addNamedUnit(unitName)}>
                        {displayProductUnitName(unitName)}
                      </button>))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input className="field-input sm:max-w-xs" value={customUnitName} onChange={(event) => setCustomUnitName(event.target.value)} placeholder={t("customUnitPlaceholder")}/>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addCustomUnit}>
                      <Plus aria-hidden="true"/>
                      {t("customPlus")}
                    </button>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addUnit}>
                      <Plus aria-hidden="true"/>
                      {t("addBlankUnit")}
                    </button>
                  </div>
                </div>
                <ProductUnitsTable applyRoundingToAll={applyRoundingToAll} barcodeAliases={barcodeAliases} onConversionInvalidChange={setConversionInvalid} onOpenAlias={(unitId) => {
                    setAliasInput("");
                    setAliasDrawerUnitId(unitId);
                }} onCheckBarcode={checkDuplicateUnitBarcode} onUnitImageChange={changeUnitImage} productImages={productImages} selectedImageId={selectedImageId} unitImageOrigins={unitImageOrigins} units={units} updateUnit={updateUnit} removeUnit={removeUnit}/>
              </details>
              <InitialStockPreview onChange={setInitialStockPreview} units={units} value={initialStockPreview}/>
              <ProductImagesSection assignmentMode={imageAssignmentMode} barcode={barcodeForImageSearch} isPending={isPending} productName={productName} selectedImageId={selectedImageId} onApplyAssignment={applyImageAssignment} onImportSearchResult={importSearchedImage} onRemove={() => {
                setSelectedImageId(undefined);
            }} onPreview={openProductPreview} onSave={handleSaveClick} onSearchMessage={showFeedback} onSetMainImage={setMainProductImage} onToggleUnitAssignment={toggleImageUnitAssignment} onUpload={selectUploadedImage} productImages={productImages} removeProductImage={removeProductImage} saveValidationIssues={saveValidationIssues} units={units}/>
            </>) : (<>
          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("basicProductInformation")}</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
              <Field label={t("productName")}>
                <input className="field-input" name="productName" value={productName} onChange={(event) => setProductName(event.target.value)} onBlur={(event) => maybeAutofillSkuFromName(event.currentTarget.value)} required/>
              </Field>
              </div>
              <Field label={t("productCode")}>
                <div className="flex gap-2">
                  <input className="field-input font-mono" name="productCode" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="P-0001"/>
                  <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateProductCode}>
                    <RefreshCw aria-hidden="true"/>
                    {t("generate")}
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">{t("productCodeHint")}</span>
              </Field>
              <Field label={t("sku")}>
                <div className="flex gap-2">
                  <input className="field-input font-mono" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} required/>
                  <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateSku}>
                    <RefreshCw aria-hidden="true"/>
                    {t("autoGenerateSku")}
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">{t("skuHint")}</span>
              </Field>
                    <CategoryField categories={localCategories} defaultValue={product?.categoryId ?? localCategories[0]?.id} onAction={openCategoryDialog}/>
              <Field label={t("supplierName")}>
                <input className="field-input" name="supplierName" placeholder={t("supplierNamePlaceholder")}/>
              </Field>
              <Field label={t("brandName")}>
                <input className="field-input" name="brandName" placeholder={t("brandNamePlaceholder")}/>
              </Field>
              <div className="md:col-span-2">
                <Field label={t("descriptionNotes")}>
                  <textarea className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="description" defaultValue={product?.description} placeholder={t("staffNotesPlaceholder")}/>
                </Field>
              </div>
            </div>
          </section>

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("sellingUnitsBarcodes")}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("sellingUnitsHint")}</p>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
              {t("unitPieceHint")}
            </div>
            <label className="mt-4 flex items-start gap-3 rounded-md border border-border bg-background p-3 text-sm font-semibold">
              <input className="mt-1" type="checkbox" checked={unitsShareStock} onChange={(event) => setUnitsShareStock(event.target.checked)}/>
              <span>
                {t("unitsShareStock")}
                <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                  {t("unitsShareStockHint")}
                </span>
              </span>
            </label>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_UNIT_NAMES.map((unitName) => (<button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" key={unitName} type="button" onClick={() => addNamedUnit(unitName)}>
                    {displayProductUnitName(unitName)}
                  </button>))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="field-input sm:max-w-xs" value={customUnitName} onChange={(event) => setCustomUnitName(event.target.value)} placeholder={t("customUnitPlaceholder")}/>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addCustomUnit}>
                  <Plus aria-hidden="true"/>
                  {t("customPlus")}
                </button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addUnit}>
                  <Plus aria-hidden="true"/>
                  {t("addBlankUnit")}
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t("conversionWarning")}</p>
            <ProductUnitsTable applyRoundingToAll={applyRoundingToAll} barcodeAliases={barcodeAliases} onConversionInvalidChange={setConversionInvalid} onOpenAlias={(unitId) => {
                setAliasInput("");
                setAliasDrawerUnitId(unitId);
            }} onCheckBarcode={checkDuplicateUnitBarcode} onUnitImageChange={changeUnitImage} productImages={productImages} selectedImageId={selectedImageId} unitImageOrigins={unitImageOrigins} units={units} updateUnit={updateUnit} removeUnit={removeUnit}/>
          </section>
          <ProductImagesSection assignmentMode={imageAssignmentMode} barcode={barcodeForImageSearch} isPending={isPending} productName={productName} selectedImageId={selectedImageId} onApplyAssignment={applyImageAssignment} onImportSearchResult={importSearchedImage} onRemove={() => {
                setSelectedImageId(undefined);
            }} onPreview={openProductPreview} onSave={handleSaveClick} onSearchMessage={showFeedback} onSetMainImage={setMainProductImage} onToggleUnitAssignment={toggleImageUnitAssignment} onUpload={selectUploadedImage} productImages={productImages} removeProductImage={removeProductImage} saveValidationIssues={saveValidationIssues} units={units}/>
          {product ? <ProductHistorySection product={product}/> : null}
          </>)}
        </div>
      </div>
    </form>);
}
function DuplicateBarcodePanel({ match, onDismiss }: {
    match: DuplicateBarcodeMatch;
    onDismiss: () => void;
}) {
    const receivedGoodsHref = `/inventory/quick-stock-in?barcode=${encodeURIComponent(match.matchedBarcode)}`;
    return (
      <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">{t("productAlreadyExists")}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("productAlreadyExistsHint")}
            </p>
          </div>
          <button className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-background transition hover:border-primary" type="button" onClick={onDismiss} aria-label={t("dismissDuplicateBarcode")}>
            <X className="size-4" aria-hidden="true"/>
          </button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-5">
          <PreviewField label={t("product")} value={match.productName || t("existingProduct")}/>
          <PreviewField label={t("productCode")} value={match.productCode || "—"}/>
          <PreviewField label={t("sku")} value={match.sku || "—"}/>
          <PreviewField label={t("matchedUnit")} value={match.matchedUnitName ? displayProductUnitName(match.matchedUnitName) : t("productBarcode")}/>
          <PreviewField label={t("matchedBarcode")} value={match.matchedBarcode}/>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:border-primary" href={`/products/${match.productId}/edit`}>
            {t("viewProduct")}
          </Link>
          <Link className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" href={receivedGoodsHref}>
            {t("receivedGoods")}
          </Link>
        </div>
      </div>
    );
}
function BarcodeAliasDrawer({ aliasInput, aliases, onAddAlias, onAliasInputChange, onClose, onRemoveAlias, onUpdateMainBarcode, unit, }: {
    aliasInput: string;
    aliases: string[];
    onAddAlias: () => void;
    onAliasInputChange: (value: string) => void;
    onClose: () => void;
    onRemoveAlias: (aliasIndex: number) => void;
    onUpdateMainBarcode: (barcodeValue: string) => void;
    unit?: ProductUnit;
}) {
    const unitName = unit?.unitName?.trim() ? displayProductUnitName(unit.unitName.trim()) : t("unit");
    return (<div className="fixed inset-0 z-50 bg-black/50 md:left-72">
      <aside className="ml-auto flex h-full w-full flex-col border-l border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold">{fillProductsCopy(t("manageAliases"), { unit: unitName })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("manageAliasesHint")}</p>
          </div>
          <button className="grid size-10 shrink-0 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onClose} aria-label={t("closeBarcodeAliases")}>
            <X aria-hidden="true" className="size-4"/>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5">
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-base font-semibold">{t("mainBarcode")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("mainBarcodeHint")}</p>
              <input className="field-input mt-4 font-mono" value={unit?.barcode ?? ""} onChange={(event) => onUpdateMainBarcode(event.target.value)} placeholder={t("mainBarcodePlaceholder")}/>
            </section>

            <section className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold">{t("additionalAliases")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t("additionalAliasesHint")}</p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold">{fillProductsCopy(t("aliasesCount"), { count: aliases.length })}</span>
              </div>
              <div className="mt-4 grid gap-2">
                {aliases.length === 0 ? (<div className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">{t("noBarcodeAliases")}</div>) : aliases.map((alias, index) => (<div className="flex items-center gap-2 rounded-md border border-border bg-background p-2" key={`${alias}-${index}`}>
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{alias}</span>
                    <button className="inline-flex h-9 items-center justify-center rounded-md border border-danger px-3 text-xs font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={() => onRemoveAlias(index)}>
                      {t("remove")}
                    </button>
                  </div>))}
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input className="field-input font-mono sm:flex-1" value={aliasInput} onChange={(event) => onAliasInputChange(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        onAddAlias();
                    }
                }} placeholder={t("aliasPlaceholder")}/>
                <button className="inline-flex h-11 items-center justify-center rounded-md border border-primary px-4 text-sm font-semibold text-primary transition hover:bg-primary/10" type="button" onClick={onAddAlias}>
                  {t("addAlias")}
                </button>
              </div>
            </section>

            <section className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning">
              {t("oneBarcodeRule")}
            </section>
            <section className="rounded-lg border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
              {t("aliasLaterPhase")}
            </section>
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-5 py-4">
          <button className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>
      </aside>
    </div>);
}

function ProductPreviewDrawer({ isPending, onClose, onSave, snapshot, }: {
    isPending: boolean;
    onClose: () => void;
    onSave: () => void;
    snapshot: ProductPreviewSnapshot;
}) {
    const baseUnit = snapshot.units.find((unit) => unit.isBaseUnit) ?? snapshot.units[0];
    const receiveUnit = snapshot.units.find((unit) => unit.id === snapshot.initialStock.receiveUnitId) ?? snapshot.units.find((unit) => unit.isPurchaseUnit) ?? baseUnit;
    const convertedBaseQuantity = Math.max(Number(snapshot.initialStock.quantityReceived) || 0, 0) * Math.max(Number(receiveUnit?.conversionQty ?? 1), 1);
    const selectedImage = snapshot.images.find((image) => image.id === snapshot.selectedImageId) ?? snapshot.images[0];
    const readiness = [
        { label: t("productName"), ok: snapshot.basic.productName.trim().length > 0 },
        { label: t("productCode"), ok: snapshot.basic.productCode.trim().length > 0 },
        { label: t("sku"), ok: snapshot.basic.sku.trim().length > 0 },
        { label: t("atLeastOneUnit"), ok: snapshot.units.length > 0 },
        { label: t("defaultSaleUnit"), ok: snapshot.units.some((unit) => unit.isDefaultSaleUnit) },
        { label: t("defaultReceivingUnit"), ok: snapshot.units.some((unit) => unit.isPurchaseUnit) },
        { label: t("barcodeOptional"), ok: true },
    ];
    return (<div className="fixed inset-0 z-50 bg-black/50 md:left-72">
      <aside className="ml-auto flex h-full w-full flex-col border-l border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold">{t("productPreview")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("productPreviewHint")}</p>
          </div>
          <button className="grid size-10 shrink-0 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={onClose} aria-label={t("closePreview")}>
            <X aria-hidden="true" className="size-4"/>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5">
            <PreviewSection title={t("basicProductInformation")}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <PreviewField label={t("productName")} value={snapshot.basic.productName || "—"}/>
                <PreviewField label={t("productCode")} value={snapshot.basic.productCode || "—"}/>
                <PreviewField label={t("sku")} value={snapshot.basic.sku || "—"}/>
                <PreviewField label={t("category")} value={snapshot.basic.category || "—"}/>
                <PreviewField label={t("supplierName")} value={snapshot.basic.supplierName || "—"}/>
                <PreviewField label={t("brandName")} value={snapshot.basic.brandName || "—"}/>
                <div className="md:col-span-2 xl:col-span-3">
                  <PreviewField label={t("descriptionNotes")} value={snapshot.basic.description || "—"}/>
                </div>
              </div>
            </PreviewSection>

            <PreviewSection title={t("sellingUnitsBarcodes")}>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">{t("unit")}</th>
                      <th className="px-3 py-3">{t("pieceQuantity")}</th>
                      <th className="px-3 py-3">{t("barcode")}</th>
                      <th className="px-3 py-3">{t("barcodeAliases")}</th>
                      <th className="px-3 py-3">{t("costLak")}</th>
                      <th className="px-3 py-3">{t("sellingPrice")}</th>
                      <th className="px-3 py-3">{t("base")}</th>
                      <th className="px-3 py-3">{t("defaultSale")}</th>
                      <th className="px-3 py-3">{t("defaultReceiving")}</th>
                      <th className="px-3 py-3">{t("manual")}</th>
                      <th className="px-3 py-3">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.units.length === 0 ? (<tr><td className="px-3 py-5 text-muted-foreground" colSpan={11}>{t("noUnitRows")}</td></tr>) : snapshot.units.map((unit) => (<tr className="border-b border-border last:border-b-0" key={unit.id}>
                        <td className="px-3 py-3 font-semibold">{unit.unitName ? displayProductUnitName(unit.unitName) : t("unnamedUnit")}</td>
                        <td className="px-3 py-3">{hierarchyRelationText(unit, snapshot.units)}</td>
                        <td className="px-3 py-3 font-mono">{unit.barcode || "—"}</td>
                        <td className="px-3 py-3 font-mono">{(snapshot.barcodeAliases[unit.id] ?? []).length > 0 ? snapshot.barcodeAliases[unit.id].join(", ") : "—"}</td>
                        <td className="px-3 py-3">{formatMoney(unit.costPriceLak ?? 0)}</td>
                        <td className="px-3 py-3">{formatMoney(unit.sellingPriceLak)}</td>
                        <td className="px-3 py-3">{unit.isBaseUnit ? t("yes") : t("no")}</td>
                        <td className="px-3 py-3">{unit.isDefaultSaleUnit ? t("yes") : t("no")}</td>
                        <td className="px-3 py-3">{unit.isPurchaseUnit ? t("yes") : t("no")}</td>
                        <td className="px-3 py-3">{unit.allowManualUnitSelect ?? true ? t("yes") : t("no")}</td>
                        <td className="px-3 py-3">{productStatusLabel(unit.status ?? "active")}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
                {t("aliasLaterPhaseShort")}
              </p>
            </PreviewSection>

            <PreviewSection title={t("productImages")}>
              {snapshot.images.length === 0 ? (<p className="rounded-md border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">{t("noImagesSelected")}</p>) : (<div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-lg border border-border bg-background">
                    {selectedImage && isRenderableImage(selectedImage.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={selectedImage.label} className="size-full object-cover" src={selectedImage.url}/>) : (<span className="text-sm text-muted-foreground">{t("noPreview")}</span>)}
                  </div>
                  <div className="grid content-start gap-3">
                    <PreviewField label={t("imageCount")} value={String(snapshot.images.length)}/>
                    <PreviewField label={t("mainImage")} value={selectedImage?.label ?? "—"}/>
                  </div>
                </div>)}
            </PreviewSection>

            <PreviewSection title={t("initialStockLot")}>
              <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
                {t("initialStockPreviewOnly")}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <PreviewField label={t("addOpeningStockNow")} value={snapshot.initialStock.addOpeningStock ? t("yes") : t("no")}/>
                <PreviewField label={t("receiveUnit")} value={receiveUnit?.unitName ? displayProductUnitName(receiveUnit.unitName) : "—"}/>
                <PreviewField label={t("quantityReceived")} value={formatMoney(snapshot.initialStock.quantityReceived)}/>
                <PreviewField label={t("convertedBaseQty")} value={`${formatMoney(convertedBaseQuantity)} ${baseUnit?.unitName ? displayProductUnitName(baseUnit.unitName) : t("unit")}`}/>
                <PreviewField label={t("lotNumber")} value={snapshot.initialStock.lotNumber || "—"}/>
                <PreviewField label={t("expiryDate")} value={snapshot.initialStock.expiryDate || "—"}/>
                <PreviewField label={t("receiveDate")} value={snapshot.initialStock.receiveDate || "—"}/>
                <PreviewField label={t("supplier")} value={snapshot.initialStock.supplier || "—"}/>
                <PreviewField label={t("costLak")} value={formatMoney(snapshot.initialStock.costLak)}/>
                <div className="md:col-span-2 xl:col-span-3">
                  <PreviewField label={t("note")} value={snapshot.initialStock.note || "—"}/>
                </div>
              </div>
            </PreviewSection>

            <PreviewSection title={t("validationReadiness")}>
              <div className="grid gap-2 md:grid-cols-2">
                {readiness.map((item) => (<ReadinessRow key={item.label} label={item.label} ok={item.ok}/>))}
              </div>
            </PreviewSection>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <p className="text-xs leading-5 text-muted-foreground sm:mr-auto sm:max-w-md">
            {t("productSavesOnly")}
          </p>
          <button className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClose}>
            {t("closePreviewEdit")}
          </button>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50" type="button" disabled={isPending} onClick={onSave} data-testid="product-preview-save">
            {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin"/> : <Save aria-hidden="true"/>}
            {isPending ? t("saving") : t("saveProduct")}
          </button>
        </div>
      </aside>
    </div>);
}

function PreviewSection({ children, title }: { children: React.ReactNode; title: string }) {
    return (<section className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>);
}

function ReadinessRow({ label, ok }: { label: string; ok: boolean }) {
    return (<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3 text-sm">
      <span>{label}</span>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ok ? "border-success/40 bg-success/10 text-success" : "border-warning/40 bg-warning/10 text-warning"}`}>
        {ok ? t("ready") : t("missing")}
      </span>
    </div>);
}

function QuantityReceivedField({ onCommit, value }: { onCommit: (quantity: number) => void; value: number }) {
    const [state, setState] = useState(() => openingQtyFromCommitted(value));
    const focusedRef = useRef(false);
    useEffect(() => {
        if (!focusedRef.current) {
            setState(openingQtyFromCommitted(value));
        }
    }, [value]);
    return (
      <input
        autoComplete="off"
        className="field-input"
        data-field="quantity-received"
        inputMode="numeric"
        type="text"
        value={openingQtyDisplay(state)}
        onBlur={() => {
          focusedRef.current = false;
          const next = onOpeningQtyBlur(state);
          setState(next);
          onCommit(next.committed);
        }}
        onChange={(event) => {
          const next = onOpeningQtyChange(state, event.target.value);
          setState(next);
          onCommit(next.committed);
        }}
        onFocus={(event) => {
          focusedRef.current = true;
          setState(onOpeningQtyFocus(state));
          const input = event.currentTarget;
          input.select();
          requestAnimationFrame(() => input.select());
        }}
      />
    );
}

function InitialStockPreview({ onChange, units, value }: {
    onChange: (nextValue: InitialStockPreviewValue) => void;
    units: ProductUnit[];
    value: InitialStockPreviewValue;
}) {
    const receiveUnit = units.find((unit) => unit.id === value.receiveUnitId) ?? units.find((unit) => unit.isPurchaseUnit) ?? units.find((unit) => unit.isBaseUnit) ?? units[0];
    const baseUnitName = units.find((unit) => unit.isBaseUnit)?.unitName;
    const previewQuantity = Math.max(Number(value.quantityReceived) || 0, 0);
    const conversionQty = Math.max(Number(receiveUnit?.conversionQty ?? 1), 1);
    const previewBaseQuantity = previewQuantity * conversionQty;
    function update(patch: Partial<InitialStockPreviewValue>) {
        onChange({ ...value, ...patch });
    }
    return (<section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">{t("initialStockLot")}</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{t("initialStockPreviewHint")}</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold">
          <input type="checkbox" checked={value.addOpeningStock} onChange={(event) => update({ addOpeningStock: event.target.checked })}/>
          {t("addOpeningStockNow")}
        </label>
        <Field label={t("receiveUnit")}>
          <select className="field-input" value={receiveUnit?.id ?? ""} onChange={(event) => update({ receiveUnitId: event.target.value })}>
            {units.map((unit) => (<option key={unit.id} value={unit.id}>{unit.unitName ? displayProductUnitName(unit.unitName) : t("unnamedUnit")}</option>))}
          </select>
        </Field>
        <Field label={t("quantityReceived")}>
          <QuantityReceivedField value={value.quantityReceived} onCommit={(quantityReceived) => update({ quantityReceived })}/>
        </Field>
        <Field label={t("lotNumber")}>
          <input className="field-input" value={value.lotNumber} onChange={(event) => update({ lotNumber: event.target.value })} placeholder={t("previewLotPlaceholder")}/>
        </Field>
        <Field label={t("expiryDate")}>
          <input className="field-input" type="date" value={value.expiryDate} onChange={(event) => update({ expiryDate: event.target.value })}/>
        </Field>
        <Field label={t("receiveDate")}>
          <input className="field-input" type="date" value={value.receiveDate} onChange={(event) => update({ receiveDate: event.target.value })}/>
        </Field>
        <Field label={t("supplier")}>
          <input className="field-input" value={value.supplier} onChange={(event) => update({ supplier: event.target.value })} placeholder={t("previewSupplierPlaceholder")}/>
        </Field>
        <Field label={t("costLak")}>
          <MoneyInput className="h-11" value={value.costLak} onValueChange={(costLak) => update({ costLak })}/>
        </Field>
        <PreviewField label={t("convertedBaseQty")} value={`${formatMoney(previewBaseQuantity)} ${baseUnitName ? displayProductUnitName(baseUnitName) : t("unit")}`}/>
        <div className="md:col-span-3">
          <Field label={t("note")}>
            <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={value.note} onChange={(event) => update({ note: event.target.value })} placeholder={t("previewNotePlaceholder")}/>
          </Field>
        </div>
      </div>
      <p className="mt-4 rounded-md border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
        {t("previewStockLater")}
      </p>
    </section>);
}

function PreviewField({ label, value }: { label: string; value: string }) {
    return (<div className="rounded-md border border-border bg-background p-3">
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>);
}

function ProductUnitsTable({ applyRoundingToAll, barcodeAliases, onCheckBarcode, onConversionInvalidChange: _onConversionInvalidChange, onOpenAlias, onUnitImageChange, productImages, removeUnit, selectedImageId, unitImageOrigins, units, updateUnit, }: {
    applyRoundingToAll: (roundingLak: number) => void;
    barcodeAliases: BarcodeAliasState;
    onCheckBarcode?: (unitId: string, barcode: string) => void;
    onConversionInvalidChange?: (invalid: boolean) => void;
    onOpenAlias: (unitId: string) => void;
    onUnitImageChange: (unitId: string, imageUrl: string | undefined) => void;
    productImages: ProductFormImage[];
    removeUnit: (unitId: string) => void;
    selectedImageId?: string;
    unitImageOrigins: Record<string, UnitImageOrigin>;
    units: ProductUnit[];
    updateUnit: (unitId: string, patch: Partial<ProductUnit>) => void;
}) {
    const [roundingForAll, setRoundingForAll] = useState(0);
    const mainImage = productImages.find((image) => image.id === selectedImageId);
    return (<>
    <p className="mt-4 text-xs text-muted-foreground">{t("tableScrollHint")}</p>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
      <select className="field-input h-10 sm:max-w-56" value={roundingForAll} onChange={(event) => setRoundingForAll(Number(event.target.value))}>
        <option value={0}>{t("noRounding")}</option>
        <option value={500}>{t("roundUp500")}</option>
        <option value={1000}>{t("roundUp1000")}</option>
      </select>
      <button className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => applyRoundingToAll(roundingForAll)}>
        {t("applyRoundingToAllUnits")}
      </button>
    </div>
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full min-w-[1840px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">{t("select")}</th>
            <th className="px-3 py-3">{t("unit")}</th>
            <th className="px-3 py-3">{t("qtyInBase")}</th>
            <th className="px-3 py-3">{t("barcode")}</th>
            <th className="px-3 py-3">{t("costLak")}</th>
            <th className="px-3 py-3">{t("pricingMode")}</th>
            <th className="px-3 py-3">{t("markupPercent")}</th>
            <th className="px-3 py-3">{t("addAmountLak")}</th>
            <th className="px-3 py-3">{t("rounding")}</th>
            <th className="px-3 py-3">{t("priceLak")}</th>
            <th className="px-3 py-3">{t("unitImage")}</th>
            <th className="px-3 py-3">{t("base")}</th>
            <th className="px-3 py-3">{t("defaultSale")}</th>
            <th className="px-3 py-3">{t("defaultReceiving")}</th>
            <th className="px-3 py-3">{t("manual")}</th>
            <th className="px-3 py-3">{t("status")}</th>
            <th className="px-3 py-3 text-right">{t("action")}</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr className="border-b border-border last:border-b-0" key={unit.id}>
              <td className="px-3 py-3">
                <input aria-label={fillProductsCopy(t("enableNamedUnit"), { name: unit.unitName ? displayProductUnitName(unit.unitName) : t("unit") })} type="checkbox" checked={isUnitEnabled(unit)} onChange={(event) => updateUnit(unit.id, { status: event.target.checked ? "active" : "inactive" })}/>
              </td>
              <td className="px-3 py-3">
                <input className="field-input h-10 min-w-32" value={unit.unitName} onChange={(event) => updateUnit(unit.id, { unitName: event.target.value })}/>
              </td>
              <td className="px-3 py-3">
                <HierarchyQtyField
                  ariaLabel={t("qtyInBase")}
                  committed={Number.isFinite(unit.conversionQty) ? unit.conversionQty : null}
                  invalid={isActiveUnitQtyInvalid(unit)}
                  onCommit={(qty) => updateUnit(unit.id, { conversionQty: qty })}
                />
              </td>
              <td className="px-3 py-3">
                <div className="flex min-w-56 items-center gap-2">
                  <input className="field-input h-10 min-w-36 font-mono" data-field="unit-barcode" value={unit.barcode} onBlur={() => onCheckBarcode?.(unit.id, unit.barcode)} onChange={(event) => updateUnit(unit.id, { barcode: event.target.value })} placeholder={t("mainBarcodeShort")}/>
                  <button className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" type="button" onClick={() => onOpenAlias(unit.id)}>
                    {t("plusAlias")}
                  </button>
                  {(barcodeAliases[unit.id]?.length ?? 0) > 0 ? (<span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">{(barcodeAliases[unit.id]?.length ?? 0) === 1 ? t("aliasCountOne") : fillProductsCopy(t("aliasCountMany"), { count: barcodeAliases[unit.id]?.length ?? 0 })}</span>) : null}
                </div>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-28" value={unit.costPriceLak ?? 0} onValueChange={(value) => updateUnit(unit.id, { costPriceLak: value })}/>
              </td>
              <td className="px-3 py-3">
                <select className="field-input h-10 min-w-40" value={unit.pricingMode ?? "manual"} onChange={(event) => updateUnit(unit.id, { pricingMode: event.target.value as ProductUnit["pricingMode"] })}>
                  <option value="manual">{t("manual")}</option>
                  <option value="cost_plus_percent">{t("costPlusPercent")}</option>
                  <option value="cost_plus_amount">{t("costPlusAmount")}</option>
                </select>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-24" value={unit.markupPercent ?? 0} onValueChange={(value) => updateUnit(unit.id, { markupPercent: value })}/>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-28" value={unit.addAmountLak ?? 0} onValueChange={(value) => updateUnit(unit.id, { addAmountLak: value })}/>
              </td>
              <td className="px-3 py-3">
                <select className="field-input h-10 min-w-28" value={unit.roundingLak ?? 0} onChange={(event) => updateUnit(unit.id, { roundingLak: Number(event.target.value) })}>
                  <option value={0}>{t("noRounding")}</option>
                  <option value={500}>{t("roundUp500")}</option>
                  <option value={1000}>{t("roundUp1000")}</option>
                  {unit.roundingLak === 5000 ? <option value={5000}>{t("roundUp5000")}</option> : null}
                </select>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-28" disabled={(unit.pricingMode ?? "manual") !== "manual"} value={unit.sellingPriceLak} onValueChange={(value) => updateUnit(unit.id, { sellingPriceLak: value })}/>
              </td>
              <td className="px-3 py-3">
                {(() => {
                  const display = resolveUnitImageDisplay(unit, productImages, mainImage);
                  return (
                <div className="grid min-w-44 gap-1" data-field="unit-image-cell">
                <div className="flex items-center gap-2">
                  <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-background">
                    {display.image?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="size-full object-cover" decoding="async" src={display.image.url}/>
                    ) : (
                      <ImagePlus aria-hidden="true" className="size-4 text-muted-foreground"/>
                    )}
                  </div>
                  <select className="field-input h-10 min-w-0 flex-1" value={unitImageSelectValue(unit, productImages)} onChange={(event) => onUnitImageChange(unit.id, event.target.value || undefined)}>
                    <option value="">{t("notAssigned")}</option>
                    {productImages.map((image) => (<option key={image.id} value={productImageRef(image)}>{image.label}</option>))}
                  </select>
                </div>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {display.origin === "inherited" || unitImageOrigins[unit.id] === "inherited"
                    ? t("inheritedFromProductImage")
                    : display.origin === "custom" || unitImageOrigins[unit.id] === "custom"
                      ? t("customUnitImage")
                      : display.origin === "fallback"
                        ? t("inheritedFromProductImage")
                        : t("notAssigned")}
                </span>
                </div>
                  );
                })()}
              </td>
              <td className="px-3 py-3">
                <input type="radio" checked={Boolean(unit.isBaseUnit)} onChange={() => updateUnit(unit.id, { isBaseUnit: true, isPurchaseUnit: true })} name="baseUnit"/>
              </td>
              <td className="px-3 py-3">
                <input type="radio" checked={Boolean(unit.isDefaultSaleUnit)} onChange={() => updateUnit(unit.id, { isDefaultSaleUnit: true })} name="defaultSaleUnit"/>
              </td>
              <td className="px-3 py-3">
                <input type="checkbox" checked={Boolean(unit.isPurchaseUnit)} onChange={(event) => updateUnit(unit.id, { isPurchaseUnit: event.target.checked })}/>
              </td>
              <td className="px-3 py-3">
                <input type="checkbox" checked={unit.allowManualUnitSelect ?? true} onChange={(event) => updateUnit(unit.id, { allowManualUnitSelect: event.target.checked })}/>
              </td>
              <td className="px-3 py-3">
                <select className="field-input h-10 min-w-28" value={unit.status ?? "active"} onChange={(event) => updateUnit(unit.id, { status: event.target.value as ProductUnit["status"] })}>
                  <option value="active">{t("active")}</option>
                  <option value="inactive">{t("inactive")}</option>
                </select>
              </td>
              <td className="px-3 py-3 text-right">
                <button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => removeUnit(unit.id)} disabled={unit.isBaseUnit} aria-label={t("removeUnit")}>
                  <Trash2 aria-hidden="true"/>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>);
}

function HierarchyQtyField({ ariaLabel, committed, disabled, invalid, onCommit, }: {
    ariaLabel: string;
    committed: number | null;
    disabled?: boolean;
    invalid?: boolean;
    onCommit: (qty: number) => void;
}) {
    const [draft, setDraft] = useState(committed === null ? "" : String(committed));
    const [error, setError] = useState("");
    const focusedRef = useRef(false);
    useEffect(() => {
        if (!focusedRef.current) {
            setDraft(committed === null ? "" : String(committed));
        }
    }, [committed]);
    function pushDraft(raw: string) {
        const next = onQtyInputChange({
            committed,
            draft: raw,
            error: false,
        }, raw);
        setDraft(next.draft ?? raw);
        setError(next.error ? t("qtyInBaseMustBePositive") : "");
        if (next.committed === null) {
            onCommit(Number.NaN);
            return;
        }
        onCommit(next.committed);
    }
    return (
      <div className="flex flex-col">
        <input
          aria-label={ariaLabel}
          autoComplete="off"
          className="field-input h-10 w-24"
          data-field="qty-in-base"
          data-invalid={invalid || error ? "true" : "false"}
          disabled={disabled}
          inputMode="numeric"
          type="text"
          value={draft}
          onBlur={() => {
            focusedRef.current = false;
            const next = onQtyInputBlur({
              committed,
              draft,
              error: parsePositiveIntQty(draft) === null,
            });
            setError(next.error ? t("qtyInBaseMustBePositive") : "");
          }}
          onChange={(event) => {
            pushDraft(event.target.value);
          }}
          onFocus={(event) => {
            focusedRef.current = true;
            const input = event.currentTarget;
            input.select();
            requestAnimationFrame(() => input.select());
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {error ? <p className="mt-1 text-xs font-semibold text-danger">{error}</p> : null}
      </div>
    );
}

function parseMoney(value: unknown) {
    return parseMoneyDigits(value);
}
function formatMoney(value: unknown) {
    return formatMoneyDigits(value);
}
function MoneyInput({ className = "", defaultValue, disabled, name, onValueChange, required, value, }: {
    className?: string;
    defaultValue?: number;
    disabled?: boolean;
    name?: string;
    onValueChange?: (value: number) => void;
    required?: boolean;
    value?: number;
}) {
    const committed = parseMoneyDigits(value ?? defaultValue ?? 0);
    const [state, setState] = useState(() => moneyInputFromCommitted(committed));
    const focusedRef = useRef(false);
    useEffect(() => {
        if (!focusedRef.current) {
            setState(moneyInputFromCommitted(committed));
        }
    }, [committed]);
    const displayValue = moneyInputDisplay(state);
    return (<>
      {name ? <input name={name} type="hidden" value={committed}/> : null}
      <input
        autoComplete="off"
        className={`field-input ${className}`}
        data-field="money-input"
        disabled={disabled}
        inputMode="numeric"
        required={required}
        value={displayValue}
        onBlur={() => {
          focusedRef.current = false;
          const next = onMoneyInputBlur(state);
          setState(next);
          onValueChange?.(next.committed);
        }}
        onChange={(event) => {
          const next = onMoneyInputChange(state, event.target.value);
          setState(next);
          onValueChange?.(next.committed);
        }}
        onFocus={(event) => {
          if (disabled) return;
          focusedRef.current = true;
          setState(onMoneyInputFocus(state));
          const input = event.currentTarget;
          input.select();
          requestAnimationFrame(() => input.select());
        }}
      />
    </>);
}
function CategoryCrudDialog({ categories, onClose, onDelete, onSave, state, }: {
    categories: Category[];
    onClose: () => void;
    onDelete: (categoryId: string) => void;
    onSave: (input: {
        id?: string;
        nameLo: string;
    }) => void;
    state: Exclude<CategoryDialogState, null>;
}) {
    const category = categories.find((item) => item.id === state.categoryId);
    const [name, setName] = useState(category?.nameLo || category?.nameEn || "");
    useEffect(() => {
        setName(category?.nameLo || category?.nameEn || "");
    }, [category?.id, category?.nameEn, category?.nameLo]);
    const title = state.mode === "add" ? t("addCategory") : state.mode === "edit" ? t("editCategory") : t("deleteCategory");
    const isDelete = state.mode === "delete";
    return (<ProductSmallModal closeAriaLabel={t("close")} closeOnBackdrop={false} closeOnEscape={!isDelete} footer={isDelete ? (<div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
              <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={() => state.categoryId && onDelete(state.categoryId)}>{t("delete")}</button>
            </div>) : (<div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>{t("cancel")}</button>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => onSave({ id: state.mode === "edit" ? state.categoryId : undefined, nameLo: name })}>{t("save")}</button>
            </div>)} onClose={onClose} size="sm" title={title}>
        {isDelete ? (<>
            <p className="text-sm text-muted-foreground">{t("deleteCategoryConfirm")}</p>
            <p className="mt-2 rounded-md border border-border bg-background p-3 text-sm font-semibold">{category?.nameEn || category?.nameLo || t("selectedCategory")}</p>
          </>) : (<Field label={state.mode === "add" ? t("categoryName") : t("currentCategoryName")}>
              <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus/>
            </Field>)}
      </ProductSmallModal>);
}
function ImagePreviewDialog({ image, onClose }: {
    image: ProductFormImage;
    onClose: () => void;
}) {
    return (<ProductSmallModal closeAriaLabel={t("closeImagePreview")} closeOnBackdrop={true} closeOnEscape={true} onClose={onClose} size="xl" title={image.label}>
        <div className="grid place-items-center overflow-hidden rounded-md bg-background p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={image.label} className="max-h-[60vh] max-w-full object-contain" src={image.url}/>
        </div>
      </ProductSmallModal>);
}
function CategoryField({ categories, defaultValue, onAction, }: {
    categories: Category[];
    defaultValue?: string;
    onAction: (mode: "add" | "edit" | "delete", categoryId?: string) => void;
}) {
    const [selectedCategoryId, setSelectedCategoryId] = useState(defaultValue ?? categories[0]?.id ?? "");
    useEffect(() => {
        if (categories.length === 0) {
            setSelectedCategoryId("");
            return;
        }
        if (!categories.some((category) => category.id === selectedCategoryId)) {
            setSelectedCategoryId(defaultValue && categories.some((category) => category.id === defaultValue)
                ? defaultValue
                : categories[0]?.id ?? "");
        }
    }, [categories, defaultValue, selectedCategoryId]);
    const hasSelectedCategory = Boolean(selectedCategoryId);
    return (<div className="flex min-w-0 flex-col gap-2 text-sm font-medium">
      <span>{t("category")}</span>
      <div className="flex min-w-0 overflow-hidden rounded-md border border-border bg-background focus-within:border-primary">
        <select className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" name="categoryId" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
          {categories.map((category) => (<option value={category.id} key={category.id}>
              {category.nameEn} / {category.nameLo}
            </option>))}
        </select>
        <div className="flex shrink-0 border-l border-border">
          <button aria-label={t("addCategory")} className="grid size-11 place-items-center transition hover:bg-card" type="button" onClick={() => onAction("add")}>
            <Plus aria-hidden="true" className="size-4"/>
          </button>
          <button aria-label={t("editCategory")} className="grid size-11 place-items-center border-l border-border transition hover:bg-card disabled:opacity-40" type="button" disabled={!hasSelectedCategory} onClick={() => onAction("edit", selectedCategoryId)}>
            <Pencil aria-hidden="true" className="size-4"/>
          </button>
          <button aria-label={t("deleteCategory")} className="grid size-11 place-items-center border-l border-border text-danger transition hover:bg-danger/10 disabled:opacity-40" type="button" disabled={!hasSelectedCategory} onClick={() => onAction("delete", selectedCategoryId)}>
            <Trash2 aria-hidden="true" className="size-4"/>
          </button>
        </div>
      </div>
    </div>);
}
function ProductImagesSection({ assignmentMode, barcode, isPending = false, onApplyAssignment, onImportSearchResult, onPreview, onRemove, onSave, onSearchMessage, onSetMainImage, onToggleUnitAssignment, onUpload, productImages, productName, removeProductImage, saveValidationIssues = [], selectedImageId, units, }: {
    assignmentMode: ProductImageAssignmentMode | null;
    barcode: string;
    isPending?: boolean;
    onApplyAssignment: (mode: ProductImageAssignmentMode, image?: ProductFormImage) => void;
    onImportSearchResult: (hit: ProductImageSearchHit) => Promise<ProductFormImage>;
    onPreview: (form: HTMLFormElement | null) => void;
    onRemove: () => void;
    onSave: () => void;
    onSearchMessage: (message: string, tone: "success" | "error" | "warning") => void;
    onSetMainImage: (imageUrl: string) => void;
    onToggleUnitAssignment: (imageId: string, unitId: string, assign: boolean) => void;
    onUpload: (file: File | undefined) => void;
    productImages: ProductFormImage[];
    productName: string;
    removeProductImage: (imageUrl: string) => void;
    saveValidationIssues?: string[];
    selectedImageId?: string;
    units: ProductUnit[];
}) {
    const [chooserOpen, setChooserOpen] = useState(false);
    const [searching, setSearching] = useState(false);
    const [importing, setImporting] = useState(false);
    const [previewImage, setPreviewImage] = useState<ProductFormImage | null>(null);
    const [results, setResults] = useState<ProductImageSearchHit[]>([]);
    const [lastQuery, setLastQuery] = useState<string | null>(null);
    const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
    const nameReady = productName.trim().length > 0;
    const barcodeReady = barcode.trim().length > 0;
    const selectedImage = productImages.find((image) => image.id === selectedImageId);

    async function runSearch(source: "name" | "barcode") {
        if (source === "name" && !nameReady) {
            onSearchMessage(t("productNameRequiredForImageSearch"), "error");
            return;
        }
        if (source === "barcode" && !barcodeReady) {
            onSearchMessage(t("barcodeRequiredForImageSearch"), "error");
            return;
        }
        setSearching(true);
        setChooserOpen(false);
        try {
            const result = await searchProductImagesAction({
                barcode,
                productName,
                source,
            });
            if (!result.ok || !result.data) {
                onSearchMessage(localizeProductError(result.error ?? t("imageSearchNotConfigured")), "error");
                setResults([]);
                return;
            }
            setProviderConfigured(result.data.configured);
            setLastQuery(result.data.query);
            setResults(result.data.results);
            if (!result.data.configured) {
                onSearchMessage(t("imageSearchNotConfigured"), "warning");
                return;
            }
            if (result.data.results.length === 0) {
                onSearchMessage(t("noImageSearchResults"), "warning");
            }
        } catch (error) {
            onSearchMessage(localizeProductError(error instanceof Error ? error.message : t("imageSearchNotConfigured")), "error");
            setResults([]);
        } finally {
            setSearching(false);
        }
    }

    async function selectSearchHit(hit: ProductImageSearchHit) {
        setImporting(true);
        try {
            const image = await onImportSearchResult(hit);
            onSearchMessage(fillProductsCopy(t("uploadedForPreview"), { name: image.label }), "success");
        } catch (error) {
            onSearchMessage(localizeProductError(error instanceof Error ? error.message : t("imageOptimizeFailed")), "error");
        } finally {
            setImporting(false);
        }
    }

    return (<section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
      {previewImage ? (<ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)}/>) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t("productImages")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("imageSearchHint")}</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setChooserOpen((open) => !open)} onFocus={() => setChooserOpen(true)}>
          <Search aria-hidden="true" className="size-4"/>
          {t("searchImages")}
        </button>
      </div>

      {chooserOpen ? (
        <div className="mt-4 rounded-lg border border-border bg-background p-4">
          <p className="text-sm font-semibold">{t("chooseImageSearchSource")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button className="rounded-md border border-border px-3 py-2 text-left text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!nameReady} type="button" onClick={() => void runSearch("name")}>
              {t("searchByProductName")}
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{nameReady ? productName.trim() : t("productNameRequiredForImageSearch")}</span>
            </button>
            <button className="rounded-md border border-border px-3 py-2 text-left text-sm font-semibold transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!barcodeReady} type="button" onClick={() => void runSearch("barcode")}>
              {t("searchByBarcode")}
              <span className="mt-1 block text-xs font-normal text-muted-foreground">{barcodeReady ? barcode.trim() : t("barcodeRequiredForImageSearch")}</span>
            </button>
          </div>
        </div>
      ) : null}

      {searching || importing ? (<p className="mt-3 text-sm font-semibold text-muted-foreground">{importing ? t("importingImage") : t("searchingImages")}</p>) : null}
      {providerConfigured === false ? (<p className="mt-3 text-sm text-muted-foreground">{t("imageSearchNotConfigured")}</p>) : null}
      {lastQuery && providerConfigured && results.length === 0 && !searching ? (<p className="mt-3 text-sm text-muted-foreground">{t("noImageSearchResults")}</p>) : null}
      {results.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((hit) => (
            <button className="overflow-hidden rounded-lg border border-border bg-background text-left transition hover:border-primary" disabled={importing} key={hit.id} type="button" onClick={() => void selectSearchHit(hit)}>
              <div className="grid aspect-square place-items-center bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt={hit.title} className="size-full object-cover" decoding="async" loading="lazy" src={hit.thumbnailUrl}/>
              </div>
              <div className="truncate px-2 py-2 text-xs font-semibold">{hit.title}</div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="rounded-lg border border-dashed border-border bg-background p-4">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-card text-center">
            {selectedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt={t("mainProductImage")} className="h-full w-full object-cover" src={selectedImage.url}/>) : (<div className="px-4 text-sm text-muted-foreground">
                <ImagePlus aria-hidden="true" className="mx-auto mb-2"/>
                {t("noImageSelected")}
              </div>)}
          </div>
          <label className="mt-3 flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary">{t("uploadPngJpgWebpGif")}<input accept={t("acceptImages")} className="sr-only" type="file" onChange={(event) => onUpload(event.target.files?.[0])}/>
          </label>
          {selectedImage ? (
            <div className="mt-3 grid gap-2">
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold transition hover:border-primary ${assignmentMode === "all" ? "border-primary bg-primary/10 text-primary" : "border-border"}`} type="button" onClick={() => onApplyAssignment("all", selectedImage)}>
                {t("applyImageToAllUnits")}
              </button>
              <button className={`h-10 rounded-md border px-3 text-sm font-semibold transition hover:border-primary ${assignmentMode === "base" ? "border-primary bg-primary/10 text-primary" : "border-border"}`} type="button" onClick={() => onApplyAssignment("base", selectedImage)}>
                {t("applyImageToBaseUnitOnly")}
              </button>
            </div>
          ) : null}
          {selectedImageId ? (<button className="mt-2 h-10 w-full rounded-md border border-danger text-sm font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={onRemove}>
              {t("removeSelectedImage")}
            </button>) : null}
          <p className="mt-3 text-xs text-muted-foreground">{t("mainImageHint")}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{t("uploadedImages")}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("uploadedImagesHint")}</p>
            </div>
            <span className="text-xs text-muted-foreground">{fillProductsCopy(t("imageCountLabel"), { count: productImages.length })}</span>
          </div>
          {productImages.length === 0 ? (<div className="mt-4 grid min-h-36 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t("noProductImagesYet")}</div>) : (<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {productImages.map((image) => {
                const assignableUnits = activeAssignableUnits(units);
                return (<div className="rounded-lg border border-border bg-card p-3" data-field="uploaded-image-card" key={image.id}>
                    <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-background">
                      <button className="size-full" type="button" onClick={() => setPreviewImage(image)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={image.label} className="size-full object-cover" decoding="async" loading="lazy" src={image.url}/>
                      </button>
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold">{image.label}</div>
                    <div className="mt-2 grid gap-1" data-field="unit-image-assignment">
                      {assignableUnits.length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t("notAssigned")}</p>
                      ) : assignableUnits.map((unit) => {
                        const checked = unitUsesProductImage(unit, image);
                        const label = unit.unitName ? displayProductUnitName(unit.unitName) : t("unnamedUnit");
                        return (
                          <label className="flex items-center gap-2 text-xs font-semibold" key={`${image.id}-${unit.id}`}>
                            <input
                              checked={checked}
                              data-unit-id={unit.id}
                              type="checkbox"
                              onChange={(event) => onToggleUnitAssignment(image.id, unit.id, event.target.checked)}
                            />
                            <span>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                    <button className="mt-2 h-9 w-full rounded-md border border-border text-xs font-semibold transition hover:border-primary" type="button" onClick={() => {
                        onSetMainImage(image.id);
                        onSearchMessage(fillProductsCopy(t("setMainImageMessage"), { name: image.label }), "success");
                    }}>
                      {t("setAsMainImage")}
                    </button>
                    <button className="mt-2 h-9 w-full rounded-md border border-danger text-xs font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={() => removeProductImage(image.id)}>
                      {t("removeImage")}
                    </button>
                  </div>);
            })}
            </div>)}
          {saveValidationIssues.length > 0 ? (
            <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert" data-testid="product-save-validation-summary">
              <p className="font-semibold">{t("unableToSaveProduct")}</p>
              <p className="mt-1">{t("pleaseCompleteRequired")}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {saveValidationIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" href="/products">
              {t("cancel")}
            </Link>
            <button className="inline-flex h-11 items-center justify-center rounded-md border border-primary px-5 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-50" type="button" disabled={isPending} onClick={(event) => onPreview(event.currentTarget.form)}>
              {t("previewProduct")}
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50" type="button" disabled={isPending} onClick={onSave} data-testid="product-save-button" aria-busy={isPending}>
              {isPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin"/> : <Save aria-hidden="true"/>}
              {isPending ? t("saving") : t("saveProduct")}
            </button>
          </div>
        </div>
      </div>
    </section>);
}
function ProductHistorySection({ product }: {
    product: Product;
}) {
    return (<section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{t("productHistory")}</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <HistoryList emptyText={t("noPriceHistory")} items={(product.priceHistory ?? []).map((entry) => ({
            detail: `${entry.unitName ? displayProductUnitName(entry.unitName) : t("product")}: ${formatMoney(entry.oldPrice)} → ${formatMoney(entry.newPrice)}`,
            meta: entry.changedBy ?? t("currentUser"),
            time: entry.createdAt,
        }))} title={t("priceHistory")}/>
        <HistoryList emptyText={t("noBarcodeHistory")} items={(product.barcodeHistory ?? []).map((entry) => ({
            detail: `${entry.unitName ? displayProductUnitName(entry.unitName) : t("product")}: ${entry.oldBarcode || "-"} → ${entry.newBarcode || "-"}`,
            meta: entry.changedBy ?? t("currentUser"),
            time: entry.createdAt,
        }))} title={t("barcodeHistory")}/>
      </div>
    </section>);
}
function HistoryList({ emptyText, items, title, }: {
    emptyText: string;
    items: Array<{
        detail: string;
        meta: string;
        time: string;
    }>;
    title: string;
}) {
    return (<div className="rounded-lg border border-border bg-background p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (<p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>) : (<div className="mt-3 grid gap-2">
          {items.slice(0, 8).map((item, index) => (<div className="rounded-md border border-border bg-card p-3 text-sm" key={`${item.time}-${index}`}>
              <div className="font-semibold">{item.detail}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatHistoryDate(item.time)} · {item.meta}
              </div>
            </div>))}
        </div>)}
    </div>);
}
function formatHistoryDate(value: string) {
    if (!value)
        return "-";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(value));
}
function Field({ children, label, }: {
    children: React.ReactNode;
    label: string;
}) {
    return (<label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>);
}
function isRenderableImage(imageUrl?: string) {
    return isRenderableImageUrl(imageUrl);
}
