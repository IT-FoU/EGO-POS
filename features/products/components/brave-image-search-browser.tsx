"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Search, X } from "lucide-react";
import {
  fillProductsCopy,
  localizeProductError,
  tProducts,
} from "@/lib/i18n/products-copy";
import { searchProductImagesAction } from "@/features/products/actions";
import type { ImageSearchSource, ProductImageSearchHit } from "@/features/products/product-image-search";

const t = tProducts;

function defaultSource(productName: string, barcode: string): ImageSearchSource | null {
  if (productName.trim()) return "name";
  if (barcode.trim()) return "barcode";
  return null;
}

function queryForSource(source: ImageSearchSource, productName: string, barcode: string) {
  return source === "name" ? productName.trim() : barcode.trim();
}

function dimensionLabel(hit: ProductImageSearchHit) {
  if (hit.width && hit.height) return `${hit.width}×${hit.height}`;
  if (hit.width) return `${hit.width}w`;
  if (hit.height) return `${hit.height}h`;
  return null;
}

export function BraveImageSearchBrowser({
  barcode,
  importing = false,
  onClose,
  onUseImage,
  productName,
}: {
  barcode: string;
  importing?: boolean;
  onClose: () => void;
  onUseImage: (hit: ProductImageSearchHit) => Promise<void>;
  productName: string;
}) {
  const titleId = useId();
  const queryInputRef = useRef<HTMLInputElement | null>(null);
  const initialSource = defaultSource(productName, barcode);
  const [source, setSource] = useState<ImageSearchSource>(initialSource ?? "name");
  const [query, setQuery] = useState(() => (initialSource ? queryForSource(initialSource, productName, barcode) : ""));
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductImageSearchHit[]>([]);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, true>>({});
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [previewHit, setPreviewHit] = useState<ProductImageSearchHit | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);
  const autoSearchDone = useRef(false);

  const visibleResults = useMemo(
    () => results.filter((hit) => !brokenThumbs[hit.id]),
    [brokenThumbs, results],
  );

  useEffect(() => {
    queryInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (autoSearchDone.current) return;
    autoSearchDone.current = true;
    if (!initialSource) {
      setInfoMessage(t("imageSearchEnterNameOrBarcode"));
      return;
    }
    void runSearch(queryForSource(initialSource, productName, barcode), initialSource);
    // Auto-search once on open with the form's current name/barcode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchSource(next: ImageSearchSource) {
    setSource(next);
    setPreviewHit(null);
    setPreviewBroken(false);
    setQuery(queryForSource(next, productName, barcode));
    setErrorMessage(null);
    setInfoMessage(null);
  }

  async function runSearch(nextQuery = query, nextSource = source) {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      setResults([]);
      setLastQuery(null);
      setPreviewHit(null);
      setErrorMessage(
        nextSource === "name" ? t("productNameRequiredForImageSearch") : t("barcodeRequiredForImageSearch"),
      );
      setInfoMessage(null);
      return;
    }

    setSearching(true);
    setErrorMessage(null);
    setInfoMessage(null);
    setPreviewHit(null);
    setPreviewBroken(false);
    setBrokenThumbs({});
    try {
      const result = await searchProductImagesAction({
        barcode: nextSource === "barcode" ? trimmed : barcode,
        productName: nextSource === "name" ? trimmed : productName,
        query: trimmed,
        source: nextSource,
      });
      if (!result.ok || !result.data) {
        setResults([]);
        setLastQuery(trimmed);
        setErrorMessage(localizeProductError(result.error ?? t("imageSearchFailed")));
        return;
      }
      setProviderConfigured(result.data.configured);
      setLastQuery(result.data.query);
      setResults(result.data.results);
      if (!result.data.configured) {
        setErrorMessage(t("imageSearchNotConfigured"));
        return;
      }
      if (result.data.results.length === 0) {
        setInfoMessage(t("noImageSearchResults"));
      }
    } catch (error) {
      setResults([]);
      setErrorMessage(localizeProductError(error instanceof Error ? error.message : t("imageSearchFailed")));
    } finally {
      setSearching(false);
    }
  }

  async function useSelectedImage() {
    if (!previewHit || importing) return;
    await onUseImage(previewHit);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 md:left-72" data-testid="brave-image-search-browser">
      <aside
        aria-labelledby={titleId}
        className="ml-auto flex h-full w-full max-w-5xl flex-col border-l border-border bg-background shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold" id={titleId}>
              {t("productImageSearchTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("braveSearchProvider")}</p>
          </div>
          <button
            aria-label={t("closeImageSearch")}
            className="grid size-10 shrink-0 place-items-center rounded-md border border-border transition hover:border-primary"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-4">
            <section className="rounded-lg border border-border bg-card p-4">
              <p className="text-sm font-semibold">{t("searchBy")}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                    source === "name" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary"
                  }`}
                  type="button"
                  onClick={() => switchSource("name")}
                >
                  {t("productName")}
                  <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                    {productName.trim() || t("productNameRequiredForImageSearch")}
                  </span>
                </button>
                <button
                  className={`rounded-md border px-3 py-2 text-left text-sm font-semibold transition ${
                    source === "barcode" ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary"
                  }`}
                  type="button"
                  onClick={() => switchSource("barcode")}
                >
                  {t("barcode")}
                  <span className="mt-1 block truncate text-xs font-normal text-muted-foreground">
                    {barcode.trim() || t("barcodeRequiredForImageSearch")}
                  </span>
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  className="field-input sm:flex-1"
                  disabled={searching || importing}
                  placeholder={source === "name" ? t("productName") : t("barcode")}
                  ref={queryInputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void runSearch();
                    }
                  }}
                />
                <button
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                  disabled={searching || importing}
                  type="button"
                  onClick={() => void runSearch()}
                >
                  {searching ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Search aria-hidden="true" className="size-4" />}
                  {t("search")}
                </button>
              </div>
            </section>

            {searching ? (
              <p className="text-sm font-semibold text-muted-foreground">{t("searchingImages")}</p>
            ) : null}
            {importing ? (
              <p className="text-sm font-semibold text-muted-foreground">{t("importingImage")}</p>
            ) : null}
            {errorMessage ? (
              <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
                {errorMessage}
              </div>
            ) : null}
            {infoMessage && !errorMessage ? (
              <div className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
                {infoMessage}
              </div>
            ) : null}
            {providerConfigured === false && !errorMessage ? (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning" role="alert">
                {t("imageSearchNotConfigured")}
              </div>
            ) : null}

            {previewHit ? (
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{t("imageSearchPreview")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {fillProductsCopy(t("imageSearchQueryUsed"), { query: lastQuery || query })}
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:border-primary"
                    type="button"
                    onClick={() => {
                      setPreviewHit(null);
                      setPreviewBroken(false);
                    }}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    {t("backToImageResults")}
                  </button>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div className="grid min-h-64 place-items-center overflow-hidden rounded-md border border-border bg-background p-3">
                    {previewBroken ? (
                      <p className="text-sm text-muted-foreground">{t("imageSearchThumbnailFailed")}</p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={previewHit.title}
                        className="max-h-[50vh] max-w-full object-contain"
                        src={previewHit.importUrl || previewHit.thumbnailUrl}
                        onError={() => setPreviewBroken(true)}
                      />
                    )}
                  </div>
                  <div className="grid gap-3 content-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("imageSearchResultTitle")}</p>
                      <p className="mt-1 text-sm font-semibold">{previewHit.title}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("imageSearchSource")}</p>
                      <p className="mt-1 text-sm">{previewHit.sourceDomain || previewHit.sourcePageUrl || t("imageSearchSourceUnknown")}</p>
                      {previewHit.sourcePageUrl ? (
                        <a
                          className="mt-1 inline-block text-xs font-semibold text-primary underline-offset-2 hover:underline"
                          href={previewHit.sourcePageUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t("imageSearchOpenSource")}
                        </a>
                      ) : null}
                    </div>
                    {dimensionLabel(previewHit) ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("imageSearchDimensions")}</p>
                        <p className="mt-1 text-sm">{dimensionLabel(previewHit)}</p>
                      </div>
                    ) : null}
                    <button
                      className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                      disabled={importing || previewBroken}
                      type="button"
                      onClick={() => void useSelectedImage()}
                    >
                      {importing ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                      {importing ? t("importingImage") : t("useThisImage")}
                    </button>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{t("imageSearchResults")}</h3>
                  {lastQuery ? (
                    <span className="text-xs text-muted-foreground">
                      {fillProductsCopy(t("imageSearchQueryUsed"), { query: lastQuery })}
                    </span>
                  ) : null}
                </div>
                {visibleResults.length === 0 && !searching ? (
                  <div className="mt-4 grid min-h-40 place-items-center rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                    {lastQuery ? t("noImageSearchResults") : t("imageSearchEnterNameOrBarcode")}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleResults.map((hit) => (
                      <button
                        className="overflow-hidden rounded-lg border border-border bg-background text-left transition hover:border-primary disabled:opacity-50"
                        disabled={importing || searching}
                        key={hit.id}
                        type="button"
                        onClick={() => {
                          setPreviewHit(hit);
                          setPreviewBroken(false);
                        }}
                      >
                        <div className="grid aspect-square place-items-center bg-card">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            alt={hit.title}
                            className="size-full object-cover"
                            decoding="async"
                            loading="lazy"
                            src={hit.thumbnailUrl}
                            onError={() => setBrokenThumbs((current) => ({ ...current, [hit.id]: true }))}
                          />
                        </div>
                        <div className="space-y-1 px-3 py-3">
                          <div className="truncate text-sm font-semibold">{hit.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {hit.sourceDomain || hit.sourcePageUrl || t("imageSearchSourceUnknown")}
                          </div>
                          {dimensionLabel(hit) ? (
                            <div className="text-xs text-muted-foreground">{dimensionLabel(hit)}</div>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
