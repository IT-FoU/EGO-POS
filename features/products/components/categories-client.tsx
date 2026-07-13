"use client";

import { t } from "@/lib/i18n/ui";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Edit3, FolderTree, Plus, Save, Search, Trash2, X, } from "lucide-react";
import type { Category } from "@/features/products/types";
import { StatusBadge } from "@/features/products/components/status-badge";
import { deleteCategoryAction, upsertCategoryAction } from "@/features/products/actions";
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
export function CategoriesClient({ initialCategories, }: {
    initialCategories: Category[];
}) {
    const router = useRouter();
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
        return categories.filter((category) => `${category.nameLo} ${category.nameEn} ${category.parentName ?? ""}`
            .toLowerCase()
            .includes(normalized));
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
                setMessage(result.error ?? t("ui.category.save.failed"));
                return;
            }
            setMessage(form.id ? t("ui.category.updated.successfully") : t("ui.category.created.successfully"));
            setForm(null);
            router.refresh();
        });
    }
    function archiveCategory(_categoryId: string) {
        setMessage(t("ui.category.archive.is.not.available.in.the.cur"));
    }
    function deleteCategory(categoryId: string) {
        startTransition(async () => {
            const result = await deleteCategoryAction(categoryId);
            if (!result.ok) {
                setMessage(result.error ?? t("ui.category.delete.failed"));
                return;
            }
            setCategories((current) => current.filter((category) => category.id !== categoryId));
            setMessage(t("ui.category.deleted.successfully"));
            router.refresh();
        });
    }
    return (<div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/products">
          <ArrowLeft aria-hidden="true"/>
          Back to products
        </Link>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Product Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Categories</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("ui.add.edit.archive.and.delete.product.categori")}</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="button" onClick={() => setForm(emptyForm)}>
            <Plus aria-hidden="true"/>
            Add Category
          </button>
        </div>
      </section>

      {message ? (<div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>) : null}

      <section className="rounded-lg border border-border bg-card p-5">
        <label className="relative block">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input className="h-11 w-full rounded-md border border-border bg-background pl-10 pr-3 text-sm outline-none transition focus:border-primary" placeholder="Search categories by Thai or English name" value={query} onChange={(event) => setQuery(event.target.value)}/>
        </label>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Parent</th>
                <th className="px-4 py-3 text-right">Products</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((category) => (<tr className="border-b border-border last:border-b-0" key={category.id}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
                        <FolderTree aria-hidden="true"/>
                      </div>
                      <div>
                        <div className="font-semibold">{category.nameLo}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {category.nameEn}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {category.parentName ?? "Root"}
                  </td>
                  <td className="px-4 py-4 text-right font-semibold">
                    {category.productCount}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={category.status}/>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <button className="grid size-9 place-items-center rounded-md border border-border transition hover:border-primary" type="button" onClick={() => setForm({
                id: category.id,
                nameLo: category.nameLo,
                nameEn: category.nameEn,
                parentId: "",
                status: category.status,
            })} aria-label="Edit category">
                        <Edit3 aria-hidden="true"/>
                      </button>
                      <button className="grid size-9 place-items-center rounded-md border border-border transition hover:border-warning" type="button" onClick={() => archiveCategory(category.id)} aria-label="Archive category">
                        <Archive aria-hidden="true"/>
                      </button>
                      <button className="grid size-9 place-items-center rounded-md border border-border text-danger transition hover:border-danger" type="button" onClick={() => deleteCategory(category.id)} aria-label="Delete category">
                        <Trash2 aria-hidden="true"/>
                      </button>
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </section>

      {form ? (<CategoryModal categories={categories} form={form} isPending={isPending} onChange={setForm} onClose={() => setForm(null)} onSubmit={saveCategory}/>) : null}
    </div>);
}
function CategoryModal({ categories, form, isPending, onChange, onClose, onSubmit, }: {
    categories: Category[];
    form: CategoryFormState;
    isPending: boolean;
    onChange: (form: CategoryFormState) => void;
    onClose: () => void;
    onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <form className="w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-2xl" onSubmit={onSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">
              {form.id ? "Edit category" : "Create category"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.saves.category.names.and.parent.category.to.")}</p>
          </div>
          <button className="grid size-9 place-items-center rounded-md border border-border" type="button" onClick={onClose} aria-label="Close category form">
            <X aria-hidden="true"/>
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <Field label={t("ui.category.name.lao")}>
            <input className="field-input" value={form.nameLo} onChange={(event) => onChange({ ...form, nameLo: event.target.value })} required/>
          </Field>
          <Field label={t("ui.category.name.english")}>
            <input className="field-input" value={form.nameEn} onChange={(event) => onChange({ ...form, nameEn: event.target.value })} required/>
          </Field>
          <Field label="Parent category">
            <select className="field-input" value={form.parentId} onChange={(event) => onChange({ ...form, parentId: event.target.value })}>
              <option value="">Root category</option>
              {categories
            .filter((category) => category.id !== form.id)
            .map((category) => (<option value={category.id} key={category.id}>
                    {category.nameEn} / {category.nameLo}
                  </option>))}
            </select>
          </Field>
          <Field label="Status">
            <select className="field-input" value={form.status} onChange={(event) => onChange({
            ...form,
            status: event.target.value as CategoryFormState["status"],
        })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="h-11 rounded-md border border-border px-4 text-sm font-semibold transition hover:border-primary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90" type="submit" disabled={isPending}>
            <Save aria-hidden="true"/>
            {isPending ? t("ui.saving") : "Save category"}
          </button>
        </div>
      </form>
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
