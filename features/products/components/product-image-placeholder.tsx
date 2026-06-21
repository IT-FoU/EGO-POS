"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState } from "react";
import { ImageIcon, Search, UploadCloud } from "lucide-react";
import type { MockProductImage } from "@/features/products/types";
import { cn } from "@/lib/utils";
export function ProductImagePlaceholder() {
    return (<div className="flex aspect-square min-h-14 items-center justify-center rounded-md border border-border bg-background">
      <ImageIcon aria-hidden="true" className="text-muted-foreground"/>
    </div>);
}
export function ProductImageUploadPanel({ compact = false, images, selectedImageId, onSelectImage, }: {
    compact?: boolean;
    images: MockProductImage[];
    selectedImageId?: string;
    onSelectImage: (image: MockProductImage) => void;
}) {
    const [query, setQuery] = useState("");
    const [submittedQuery, setSubmittedQuery] = useState("");
    const selectedImage = images.find((image) => image.id === selectedImageId);
    const results = useMemo(() => {
        const normalized = submittedQuery.trim().toLowerCase();
        if (!normalized) {
            return images;
        }
        return images.filter((image) => `${image.title} ${image.keyword}`.toLowerCase().includes(normalized));
    }, [images, submittedQuery]);
    if (compact) {
        return (<details className="rounded-lg border border-border bg-card p-4" open>
        <summary className="cursor-pointer text-sm font-semibold">Product image</summary>
        <div className="mt-4 grid gap-4">
          <div>
            {selectedImage ? (<MockImageCard image={selectedImage} large/>) : (<div className="grid min-h-28 place-items-center rounded-md border border-dashed border-border bg-background text-sm text-muted-foreground">
                No image selected
              </div>)}
          </div>
          <div className="flex gap-2">
            <input className="field-input h-10" placeholder="Search image keyword" value={query} onChange={(event) => setQuery(event.target.value)}/>
            <button className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={() => setSubmittedQuery(query)}>
              <Search aria-hidden="true"/>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {results.slice(0, 6).map((image) => {
                const isSelected = image.id === selectedImageId;
                return (<button className={cn("rounded-md border border-border bg-background p-1 text-left transition hover:border-primary", isSelected && "border-primary")} type="button" key={image.id} onClick={() => onSelectImage(image)}>
                  <MockImageCard image={image}/>
                  <span className="mt-1 block truncate text-[11px] font-semibold">{image.title}</span>
                </button>);
            })}
          </div>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background p-3 text-center transition hover:border-primary">
            <UploadCloud aria-hidden="true" className="text-muted-foreground"/>
            <span className="text-xs font-medium">Upload PNG or JPG</span>
            <input className="sr-only" type="file" accept="image/png,image/jpeg"/>
          </label>
        </div>
      </details>);
    }
    return (<div className="flex flex-col gap-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Search image</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.mock.image.search.external.image.apis.can.be")}</p>
          </div>
          <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
            <Search aria-hidden="true"/>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input className="field-input" placeholder="Search product image keyword" value={query} onChange={(event) => setQuery(event.target.value)}/>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={() => setSubmittedQuery(query)}>
            <Search aria-hidden="true"/>
            Search
          </button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {results.map((image) => {
            const isSelected = image.id === selectedImageId;
            return (<button className={cn("rounded-md border border-border bg-background p-2 text-left transition hover:border-primary", isSelected && "border-primary")} type="button" key={image.id} onClick={() => onSelectImage(image)}>
                <MockImageCard image={image}/>
                <span className="mt-2 block text-xs font-semibold">{image.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {isSelected ? "Selected image" : "Select image"}
                </span>
              </button>);
        })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Selected product image</h2>
        <div className="mt-5">
          {selectedImage ? (<MockImageCard image={selectedImage} large/>) : (<div className="grid min-h-44 place-items-center rounded-md border border-dashed border-border bg-background text-sm text-muted-foreground">
              No image selected
            </div>)}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Upload image</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.keep.normal.upload.option.storage.integratio")}</p>
        </div>
        <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
          <UploadCloud aria-hidden="true"/>
        </div>
      </div>
      <label className="mt-5 flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-background p-6 text-center transition hover:border-primary">
        <ImageIcon aria-hidden="true" className="text-muted-foreground"/>
        <span className="text-sm font-medium">Click to choose an image</span>
        <span className="text-xs text-muted-foreground">{t("ui.png.or.jpg.placeholder.only.no.upload.is.sen")}</span>
        <input className="sr-only" type="file" accept="image/png,image/jpeg"/>
      </label>
    </div>
    </div>);
}
function MockImageCard({ image, large = false, }: {
    image: MockProductImage;
    large?: boolean;
}) {
    return (<div className={cn("grid place-items-center rounded-md bg-gradient-to-br text-center font-semibold text-white shadow-inner", image.color, large ? "min-h-44 text-lg" : "aspect-square text-xs")}>
      {image.title}
    </div>);
}
