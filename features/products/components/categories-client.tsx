"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Edit3, FolderTree, Plus, Save, Search, Trash2, X } from "lucide-react";
import type { Category } from "@/features/products/types";
import { StatusBadge } from "@/features/products/components/status-badge";
import { deleteCategoryAction, upsertCategoryAction } from "@/features/products/actions";
import { localizedProductName } from "@/features/pos/product-display-name";
import { localizeCategoryError, productStatusLabel, tProducts } from "@/lib/i18n/products-copy";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";

type CategoryFormState = {
  id?: string;
  nameLo: string;
  nameEn: string;
  parentId: string;
  status: "active" | "inactive";
};

const emptyForm: CategoryFormState = {
  nameLo: "",
  nameEn: "",
  parentId: "",
  status: "active",
};

function secondaryCategoryName(category: { nameEn?: string | null; nameLo?: string | null }, locale: SupportedLocale) {
  return locale === "lo" ? (category.nameEn?.trim() ?? "") : (category.nameLo?.trim() ?? "");
}

function localizedParentName(category: Category, locale: SupportedLocale, rootLabel: string) {
  const localized = localizedProductName(
    {
      nameEn: category.parentNameEn,
      nameLo: category.parentNameLo,
    },
    locale,
  );
  return localized || category.parentName || rootLabel;
}

