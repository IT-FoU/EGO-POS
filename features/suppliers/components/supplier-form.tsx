"use client";

import { useState, useTransition } from "react";
import type { SupportedLocale } from "@/lib/constants";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import {
  localizeSupplierError,
  paymentTermLabel,
  tSuppliers,
} from "@/lib/i18n/suppliers-copy";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Save } from "lucide-react";
import { formatLak } from "@/features/suppliers/format";
import { createSupplierAction } from "@/features/suppliers/actions";
import type { Supplier } from "@/features/suppliers/types";
const paymentTermOptions = ["Cash", "7 days", "15 days", "30 days", "60 days", "90 days", "Custom"];
const ratingOptions = ["A", "B", "C", "D"];
let activeLocale: SupportedLocale = "en";
function t(key: string) {
  return tSuppliers(key, activeLocale);
}

export function SupplierForm({ existingSuppliers = [], locale: localeProp }: {
    existingSuppliers?: Supplier[];
    locale?: SupportedLocale;
}) {
    const router = useRouter();
    const locale = useAppLocale(localeProp);
    activeLocale = locale;
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
                setMessage(localizeSupplierError(result.error ?? t("saveFailed"), activeLocale));
                return;
            }
            setMessage(t("savedSuccessfully"));
            router.refresh();
            router.push("/suppliers");
        });
    }
    return (<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-6">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground" href="/suppliers">
          <ArrowLeft aria-hidden="true"/>
          {t("backToSuppliers")}
        </Link>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="grid size-12 place-items-center rounded-md bg-primary/10 text-primary">
              <Building2 aria-hidden="true"/>
            </div>
            <h1 className="mt-4 text-3xl font-semibold">{t("createSupplier")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("createSupplierSubtitle")}</p>
          </div>
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90" disabled={isPending} type="submit">
            <Save aria-hidden="true"/>
            {isPending ? t("saving") : t("save")}
          </button>
        </div>
      </section>

      {message ? (<div className="rounded-md border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {message}
        </div>) : null}

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("supplierInformation")}</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label={t("supplierCode")}>
              <input className="field-input font-mono" name="supplierCode" defaultValue={nextSupplierCode} placeholder="SUP-001" required/>
              <p className="text-xs text-muted-foreground">{t("autoCodeHint")}</p>
            </Field>
            <Field label={t("companyName")}>
              <input className="field-input" name="companyName" placeholder={t("companyNamePlaceholder")} required/>
            </Field>
            <Field label={t("contactName")}>
              <input className="field-input" name="contactPerson" placeholder={t("contactPersonPlaceholder")} required/>
            </Field>
            <Field label={t("phone")}>
              <input className="field-input" name="phone" placeholder="+856 20 ..." required/>
            </Field>
            <Field label={t("email")}>
              <input className="field-input" name="email" placeholder={t("emailPlaceholder")} type="email"/>
            </Field>
            <Field label={t("taxNumber")}>
              <input className="field-input font-mono" name="taxNumber" placeholder={t("taxPlaceholder")}/>
            </Field>
            <Field label={t("paymentTerms")}>
              <select className="field-input" name="creditTerms" defaultValue="Cash">
                {paymentTermOptions.map((option) => (<option key={option} value={option}>{paymentTermLabel(option, activeLocale)}</option>))}
              </select>
            </Field>
            <Field label={t("supplierRating")}>
              <select className="field-input" value={rating} onChange={(event) => setRating(event.target.value)}>
                {ratingOptions.map((option) => (<option key={option} value={option}>{tSuppliers("ratingOption", activeLocale).replace("{letter}", option)}</option>))}
              </select>
            </Field>
            <Field label={t("creditLimit")}>
              <input className="field-input" min="0" name="creditLimit" type="number" value={creditLimitLak} onChange={(event) => setCreditLimitLak(Number(event.target.value))}/>
            </Field>
            <Field label={t("openingBalance")}>
              <input className="field-input" min="0" name="openingBalance" type="number" value={openingBalanceLak} onChange={(event) => setOpeningBalanceLak(Number(event.target.value))}/>
            </Field>
            <Field label={t("country")}>
              <input className="field-input" value={country} onChange={(event) => setCountry(event.target.value)}/>
            </Field>
            <Field label={t("province")}>
              <input className="field-input" value={province} onChange={(event) => setProvince(event.target.value)} placeholder={t("provincePlaceholder")}/>
            </Field>
            <Field label={t("district")}>
              <input className="field-input" value={district} onChange={(event) => setDistrict(event.target.value)} placeholder={t("districtPlaceholder")}/>
            </Field>
            <Field label={t("village")}>
              <input className="field-input" value={village} onChange={(event) => setVillage(event.target.value)} placeholder={t("villagePlaceholder")}/>
            </Field>
            <Field className="md:col-span-2" label={t("fullAddress")}>
              <textarea className="min-h-24 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" value={fullAddress} onChange={(event) => setFullAddress(event.target.value)} placeholder={t("addressPlaceholder")}/>
            </Field>
            <section className="md:col-span-2 rounded-md border border-dashed border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("linkedProductsPlaceholder")}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("linkedProductsFormHint")}</p>
            </section>
            <section className="md:col-span-2 rounded-md border border-dashed border-border bg-background p-4">
              <h3 className="text-sm font-semibold">{t("supplierDocumentsPlaceholder")}</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("documentsFormHint")}</p>
            </section>
            <div className="md:col-span-2">
              <Field label={t("notes")}>
                <textarea className="min-h-28 w-full rounded-md border border-border bg-background p-3 text-sm outline-none transition focus:border-primary" name="note" placeholder={t("notesPlaceholder")}/>
              </Field>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("localPreview")}</h2>
          <dl className="mt-5 flex flex-col gap-4 text-sm">
            <Summary label={t("creditLimit")} value={`${formatLak(creditLimitLak)} LAK`}/>
            <Summary label={t("openingBalance")} value={`${formatLak(openingBalanceLak)} LAK`}/>
            <Summary label={t("remainingCredit")} value={`${formatLak(remainingCredit)} LAK`}/>
            <Summary label={t("suggestedCode")} value={nextSupplierCode}/>
            <Summary label={t("paymentTerms")} value={t("paymentTermsSaved")}/>
            <Summary label={t("rating")} value={tSuppliers("ratingStored", activeLocale).replace("{letter}", rating)}/>
            <Summary label={t("databaseStatus")} value={t("realDatabase")}/>
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
