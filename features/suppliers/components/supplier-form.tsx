"use client";

import { t } from "@/lib/i18n/ui";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Save } from "lucide-react";
import { formatLak } from "@/features/suppliers/format";
import { createSupplierAction } from "@/features/suppliers/actions";
import type { Supplier } from "@/features/suppliers/types";
const paymentTermOptions = ["Cash", "7 days", "15 days", "30 days", "60 days", "90 days", "Custom"];
const ratingOptions = ["A", "B", "C", "D"];
export function SupplierForm({ existingSuppliers = [] }: {
    existingSuppliers?: Supplier[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [country, setCountry] = useState("Laos");
    const [creditLimitLak, setCreditLimitLak] = useState(0);
    const [district, setDistrict] = useState("");
    const [fullAddress, setFullAddress] = useState("");
    const [openingBalanceLak, setOpeningBalanceLak] = useState(0);
    const [province, setProvince] = useState("");
    const [rating, setRating] = useState("A");
    const [village, setVillage] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const remainingCredit = Math.max(creditLimitLak - openingBalanceLak, 0);
    const nextSupplierCode = getNextSupplierCode(existingSuppliers);
    const combinedAddress = [village, district, province, country, fullAddress]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(", ");
    function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const payload = {
            address: combinedAddress || undefined,
            companyName: String(formData.get("companyName") ?? "").trim(),
            contactPerson: String(formData.get("contactPerson") ?? "").trim() || undefined,
            creditLimit: Number(formData.get("creditLimit") ?? 0),
            creditTerms: String(formData.get("creditTerms") ?? "").trim() || undefined,
            email: String(formData.get("email") ?? "").trim() || undefined,
            note: [
                String(formData.get("note") ?? "").trim(),
                `Supplier rating: ${rating}`,
                "Delivery reliability: UI placeholder",
                "Product quality: UI placeholder",
                "Credit behavior: UI placeholder",
            ].filter(Boolean).join("\n"),
            openingBalance: Number(formData.get("openingBalance") ?? 0),
            phone: String(formData.get("phone") ?? "").trim() || undefined,
            supplierCode: String(formData.get("supplierCode") ?? "").trim() || undefined,
            taxNumber: String(formData.get("taxNumber") ?? "").trim() || undefined,
        };
        startTransition(async () => {
            const result = await createSupplierAction(payload);
            if (!result.ok) {
                setMessage(result.error ?? t("ui.supplier.save.failed"));
                return;
            }
            setMessage(t("ui.supplier.saved.successfully"));
            router.refresh();
            router.push("/suppliers");
        });
    }
    return (<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/suppliers">
          <ArrowLeft aria-hidden="true"/>
          Back to suppliers
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">Create supplier</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("ui.create.a.supplier.profile.with.contact.tax.n")}</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" disabled={isPending} type="submit">
            <Save aria-hidden="true"/>
            {isPending ? t("ui.saving") : "Save"}
          </button>
        </div>
      </section>

      {message ? (<div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Supplier information</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Supplier Code">
              <input className="field-input font-mono" name="supplierCode" defaultValue={nextSupplierCode} placeholder="SUP-001" required/>
              <p className="text-xs text-muted-foreground">{t("ui.auto.generated.suggestion.manual.override.is")}</p>
            </Field>
            <Field label="Company Name">
              <input className="field-input" name="companyName" placeholder="Supplier company name" required/>
            </Field>
            <Field label="Contact Name">
              <input className="field-input" name="contactPerson" placeholder="Contact person" required/>
            </Field>
            <Field label="Phone">
              <input className="field-input" name="phone" placeholder="+856 20 ..." required/>
            </Field>
            <Field label="Email">
              <input className="field-input" name="email" placeholder={t("ui.supplier.example.com")} type="email"/>
            </Field>
            <Field label="Tax Number">
              <input className="field-input font-mono" name="taxNumber" placeholder={t("ui.lao.tax")}/>
            </Field>
            <Field label="Payment Terms">
              <select className="field-input" name="creditTerms" defaultValue="Cash">
                {paymentTermOptions.map((option) => (<option key={option} value={option}>{option}</option>))}
              </select>
            </Field>
            <Field label="Supplier Rating">
              <select className="field-input" value={rating} onChange={(event) => setRating(event.target.value)}>
                {ratingOptions.map((option) => (<option key={option} value={option}>Rating {option}</option>))}
              </select>
            </Field>
            <Field label="Credit Limit">
              <input className="field-input" min="0" name="creditLimit" type="number" value={creditLimitLak} onChange={(event) => setCreditLimitLak(Number(event.target.value))}/>
            </Field>
            <Field label="Opening Balance">
              <input className="field-input" min="0" name="openingBalance" type="number" value={openingBalanceLak} onChange={(event) => setOpeningBalanceLak(Number(event.target.value))}/>
            </Field>
            <Field label="Country">
              <input className="field-input" value={country} onChange={(event) => setCountry(event.target.value)}/>
            </Field>
            <Field label="Province">
              <input className="field-input" value={province} onChange={(event) => setProvince(event.target.value)} placeholder="Vientiane Capital"/>
            </Field>
            <Field label="District">
              <input className="field-input" value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="Chanthabouly"/>
            </Field>
            <Field label="Village">
              <input className="field-input" value={village} onChange={(event) => setVillage(event.target.value)} placeholder="Village"/>
            </Field>
            <Field className="md:col-span-2" label="Full Address">
              <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={fullAddress} onChange={(event) => setFullAddress(event.target.value)} placeholder={t("ui.street.building.delivery.instructions")}/>
            </Field>
            <section className="md:col-span-2 rounded-md border border-dashed border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Linked products placeholder</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("ui.future.supplier.product.relationship.will.re")}</p>
            </section>
            <section className="md:col-span-2 rounded-md border border-dashed border-border bg-background p-4">
              <h3 className="text-sm font-semibold">Supplier documents placeholder</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("ui.upload.backend.is.not.connected.yet.planned.")}</p>
            </section>
            <div className="md:col-span-2">
              <Field label="Notes">
                <textarea className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="note" placeholder="Supplier notes"/>
              </Field>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Local preview</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label="Credit limit" value={`${formatLak(creditLimitLak)} LAK`}/>
            <Summary label="Opening balance" value={`${formatLak(openingBalanceLak)} LAK`}/>
            <Summary label="Remaining credit" value={`${formatLak(remainingCredit)} LAK`}/>
            <Summary label="Suggested code" value={nextSupplierCode}/>
            <Summary label="Payment terms" value="Saved to supplier credit terms"/>
            <Summary label="Rating" value={`Rating ${rating} (stored in notes for now)`}/>
            <Summary label="Database status" value="Real database"/>
          </dl>
        </aside>
      </section>
    </form>);
}
function Field({ children, className, label }: {
    children: React.ReactNode;
    className?: string;
    label: string;
}) {
    return (<label className={`flex flex-col gap-2 text-sm font-medium ${className ?? ""}`}>
      {label}
      {children}
    </label>);
}
function getNextSupplierCode(suppliers: Supplier[]) {
    const maxNumber = suppliers.reduce((max, supplier) => {
        const match = supplier.supplierCode.match(/^SUP-(\d+)$/i);
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `SUP-${String(maxNumber + 1).padStart(3, "0")}`;
}
function Summary({ label, value }: {
    label: string;
    value: string;
}) {
    return (<div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>);
}