export function CategoriesClient({
  initialCategories,
  locale: localeProp,
}: {
  initialCategories: Category[];
  locale?: SupportedLocale;
}) {
  const router = useRouter();
  const locale = useAppLocale(localeProp);
  const t = (key: string) => tProducts(key, locale);
  const [isPending, startTransition] = useTransition();
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<CategoryFormState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredCategories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return categories;
    }
    return categories.filter((category) =>
      `${category.nameLo} ${category.nameEn} ${category.parentName ?? ""} ${category.parentNameLo ?? ""} ${category.parentNameEn ?? ""}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [categories, query]);

  function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }
    startTransition(async () => {
      const result = await upsertCategoryAction({
        id: form.id,
        nameEn: form.nameEn,
        nameLo: form.nameLo,
        parentId: form.parentId || undefined,
      });
      if (!result.ok) {
        setMessage(localizeCategoryError(result.error ?? undefined, locale));
        return;
      }
      setMessage(form.id ? t("categoryUpdated") : t("categoryCreated"));
      setForm(null);
      router.refresh();
    });
  }

  function archiveCategory(_categoryId: string) {
    setMessage(t("archiveCategoryUnavailable"));
  }

  function deleteCategory(categoryId: string) {
    startTransition(async () => {
      const result = await deleteCategoryAction(categoryId);
      if (!result.ok) {
        setMessage(result.error ? localizeCategoryError(result.error, locale) : t("categoryDeleteFailed"));
        return;
      }
      setCategories((current) => current.filter((category) => category.id !== categoryId));
      setMessage(t("categoryDeleted"));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          href="/products"
        >
          <ArrowLeft aria-hidden="true" />
          {t("backToProducts")}
        </Link>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">{t("productManagement")}</p>
            <h1 className="mt-2 text-3xl font-semibold">{t("categories")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("categoriesPageSubtitle")}</p>
          </div>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            type="button"
            onClick={() => setForm(emptyForm)}
          >
            <Plus aria-hidden="true" />
            {t("addCategory")}
          </button>
        </div>
      </section>

      {message ? (
        <div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label={t("categoriesSearchAria")}
            className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary"
            placeholder={t("categoriesSearchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{t("category")}</th>
                <th className="px-4 py-3">{t("parent")}</th>
                <th className="px-4 py-3 text-right">{t("products")}</th>
                <th className="px-4 py-3">{t("status")}</th>
                <th className="px-4 py-3 text-right">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                    {categories.length === 0 ? t("noCategories") : t("noCategoryResults")}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => {
                  const primaryName = localizedProductName(category, locale);
                  const secondaryName = secondaryCategoryName(category, locale);
                  return (
                    <tr className="border-b border-border last:border-b-0" key={category.id}>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                            <FolderTree aria-hidden="true" />
                          </div>
                          <div>
                            <div className="font-semibold">{primaryName}</div>
                            {secondaryName && secondaryName !== primaryName ? (
                              <div className="mt-1 text-xs text-muted-foreground">{secondaryName}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {localizedParentName(category, locale, t("root"))}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold">{category.productCount}</td>
                      <td className="px-4 py-4">
                        <StatusBadge locale={locale} status={category.status} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            aria-label={t("editCategory")}
                            className="grid size-9 place-items-center rounded-md border border-border transition hover:border-primary"
                            type="button"
                            title={t("editCategory")}
                            onClick={() =>
                              setForm({
                                id: category.id,
                                nameLo: category.nameLo,
                                nameEn: category.nameEn,
                                parentId: "",
                                status: category.status,
                              })
                            }
                          >
                            <Edit3 aria-hidden="true" />
                          </button>
                          <button
                            aria-label={t("archiveCategory")}
                            className="grid size-9 place-items-center rounded-md border border-border transition hover:border-warning"
                            type="button"
                            title={t("archiveCategory")}
                            onClick={() => archiveCategory(category.id)}
                          >
                            <Archive aria-hidden="true" />
                          </button>
                          <button
                            aria-label={t("deleteCategory")}
                            className="grid size-9 place-items-center rounded-md border border-border text-danger transition hover:border-danger"
                            type="button"
                            title={t("deleteCategory")}
                            onClick={() => deleteCategory(category.id)}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (
        <CategoryModal
          categories={categories}
          form={form}
          isPending={isPending}
          locale={locale}
          onChange={setForm}
          onClose={() => setForm(null)}
          onSubmit={saveCategory}
        />
      ) : null}
    </div>
  );
}

function CategoryModal({
  categories,
  form,
  isPending,
  locale,
  onChange,
  onClose,
  onSubmit,
}: {
  categories: Category[];
  form: CategoryFormState;
  isPending: boolean;
  locale: SupportedLocale;
  onChange: (form: CategoryFormState) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const t = (key: string) => tProducts(key, locale);

  function optionLabel(category: Category) {
    const primary = localizedProductName(category, locale);
    const secondary = secondaryCategoryName(category, locale);
    return secondary && secondary !== primary ? `${primary} / ${secondary}` : primary;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <form className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-2xl" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{form.id ? t("editCategory") : t("createCategory")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("categoriesFormHint")}</p>
          </div>
          <button
            aria-label={t("closeCategoryForm")}
            className="grid size-9 place-items-center rounded-md border border-border"
            title={t("close")}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label={t("categoryNameLao")}>
            <input
              className="field-input"
              value={form.nameLo}
              onChange={(event) => onChange({ ...form, nameLo: event.target.value })}
              required
            />
          </Field>
          <Field label={t("categoryNameEnglish")}>
            <input
              className="field-input"
              value={form.nameEn}
              onChange={(event) => onChange({ ...form, nameEn: event.target.value })}
              required
            />
          </Field>
          <Field label={t("parentCategory")}>
            <select
              className="field-input"
              value={form.parentId}
              onChange={(event) => onChange({ ...form, parentId: event.target.value })}
            >
              <option value="">{t("rootCategory")}</option>
              {categories
                .filter((category) => category.id !== form.id)
                .map((category) => (
                  <option value={category.id} key={category.id}>
                    {optionLabel(category)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("status")}>
            <select
              className="field-input"
              value={form.status}
              onChange={(event) =>
                onChange({
                  ...form,
                  status: event.target.value as CategoryFormState["status"],
                })
              }
            >
              <option value="active">{productStatusLabel("active", locale)}</option>
              <option value="inactive">{productStatusLabel("inactive", locale)}</option>
            </select>
          </Field>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="h-11 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary"
            type="button"
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            type="submit"
            disabled={isPending}
          >
            <Save aria-hidden="true" />
            {isPending ? t("saving") : t("saveCategory")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
