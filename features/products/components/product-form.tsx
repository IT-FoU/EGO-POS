"use client";

import { t } from "@/lib/i18n/ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Barcode, Camera, ImagePlus, Pencil, Plus, RefreshCw, Save, Search, Trash2, Usb, X, } from "lucide-react";
import type { Category, MockProductImage, Product, ProductUnit, } from "@/features/products/types";
import { duplicateProductAction, archiveProductAction, createProductAction, deleteProductAction, deleteCategoryAction, updateProductAction, upsertCategoryAction, } from "@/features/products/actions";
const QUICK_UNIT_NAMES = [
    "Piece",
    "Bottle",
    "Can",
    "Bag",
    "Pack",
    "Carton",
    "Box",
    "Tray",
    "Bundle",
    "Case",
];
type ProductFormImage = {
    id: string;
    label: string;
    url: string;
};
type CategoryDialogState = {
    mode: "add" | "edit" | "delete";
    categoryId?: string;
} | null;
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
export function ProductForm({ mode, product, categories, images: _images, }: {
    mode: "create" | "edit";
    product?: Product;
    categories: Category[];
    images: MockProductImage[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [barcode, setBarcode] = useState(product?.barcode ?? "");
    const [sku, setSku] = useState(product?.sku ?? "");
    const [productCode, setProductCode] = useState(product?.productCode ?? "");
    const [productName, setProductName] = useState(product?.nameEn || product?.nameLo || "");
    const [selectedImageId, setSelectedImageId] = useState<string | undefined>(product?.imageUrl);
    const [productImages, setProductImages] = useState<ProductFormImage[]>(() => {
        const initialImages: ProductFormImage[] = [];
        if (product?.imageUrl) {
            initialImages.push({ id: "product-main-image", label: "Main product image", url: product.imageUrl });
        }
        for (const unit of product?.units ?? []) {
            if (unit.imageUrl && !initialImages.some((image) => image.url === unit.imageUrl)) {
                initialImages.push({ id: `unit-image-${unit.id}`, label: `${unit.unitName} image`, url: unit.imageUrl });
            }
        }
        return initialImages;
    });
    const [customUnitName, setCustomUnitName] = useState("");
    const [categoryDialog, setCategoryDialog] = useState<CategoryDialogState>(null);
    const [localCategories, setLocalCategories] = useState<Category[]>([]);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [units, setUnits] = useState<ProductUnit[]>(product?.units ?? [
        {
            ...emptyUnit,
            id: "unit-base",
            unitName: "Piece",
            isBaseUnit: true,
            isDefaultSaleUnit: true,
            isPurchaseUnit: true,
            sortOrder: 0,
        },
    ]);
    const [message, setMessage] = useState<string | null>(null);
    const isCreate = mode === "create";
    useEffect(() => {
        setLocalCategories(categories);
    }, [categories]);
    function updateUnit(unitId: string, patch: Partial<ProductUnit>) {
        setUnits((current) => current.map((unit) => {
            if (unit.id !== unitId) {
                return {
                    ...unit,
                    ...(patch.isBaseUnit ? { isBaseUnit: false } : {}),
                    ...(patch.isDefaultSaleUnit ? { isDefaultSaleUnit: false } : {}),
                };
            }
            return { ...unit, ...patch };
        }));
    }
    function addUnit() {
        addNamedUnit("");
    }
    function addNamedUnit(unitName: string) {
        setUnits((current) => [
            ...current,
            {
                ...emptyUnit,
                id: `unit-${Date.now()}-${current.length}`,
                unitName,
                sortOrder: current.length,
            },
        ]);
    }
    function addCustomUnit() {
        const nextName = customUnitName.trim();
        if (!nextName)
            return;
        addNamedUnit(nextName);
        setCustomUnitName("");
    }
    function generateSku() {
        const timestamp = Date.now().toString().slice(-5);
        setSku(`IGO-${timestamp}`);
    }
    function generateProductCode() {
        const timestamp = Date.now().toString().slice(-4);
        setProductCode(`P-${timestamp}`);
    }
    function simulateCameraScan() {
        const scannedBarcode = `885${Date.now().toString().slice(-10)}`;
        setBarcode(scannedBarcode);
        setUnits((current) => current.map((unit) => unit.isBaseUnit ? { ...unit, barcode: scannedBarcode } : unit));
        setIsScannerOpen(false);
        setMessage(t("ui.camera.scan.simulated.barcode.field.was.auto"));
    }
    function removeUnit(unitId: string) {
        setUnits((current) => current.filter((unit) => unit.id !== unitId || unit.isBaseUnit));
    }
    function openCategoryDialog(mode: "add" | "edit" | "delete", categoryId?: string) {
        setCategoryDialog({ mode, categoryId });
    }
    function selectUploadedImage(file: File | undefined) {
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = () => {
            const url = String(reader.result ?? "");
            const image = {
                id: `uploaded-${Date.now()}`,
                label: file.name,
                url,
            };
            setProductImages((current) => [...current, image]);
            setSelectedImageId(url);
            setMessage(`${file.name} uploaded for preview.`);
        };
        reader.readAsDataURL(file);
    }
    function removeProductImage(imageUrl: string) {
        setProductImages((current) => current.filter((image) => image.url !== imageUrl));
        if (selectedImageId === imageUrl) {
            setSelectedImageId(undefined);
        }
        setUnits((current) => current.map((unit) => unit.imageUrl === imageUrl ? { ...unit, imageUrl: undefined } : unit));
    }
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const tags = String(formData.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        const costPriceLak = parseMoney(formData.get("costPriceLak"));
        const sellingPriceLak = parseMoney(formData.get("sellingPriceLak"));
        const visibleUnits = units.filter((unit) => unit.unitName.trim().length > 0);
        const hasBaseUnit = visibleUnits.some((unit) => unit.isBaseUnit);
        const productUnits = (visibleUnits.length > 0 ? visibleUnits : [{
                ...emptyUnit,
                barcode,
                isBaseUnit: true,
                sellingPriceLak,
                unitName: "Piece",
            }]).map((unit, index) => {
            const conversionQty = Math.max(Number(unit.conversionQty) || 1, 1);
            const isBaseUnit = hasBaseUnit ? unit.isBaseUnit : index === 0;
            const unitPrice = Number(unit.sellingPriceLak) || (isBaseUnit ? sellingPriceLak : sellingPriceLak * conversionQty);
            return {
                barcode: unit.barcode.trim() || undefined,
                allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
                addAmountLak: parseMoney(unit.addAmountLak) || undefined,
                conversionQty,
                costPriceLak: parseMoney(unit.costPriceLak) || undefined,
                id: unit.id.startsWith("unit-") ? undefined : unit.id,
                imageUrl: unit.imageUrl || undefined,
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
        const payload = {
            barcode,
            brandId: String(formData.get("brandId") ?? "").trim() || undefined,
            categoryId: String(formData.get("categoryId") ?? "").trim() || undefined,
            costPriceLak,
            description: String(formData.get("description") ?? "").trim() || undefined,
            imageUrl: selectedImageId,
            minStock: Number(formData.get("minStock") ?? 0),
            nameEn: String(formData.get("productName") ?? "").trim(),
            nameLo: String(formData.get("productName") ?? "").trim(),
            productCode,
            sellingPriceLak,
            sku,
            status: String(formData.get("status") ?? "active"),
            stockDisplayMode: String(formData.get("stockDisplayMode") ?? "base_unit_only") as "base_unit_only" | "breakdown",
            supplierId: String(formData.get("supplierId") ?? "").trim() || undefined,
            tags,
            units: productUnits,
        };
        if (mode === "create") {
            startTransition(async () => {
                const result = await createProductAction(payload);
                if (!result.ok) {
                    setMessage(result.error ?? t("ui.product.save.failed"));
                    return;
                }
                setMessage(t("ui.product.saved.successfully"));
                router.refresh();
                router.push("/products");
            });
            return;
        }
        if (product) {
            startTransition(async () => {
                const result = await updateProductAction(product.id, payload);
                if (!result.ok) {
                    setMessage(result.error ?? t("ui.product.save.failed"));
                    return;
                }
                setMessage(t("ui.product.saved.successfully"));
                router.refresh();
                router.push("/products");
            });
            return;
        }
        setMessage(t("ui.product.save.failed"));
    }
    function duplicateProduct() {
        if (!product)
            return;
        startTransition(async () => {
            const result = await duplicateProductAction(product.id);
            if (!result.ok) {
                setMessage(result.error ?? t("ui.duplicate.product.failed"));
                return;
            }
            setMessage(t("ui.product.duplicated.successfully.barcode.sku."));
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
            setMessage(t("ui.category.save.failed"));
            return;
        }
        startTransition(async () => {
            const result = await upsertCategoryAction({
                id: input.id,
                nameEn: nextName,
                nameLo: nextName,
            });
            if (!result.ok) {
                setMessage(result.error ?? t("ui.category.save.failed"));
                return;
            }
            setMessage(t("ui.category.saved.successfully"));
            setCategoryDialog(null);
            router.refresh();
        });
    }
    function deleteCategory(categoryId: string) {
        startTransition(async () => {
            const result = await deleteCategoryAction(categoryId);
            if (!result.ok) {
                setMessage(result.error ?? "Cannot delete category because products still use it.");
                return;
            }
            setLocalCategories((current) => current.filter((category) => category.id !== categoryId));
            setMessage(t("ui.category.deleted.successfully"));
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
                setMessage(result.error ?? t("ui.product.save.failed"));
                return;
            }
            setMessage(action === "archive" ? t("ui.product.archived.successfully") : t("ui.product.deleted.successfully"));
            router.refresh();
            router.push("/products");
        });
    }
    return (<form className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden" onSubmit={handleSubmit}>
      <div className="sticky top-[73px] z-20 -mx-1 flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-background/95 px-1 py-3 backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/products">
            <ArrowLeft aria-hidden="true"/>
            Back to products
          </Link>
          <h1 className={isCreate ? "mt-2 text-2xl font-semibold" : "mt-3 text-3xl font-semibold"}>
            {mode === "create" ? "Create product" : "Edit product"}
          </h1>
          {!isCreate ? (<p className="mt-2 text-sm text-muted-foreground">{t("ui.lao.and.english.names.barcode.sku.lak.pricin")}</p>) : null}
        </div>
        {mode === "edit" && product ? (<div className="flex flex-wrap gap-2">
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary disabled:opacity-50" type="button" disabled={isPending} onClick={duplicateProduct}>
              Duplicate Product
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-warning disabled:opacity-50" type="button" disabled={isPending} onClick={() => changeProductStatus("archive")}>
              Archive
            </button>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-danger px-4 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-50" type="button" disabled={isPending} onClick={() => changeProductStatus("delete")}>
              Delete
            </button>
          </div>) : null}
      </div>

      {isScannerOpen ? (<BarcodeScannerModal onClose={() => setIsScannerOpen(false)} onScan={simulateCameraScan}/>) : null}

      {message ? (<div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>) : null}
      {categoryDialog ? (<CategoryCrudDialog categories={localCategories} state={categoryDialog} onClose={() => setCategoryDialog(null)} onDelete={deleteCategory} onSave={saveCategory}/>) : null}

      <div className="grid min-w-0 max-w-full gap-4 overflow-x-hidden">
        <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
          {isCreate ? (<>
              <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
                <h2 className="text-base font-semibold">Product information</h2>
                <div className="mt-4 grid gap-3 lg:grid-cols-6">
                  <div className="lg:col-span-6">
                    <Field label="Product Name">
                      <input className="field-input" name="productName" value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Main product display name" required/>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label="Product code">
                      <div className="flex gap-2">
                        <input className="field-input font-mono" name="productCode" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="P-0001"/>
                        <button className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateProductCode} aria-label="Generate product code">
                          <RefreshCw aria-hidden="true"/>
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label="Barcode">
                      <div className="flex gap-2">
                        <div className="relative min-w-0 flex-1">
                          <Barcode aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                          <input className="field-input pl-10" name="barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan or type"/>
                        </div>
                        <button className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setIsScannerOpen(true)} aria-label="Scan barcode">
                          <Camera aria-hidden="true"/>
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label="SKU">
                      <div className="flex gap-2">
                        <input className="field-input font-mono" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} required/>
                        <button className="inline-flex h-11 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateSku} aria-label="Auto-generate SKU">
                          <RefreshCw aria-hidden="true"/>
                        </button>
                      </div>
                    </Field>
                  </div>

                  <div className="lg:col-span-3">
                    <CategoryField categories={localCategories} defaultValue={localCategories[0]?.id} onAction={openCategoryDialog}/>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label="Status">
                      <select className="field-input" name="status" defaultValue="active">
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </Field>
                  </div>

                  <div className="lg:col-span-3">
                    <Field label="Supplier Name">
                      <input className="field-input" name="supplierId" placeholder="Supplier name"/>
                    </Field>
                  </div>
                  <div className="lg:col-span-3">
                    <Field label="Brand">
                      <input className="field-input" name="brandId" placeholder="Brand ID"/>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label="Cost Price">
                      <MoneyInput name="costPriceLak" defaultValue={0} required/>
                    </Field>
                  </div>
                  <div className="lg:col-span-2">
                    <Field label="Selling Price">
                      <MoneyInput name="sellingPriceLak" defaultValue={0} required/>
                    </Field>
                  </div>
                  <div className="lg:col-span-2">
                    <Field label="Unit">
                      <input className="field-input" value={units.find((unit) => unit.isBaseUnit)?.unitName ?? "Piece"} onChange={(event) => {
                const baseUnit = units.find((unit) => unit.isBaseUnit);
                if (baseUnit)
                    updateUnit(baseUnit.id, { unitName: event.target.value });
            }}/>
                    </Field>
                  </div>

                  <div className="lg:col-span-2">
                    <Field label="Stock">
                      <input className="field-input" name="openingStock" type="number" min="0" placeholder="Stock-in after save"/>
                    </Field>
                  </div>
                  <div className="lg:col-span-2">
                    <Field label="Low Stock Alert">
                      <input className="field-input" name="minStock" type="number" min="0" defaultValue={0}/>
                    </Field>
                  </div>
                  <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold lg:col-span-2 lg:self-end">
                    <input name="expiryEnabled" type="checkbox"/>
                    Expiry Enabled
                  </label>
                  <div className="lg:col-span-3">
                    <Field label="Stock Display Mode">
                      <select className="field-input" name="stockDisplayMode" defaultValue="base_unit_only">
                        <option value="base_unit_only">Base Unit Only</option>
                        <option value="breakdown">Breakdown</option>
                      </select>
                    </Field>
                  </div>
                </div>
              </section>

              <details className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-semibold">Advanced product details</summary>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <Field label="Expiry Date">
                    <input className="field-input" name="expiryDate" type="date"/>
                  </Field>
                  <Field label="Product tags">
                    <input className="field-input" name="tags" placeholder={t("ui.drink.cold.can")}/>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Internal Notes">
                      <textarea className="min-h-20 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="description" placeholder="Staff notes only"/>
                    </Field>
                  </div>
                </div>
              </details>

              <details className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4" open>
                <summary className="cursor-pointer text-sm font-semibold">Product units</summary>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {QUICK_UNIT_NAMES.map((unitName) => (<button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" key={unitName} type="button" onClick={() => addNamedUnit(unitName)}>
                        {unitName}
                      </button>))}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input className="field-input sm:max-w-xs" value={customUnitName} onChange={(event) => setCustomUnitName(event.target.value)} placeholder="Custom unit name"/>
                    <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addCustomUnit}>
                      <Plus aria-hidden="true"/>
                      Add custom unit
                    </button>
                  </div>
                  <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addUnit}>
                    <Plus aria-hidden="true"/>
                    Add blank unit
                  </button>
                </div>
                <ProductUnitsTable units={units} updateUnit={updateUnit} removeUnit={removeUnit}/>
              </details>
              <ProductImagesSection barcode={barcode} productName={productName} selectedImageId={selectedImageId} onRemove={() => {
                setSelectedImageId(undefined);
            }} onSearchMessage={setMessage} onSetMainImage={setSelectedImageId} onUpload={selectUploadedImage} productImages={productImages} removeProductImage={removeProductImage} units={units} updateUnit={updateUnit}/>
            </>) : (<>
          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">General</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
              <Field label="Product Name">
                <input className="field-input" name="productName" value={productName} onChange={(event) => setProductName(event.target.value)} required/>
              </Field>
              </div>
              <Field label="Product code">
                <div className="flex gap-2">
                  <input className="field-input font-mono" name="productCode" value={productCode} onChange={(event) => setProductCode(event.target.value)} placeholder="P-0001"/>
                  <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateProductCode}>
                    <RefreshCw aria-hidden="true"/>
                    Generate
                  </button>
                </div>
              </Field>
              <Field label="Barcode">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Barcode aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                    <input className="field-input pl-10" name="barcode" value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="Scan or type barcode" required/>
                  </div>
                  <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={() => setIsScannerOpen(true)}>
                    <Camera aria-hidden="true"/>
                    Scan
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Usb aria-hidden="true"/>{t("ui.usb.scanners.are.supported.by.focusing.this.")}</div>
              </Field>
              <Field label="SKU">
                <div className="flex gap-2">
                  <input className="field-input font-mono" name="sku" value={sku} onChange={(event) => setSku(event.target.value)} required/>
                  <button className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary" type="button" onClick={generateSku}>
                    <RefreshCw aria-hidden="true"/>
                    Auto-generate SKU
                  </button>
                </div>
              </Field>
                    <CategoryField categories={localCategories} defaultValue={product?.categoryId ?? localCategories[0]?.id} onAction={openCategoryDialog}/>
              <Field label="Product status">
                <select className="field-input" name="status" defaultValue={product?.status ?? "active"}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Field label="Brand">
                <input className="field-input" name="brandId" placeholder="Brand ID"/>
              </Field>
              <Field label="Supplier Name">
                <input className="field-input" name="supplierId" placeholder="Supplier name"/>
              </Field>
              <Field label="Product tags">
                <input className="field-input" name="tags" defaultValue={product?.tags?.join(", ")} placeholder={t("ui.drink.cold.can")}/>
              </Field>
              <Field label="Minimum stock level">
                <input className="field-input" name="minStock" type="number" min="0" defaultValue={product?.minStock ?? 0}/>
              </Field>
              <Field label="Stock display mode">
                <select className="field-input" name="stockDisplayMode" defaultValue={product?.stockDisplayMode ?? "base_unit_only"}>
                  <option value="base_unit_only">Base Unit Only</option>
                  <option value="breakdown">Breakdown</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field label="Internal Notes">
                  <textarea className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="description" defaultValue={product?.description} placeholder="Staff notes only"/>
                </Field>
              </div>
            </div>
          </section>

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Pricing</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Cost price LAK">
                <MoneyInput name="costPriceLak" defaultValue={product?.costPriceLak ?? 0} required/>
              </Field>
              <Field label="Selling price LAK">
                <MoneyInput name="sellingPriceLak" defaultValue={product?.sellingPriceLak ?? 0} required/>
              </Field>
            </div>
          </section>

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">Stock and expiry setup</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Opening stock">
                <input className="field-input" name="openingStock" type="number" min="0" placeholder="Handled by stock-in after save"/>
              </Field>
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm font-semibold">
                <input name="expiryEnabled" type="checkbox"/>
                Expiry enabled
              </label>
              <Field label="Expiry date">
                <input className="field-input" name="expiryDate" type="date"/>
              </Field>
            </div>
          </section>

          <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Product units</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("ui.base.unit.plus.pack.carton.conversions.for.b")}</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_UNIT_NAMES.map((unitName) => (<button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:border-primary" key={unitName} type="button" onClick={() => addNamedUnit(unitName)}>
                    {unitName}
                  </button>))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="field-input sm:max-w-xs" value={customUnitName} onChange={(event) => setCustomUnitName(event.target.value)} placeholder="Custom unit name"/>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addCustomUnit}>
                  <Plus aria-hidden="true"/>
                  Add custom unit
                </button>
                <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={addUnit}>
                  <Plus aria-hidden="true"/>
                  Add blank unit
                </button>
              </div>
            </div>
            <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning">{t("ui.changing.conversion.values.on.products.with.")}</p>
            <ProductUnitsTable units={units} updateUnit={updateUnit} removeUnit={removeUnit}/>
          </section>
          <ProductImagesSection barcode={barcode} productName={productName} selectedImageId={selectedImageId} onRemove={() => {
                setSelectedImageId(undefined);
            }} onSearchMessage={setMessage} onSetMainImage={setSelectedImageId} onUpload={selectUploadedImage} productImages={productImages} removeProductImage={removeProductImage} units={units} updateUnit={updateUnit}/>
          {product ? <ProductHistorySection product={product}/> : null}
          </>)}
        </div>
      </div>
    </form>);
}
function ProductUnitsTable({ removeUnit, units, updateUnit, }: {
    removeUnit: (unitId: string) => void;
    units: ProductUnit[];
    updateUnit: (unitId: string, patch: Partial<ProductUnit>) => void;
}) {
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
    const [templateMode, setTemplateMode] = useState<"cost_plus_percent" | "cost_plus_amount">("cost_plus_percent");
    const [templateMarkupPercent, setTemplateMarkupPercent] = useState(30);
    const [templateAddAmountLak, setTemplateAddAmountLak] = useState(0);
    const [templateRoundingLak, setTemplateRoundingLak] = useState(0);
    const [templateTarget, setTemplateTarget] = useState<"all" | "selected">("all");
    function updatePricing(unit: ProductUnit, patch: Partial<ProductUnit>) {
        const nextUnit = { ...unit, ...patch };
        const shouldCalculate = patch.costPriceLak !== undefined ||
            patch.markupPercent !== undefined ||
            patch.addAmountLak !== undefined ||
            patch.pricingMode !== undefined ||
            patch.roundingLak !== undefined;
        if (shouldCalculate && nextUnit.pricingMode !== "manual") {
            patch.sellingPriceLak = calculateSellingPrice(nextUnit);
        }
        updateUnit(unit.id, patch);
    }
    function toggleSelectedUnit(unitId: string) {
        setSelectedUnitIds((current) => current.includes(unitId)
            ? current.filter((id) => id !== unitId)
            : [...current, unitId]);
    }
    function applyPriceTemplate() {
        const targetUnits = units.filter((unit) => templateTarget === "all"
            ? unit.status !== "inactive"
            : selectedUnitIds.includes(unit.id));
        for (const unit of targetUnits) {
            const patch: Partial<ProductUnit> = {
                addAmountLak: templateMode === "cost_plus_amount" ? templateAddAmountLak : unit.addAmountLak,
                markupPercent: templateMode === "cost_plus_percent" ? templateMarkupPercent : unit.markupPercent,
                pricingMode: templateMode,
                roundingLak: templateRoundingLak,
            };
            patch.sellingPriceLak = calculateSellingPrice({ ...unit, ...patch });
            updateUnit(unit.id, patch);
        }
    }
    const previewUnits = units
        .filter((unit) => templateTarget === "all" ? unit.status !== "inactive" : selectedUnitIds.includes(unit.id))
        .slice(0, 6)
        .map((unit) => {
        const patch: Partial<ProductUnit> = {
            addAmountLak: templateMode === "cost_plus_amount" ? templateAddAmountLak : unit.addAmountLak,
            markupPercent: templateMode === "cost_plus_percent" ? templateMarkupPercent : unit.markupPercent,
            pricingMode: templateMode,
            roundingLak: templateRoundingLak,
        };
        return {
            nextPrice: calculateSellingPrice({ ...unit, ...patch }),
            unit,
        };
    });
    return (<>
    <section className="mt-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Price Template</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.quickly.calculate.selling.prices.for.all.act")}</p>
        </div>
        <Field label="Template Mode">
          <select className="field-input h-10 min-w-40" value={templateMode} onChange={(event) => setTemplateMode(event.target.value as typeof templateMode)}>
            <option value="cost_plus_percent">{t("ui.cost")}</option>
            <option value="cost_plus_amount">{t("ui.cost.amount")}</option>
          </select>
        </Field>
        {templateMode === "cost_plus_percent" ? (<Field label={t("ui.markup")}>
            <MoneyInput className="h-10 w-28" value={templateMarkupPercent} onValueChange={setTemplateMarkupPercent}/>
          </Field>) : (<Field label="Add Amount LAK">
            <MoneyInput className="h-10 w-36" value={templateAddAmountLak} onValueChange={setTemplateAddAmountLak}/>
          </Field>)}
        <Field label="Rounding">
          <select className="field-input h-10 min-w-44" value={templateRoundingLak} onChange={(event) => setTemplateRoundingLak(Number(event.target.value))}>
            <option value={0}>No rounding</option>
            <option value={500}>Nearest 500 LAK</option>
            <option value={1000}>{t("ui.nearest.1.000.lak")}</option>
            <option value={5000}>{t("ui.nearest.5.000.lak")}</option>
          </select>
        </Field>
        <Field label="Apply Target">
          <select className="field-input h-10 min-w-44" value={templateTarget} onChange={(event) => setTemplateTarget(event.target.value as typeof templateTarget)}>
            <option value="all">Apply to all units</option>
            <option value="selected">Apply to selected units only</option>
          </select>
        </Field>
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={applyPriceTemplate}>
          Apply
        </button>
      </div>
      <div className="mt-3 rounded-md border border-border bg-card p-3">
        <div className="text-xs font-semibold uppercase text-muted-foreground">Preview Calculation</div>
        {previewUnits.length > 0 ? (<div className="mt-2 grid gap-2 md:grid-cols-3">
            {previewUnits.map(({ nextPrice, unit }) => (<div className="rounded-md border border-border bg-background p-2 text-xs" key={unit.id}>
                <div className="font-semibold">{unit.unitName || "Unnamed unit"}</div>
                <div className="mt-1 text-muted-foreground">
                  {formatMoney(unit.costPriceLak ?? 0)} → <span className="font-semibold text-foreground">{formatMoney(nextPrice)}</span>
                </div>
              </div>))}
          </div>) : (<div className="mt-2 text-xs text-muted-foreground">{t("ui.select.units.to.preview.calculation")}</div>)}
      </div>
    </section>
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[1420px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Select</th>
            <th className="px-3 py-3">Unit</th>
            <th className="px-3 py-3">Qty in Base</th>
            <th className="px-3 py-3">Barcode</th>
            <th className="px-3 py-3">Cost LAK</th>
            <th className="px-3 py-3">Pricing Mode</th>
            <th className="px-3 py-3">{t("ui.markup")}</th>
            <th className="px-3 py-3">Add Amount LAK</th>
            <th className="px-3 py-3">Rounding</th>
            <th className="px-3 py-3">Price LAK</th>
            <th className="px-3 py-3">Unit Image</th>
            <th className="px-3 py-3">Base</th>
            <th className="px-3 py-3">Default Sale</th>
            <th className="px-3 py-3">Default Receiving</th>
            <th className="px-3 py-3">Manual</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (<tr className="border-b border-border last:border-b-0" key={unit.id}>
              <td className="px-3 py-3">
                <input aria-label={`Select ${unit.unitName || "unit"}`} checked={selectedUnitIds.includes(unit.id)} type="checkbox" onChange={() => toggleSelectedUnit(unit.id)}/>
              </td>
              <td className="px-3 py-3">
                <input className="field-input h-10 min-w-32" value={unit.unitName} onChange={(event) => updateUnit(unit.id, { unitName: event.target.value })}/>
              </td>
              <td className="px-3 py-3">
                <input className="field-input h-10 min-w-24" type="number" min="1" value={unit.conversionQty} disabled={unit.isBaseUnit} onChange={(event) => updateUnit(unit.id, { conversionQty: Number(event.target.value) })}/>
              </td>
              <td className="px-3 py-3">
                <input className="field-input h-10 min-w-40 font-mono" value={unit.barcode} onChange={(event) => updateUnit(unit.id, { barcode: event.target.value })}/>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-28" value={unit.costPriceLak ?? 0} onValueChange={(value) => updatePricing(unit, { costPriceLak: value })}/>
              </td>
              <td className="px-3 py-3">
                <select className="field-input h-10 min-w-36" value={unit.pricingMode ?? "manual"} onChange={(event) => updatePricing(unit, { pricingMode: event.target.value as ProductUnit["pricingMode"] })}>
                  <option value="manual">Manual</option>
                  <option value="cost_plus_percent">{t("ui.cost")}</option>
                  <option value="cost_plus_amount">{t("ui.cost.amount")}</option>
                </select>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 w-24" value={unit.markupPercent ?? 0} onValueChange={(value) => updatePricing(unit, { markupPercent: value })}/>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 w-32" value={unit.addAmountLak ?? 0} onValueChange={(value) => updatePricing(unit, { addAmountLak: value })}/>
              </td>
              <td className="px-3 py-3">
                <select className="field-input h-10 min-w-36" value={unit.roundingLak ?? 0} onChange={(event) => updatePricing(unit, { roundingLak: Number(event.target.value) })}>
                  <option value={0}>No rounding</option>
                  <option value={500}>Nearest 500</option>
                  <option value={1000}>{t("ui.nearest.1.000")}</option>
                  <option value={5000}>{t("ui.nearest.5.000")}</option>
                </select>
              </td>
              <td className="px-3 py-3">
                <MoneyInput className="h-10 min-w-28" value={unit.sellingPriceLak} onValueChange={(value) => updateUnit(unit.id, { sellingPriceLak: value })}/>
              </td>
              <td className="px-3 py-3">
                <div className="grid size-10 place-items-center overflow-hidden rounded-md border border-border bg-background">
                  {isRenderableImage(unit.imageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt={`${unit.unitName} image`} className="size-full object-cover" src={unit.imageUrl}/>) : (<ImagePlus aria-hidden="true" className="size-4 text-muted-foreground"/>)}
                </div>
              </td>
              <td className="px-3 py-3">
                <input type="radio" checked={unit.isBaseUnit} onChange={() => updateUnit(unit.id, { conversionQty: 1, isBaseUnit: true })} name="baseUnit"/>
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
                <select className="field-input h-10" value={unit.status ?? "active"} onChange={(event) => updateUnit(unit.id, { status: event.target.value as "active" | "inactive" })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </td>
              <td className="px-3 py-3 text-right">
                <button className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-danger transition hover:border-danger disabled:cursor-not-allowed disabled:opacity-40" type="button" onClick={() => removeUnit(unit.id)} disabled={unit.isBaseUnit} aria-label="Remove unit">
                  <Trash2 aria-hidden="true"/>
                </button>
              </td>
            </tr>))}
        </tbody>
      </table>
    </div>
    </>);
}
function calculateSellingPrice(unit: ProductUnit) {
    const cost = Number(unit.costPriceLak ?? 0);
    const rawPrice = unit.pricingMode === "cost_plus_percent"
        ? cost + cost * (Number(unit.markupPercent ?? 0) / 100)
        : unit.pricingMode === "cost_plus_amount"
            ? cost + Number(unit.addAmountLak ?? 0)
            : Number(unit.sellingPriceLak ?? 0);
    const rounding = Number(unit.roundingLak ?? 0);
    if (rounding <= 0) {
        return Math.max(0, Math.round(rawPrice));
    }
    return Math.max(0, Math.round(rawPrice / rounding) * rounding);
}
function parseMoney(value: unknown) {
    if (typeof value === "number")
        return Number.isFinite(value) ? value : 0;
    return Number(String(value ?? "").replaceAll(",", "")) || 0;
}
function formatMoney(value: unknown) {
    return parseMoney(value).toLocaleString("en-US");
}
function MoneyInput({ className = "", defaultValue, name, onValueChange, required, value, }: {
    className?: string;
    defaultValue?: number;
    name?: string;
    onValueChange?: (value: number) => void;
    required?: boolean;
    value?: number;
}) {
    const [localValue, setLocalValue] = useState(formatMoney(value ?? defaultValue ?? 0));
    const [isFocused, setIsFocused] = useState(false);
    const numericValue = parseMoney(value ?? localValue);
    function update(nextText: string) {
        const digits = nextText.replace(/[^\d.]/g, "");
        const nextNumber = parseMoney(digits);
        const nextDisplay = digits ? formatMoney(nextNumber) : "";
        setLocalValue(nextDisplay);
        onValueChange?.(nextNumber);
    }
    const displayValue = value === undefined
        ? localValue
        : isFocused && parseMoney(value) === 0
            ? localValue === "0" ? "" : localValue
            : formatMoney(value);
    return (<>
      {name ? <input name={name} type="hidden" value={numericValue}/> : null}
      <input className={`field-input ${className}`} inputMode="decimal" required={required} value={displayValue} onChange={(event) => update(event.target.value)} onFocus={() => {
            setIsFocused(true);
            if (parseMoney(displayValue) === 0) {
                setLocalValue("");
            }
        }} onBlur={() => {
            setIsFocused(false);
            if (!displayValue) {
                setLocalValue("0");
                onValueChange?.(0);
            }
        }}/>
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
    const title = state.mode === "add" ? "Add Category" : state.mode === "edit" ? "Edit Category" : "Delete Category";
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close">
            <X aria-hidden="true" className="size-4"/>
          </button>
        </div>
        {state.mode === "delete" ? (<>
            <p className="mt-4 text-sm text-muted-foreground">{t("ui.delete.category")}</p>
            <p className="mt-2 rounded-md border border-border bg-background p-3 text-sm font-semibold">{category?.nameEn || category?.nameLo || "Selected category"}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
              <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={() => state.categoryId && onDelete(state.categoryId)}>Delete</button>
            </div>
          </>) : (<>
            <Field label={state.mode === "add" ? "Category Name" : "Current Category Name"}>
              <input className="field-input" value={name} onChange={(event) => setName(event.target.value)} autoFocus/>
            </Field>
            <div className="mt-5 flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onClose}>Cancel</button>
              <button className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={() => onSave({ id: state.mode === "edit" ? state.categoryId : undefined, nameLo: name })}>Save</button>
            </div>
          </>)}
      </section>
    </div>);
}
function ImagePreviewDialog({ image, onClose }: {
    image: ProductFormImage;
    onClose: () => void;
}) {
    return (<div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <section className="w-full max-w-4xl rounded-lg border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{image.label}</h2>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close image preview">
            <X aria-hidden="true" className="size-4"/>
          </button>
        </div>
        <div className="grid max-h-[75vh] place-items-center overflow-auto rounded-md bg-background p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={image.label} className="max-h-[70vh] max-w-full object-contain" src={image.url}/>
        </div>
      </section>
    </div>);
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
      <span>Category</span>
      <div className="flex min-w-0 overflow-hidden rounded-md border border-border bg-background focus-within:border-primary">
        <select className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" name="categoryId" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
          {categories.map((category) => (<option value={category.id} key={category.id}>
              {category.nameEn} / {category.nameLo}
            </option>))}
        </select>
        <div className="flex shrink-0 border-l border-border">
          <button aria-label="Add Category" className="grid size-11 place-items-center transition hover:bg-card" type="button" onClick={() => onAction("add")}>
            <Plus aria-hidden="true" className="size-4"/>
          </button>
          <button aria-label="Edit Category" className="grid size-11 place-items-center border-l border-border transition hover:bg-card disabled:opacity-40" type="button" disabled={!hasSelectedCategory} onClick={() => onAction("edit", selectedCategoryId)}>
            <Pencil aria-hidden="true" className="size-4"/>
          </button>
          <button aria-label="Delete Category" className="grid size-11 place-items-center border-l border-border text-danger transition hover:bg-danger/10 disabled:opacity-40" type="button" disabled={!hasSelectedCategory} onClick={() => onAction("delete", selectedCategoryId)}>
            <Trash2 aria-hidden="true" className="size-4"/>
          </button>
        </div>
      </div>
    </div>);
}
function ProductImagesSection({ barcode, onRemove, onSearchMessage, onSetMainImage, onUpload, productImages, productName, removeProductImage, selectedImageId, units, updateUnit, }: {
    barcode: string;
    onRemove: () => void;
    onSearchMessage: (message: string) => void;
    onSetMainImage: (imageUrl: string) => void;
    onUpload: (file: File | undefined) => void;
    productImages: ProductFormImage[];
    productName: string;
    removeProductImage: (imageUrl: string) => void;
    selectedImageId?: string;
    units: ProductUnit[];
    updateUnit: (unitId: string, patch: Partial<ProductUnit>) => void;
}) {
    const [searched, setSearched] = useState(false);
    const [previewImage, setPreviewImage] = useState<ProductFormImage | null>(null);
    const searchKeyword = barcode.trim() || productName.trim();
    const selectedImage = productImages.find((image) => image.url === selectedImageId);
    function searchImages() {
        setSearched(true);
        if (!searchKeyword) {
            onSearchMessage(t("ui.enter.a.barcode.or.product.name.before.searc"));
            return;
        }
        onSearchMessage(`Image search prepared for "${searchKeyword}". Live image integration can be connected later.`);
    }
    return (<section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card p-4">
      {previewImage ? (<ImagePreviewDialog image={previewImage} onClose={() => setPreviewImage(null)}/>) : null}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">Product Images</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.upload.or.search.by.barcode.first.then.produ")}</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={searchImages}>
          <Search aria-hidden="true" className="size-4"/>
          Search Image
        </button>
      </div>

      {searched ? (<div className="mt-4 rounded-lg border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">{t("ui.image.search.integration.can.be.connected.la")}</div>) : null}

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="rounded-lg border border-dashed border-border bg-background p-4">
          <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-card text-center">
            {selectedImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="Main product preview" className="h-full w-full object-cover" src={selectedImage.url}/>) : (<div className="px-4 text-sm text-muted-foreground">
                <ImagePlus aria-hidden="true" className="mx-auto mb-2"/>
                No image selected
              </div>)}
          </div>
          <label className="mt-3 flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary">{t("ui.upload.png.jpg.webp.gif")}<input accept={t("ui.image.png.image.jpeg.image.jpg.image.webp.im")} className="sr-only" type="file" onChange={(event) => onUpload(event.target.files?.[0])}/>
          </label>
          {selectedImageId ? (<button className="mt-2 h-10 w-full rounded-md border border-danger text-sm font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={onRemove}>
              Remove selected image
            </button>) : null}
          <p className="mt-3 text-xs text-muted-foreground">{t("ui.main.image.will.be.used.for.pos.product.list")}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Uploaded Images</h3>
              <p className="mt-1 text-xs text-muted-foreground">{t("ui.assign.images.to.a.product.unit.or.set.one.a")}</p>
            </div>
            <span className="text-xs text-muted-foreground">{productImages.length}{t("ui.image.s")}</span>
          </div>
          {productImages.length === 0 ? (<div className="mt-4 grid min-h-36 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t("ui.no.product.images.yet.upload.png.jpg.jpeg.we")}</div>) : (<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {productImages.map((image) => {
                const assignedUnit = units.find((unit) => unit.imageUrl === image.url);
                return (<div className="rounded-lg border border-border bg-card p-3" key={image.id}>
                    <div className="grid aspect-square place-items-center overflow-hidden rounded-md border border-border bg-background">
                      <button className="size-full" type="button" onClick={() => setPreviewImage(image)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt={image.label} className="size-full object-cover" src={image.url}/>
                      </button>
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold">{image.label}</div>
                    <label className="mt-3 grid gap-1 text-xs font-semibold">
                      Assign to Unit
                      <select className="field-input h-9 text-xs" value={assignedUnit?.id ?? ""} onChange={(event) => {
                        const nextUnitId = event.target.value;
                        for (const unit of units) {
                            if (unit.imageUrl === image.url && unit.id !== nextUnitId) {
                                updateUnit(unit.id, { imageUrl: undefined });
                            }
                        }
                        if (nextUnitId) {
                            updateUnit(nextUnitId, { imageUrl: image.url });
                        }
                    }}>
                        <option value="">Not assigned</option>
                        {units.map((unit) => (<option key={unit.id} value={unit.id}>{unit.unitName || "Unnamed unit"}</option>))}
                      </select>
                    </label>
                    <button className="mt-2 h-9 w-full rounded-md border border-border text-xs font-semibold transition hover:border-primary" type="button" onClick={() => {
                        onSetMainImage(image.url);
                        onSearchMessage(`${image.label} set as main product image.`);
                    }}>
                      Set as main image
                    </button>
                    <button className="mt-2 h-9 w-full rounded-md border border-danger text-xs font-semibold text-danger transition hover:bg-danger/10" type="button" onClick={() => removeProductImage(image.url)}>
                      Remove image
                    </button>
                  </div>);
            })}
            </div>)}
          <div className="mt-4 flex justify-end gap-2">
            <Link className="inline-flex h-11 items-center justify-center rounded-md border border-border px-5 text-sm font-semibold transition hover:border-primary" href="/products">
              Cancel
            </Link>
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="submit">
              <Save aria-hidden="true"/>
              Save
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
      <h2 className="text-base font-semibold">Product History</h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <HistoryList emptyText={t("ui.no.price.changes.recorded.yet")} items={(product.priceHistory ?? []).map((entry) => ({
            detail: `${entry.unitName ?? "Product"}: ${formatMoney(entry.oldPrice)} → ${formatMoney(entry.newPrice)}`,
            meta: entry.changedBy ?? "Current User",
            time: entry.createdAt,
        }))} title="Price History"/>
        <HistoryList emptyText={t("ui.no.barcode.changes.recorded.yet")} items={(product.barcodeHistory ?? []).map((entry) => ({
            detail: `${entry.unitName ?? "Product"}: ${entry.oldBarcode || "-"} → ${entry.newBarcode || "-"}`,
            meta: entry.changedBy ?? "Current User",
            time: entry.createdAt,
        }))} title="Barcode History"/>
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
function BarcodeScannerModal({ onClose, onScan, }: {
    onClose: () => void;
    onScan: () => void;
}) {
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Camera barcode scanner</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.mock.scanner.ui.camera.permissions.and.real.")}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close scanner">
            <X aria-hidden="true"/>
          </button>
        </div>
        <div className="mt-5 overflow-hidden rounded-md border border-border bg-background">
          <div className="relative grid aspect-video place-items-center">
            <div className="absolute inset-x-10 top-1/2 h-0.5 bg-danger shadow-[0_0_18px_var(--danger)]"/>
            <div className="h-28 w-72 rounded-md border-2 border-primary/70"/>
            <span className="absolute bottom-4 text-xs text-muted-foreground">
              Align barcode inside the frame
            </span>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={onScan}>
            <Barcode aria-hidden="true"/>
            Simulate scan
          </button>
        </div>
      </div>
    </div>);
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
    return Boolean(imageUrl && (/^(https?:|data:image|blob:|\/)/.test(imageUrl)));
}
