"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { EGO_ADMIN_PROVISIONING_TEMPLATES } from "@/lib/setup-admin/provisioning-templates";
import { cn } from "@/lib/utils";

type ProvisionDictionary = {
  backToEgoAdmin: string;
  branchName: string;
  businessTemplate: string;
  createStore: string;
  createStoreDescription: string;
  defaultCurrency: string;
  defaultLanguage: string;
  ownerEmail: string;
  ownerFullName: string;
  ownerTemporaryPassword: string;
  ownerUsername: string;
  provisionSubmit: string;
  provisionSubmitting: string;
  storeCode: string;
  storeName: string;
  warehouseName: string;
  provisionSuccessTitle: string;
  provisionSuccessDescription: string;
  provisionSuccessStoreLabel: string;
  provisionSuccessTemplateLabel: string;
  provisionSuccessOwnerLabel: string;
  provisionSuccessPasswordWarning: string;
  provisionSuccessLoginUrl: string;
  createAnotherStore: string;
};

type SuccessPayload = {
  businessTemplateKey: string;
  loginUrl: string;
  owner: {
    email: string;
    temporaryPassword: string;
    username: string;
  };
  store: {
    code: string;
    name: string;
  };
};

export function StoreProvisionForm({
  backHref = "/ego-admin",
  backLabel,
  dictionary,
  provisionApiPath = "/api/ego-admin/stores",
  variant = "default",
}: {
  backHref?: string;
  backLabel?: string;
  dictionary: ProvisionDictionary;
  provisionApiPath?: string;
  variant?: "default" | "superAdmin";
}) {
  const resolvedBackLabel = backLabel ?? dictionary.backToEgoAdmin;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessPayload | null>(null);
  const [isPending, startTransition] = useTransition();
  const isSuperAdmin = variant === "superAdmin";
  const panelClass = cn(
    "grid gap-6 rounded-lg border p-6",
    isSuperAdmin ? "border-[#334155] bg-[#111827] text-[#F8FAFC]" : "border-border bg-card",
  );
  const inputClass = cn(
    "rounded-md border px-3 py-2",
    isSuperAdmin
      ? "border-[#334155] bg-[#1E293B] text-[#F8FAFC] outline-none transition placeholder:text-[#64748B] focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20"
      : "border-border",
  );
  const mutedClass = isSuperAdmin ? "text-[#94A3B8]" : "text-muted-foreground";
  const primaryButtonClass = cn(
    "rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
    isSuperAdmin ? "bg-[#5EEAD4] text-[#020617] hover:bg-[#2DD4BF]" : "bg-primary text-primary-foreground hover:opacity-90",
  );
  const secondaryLinkClass = cn(
    "rounded-md border px-4 py-2 text-sm font-semibold transition",
    isSuperAdmin ? "border-[#334155] text-[#CBD5E1] hover:border-[#5EEAD4]" : "border-border",
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const payload = {
      branchName: String(formData.get("branchName") ?? ""),
      businessTemplateKey: String(formData.get("businessTemplateKey") ?? ""),
      defaultCurrency: String(formData.get("defaultCurrency") ?? "LAK"),
      defaultLocale: String(formData.get("defaultLocale") ?? "en"),
      ownerPhone: String(formData.get("ownerPhone") ?? ""),
      ownerEmail: String(formData.get("ownerEmail") ?? ""),
      ownerFullName: String(formData.get("ownerFullName") ?? ""),
      ownerTemporaryPassword: String(formData.get("ownerTemporaryPassword") ?? ""),
      ownerUsername: String(formData.get("ownerUsername") ?? ""),
      profileAddress: String(formData.get("profileAddress") ?? ""),
      storeCode: String(formData.get("storeCode") ?? ""),
      storeName: String(formData.get("storeName") ?? ""),
      warehouseName: String(formData.get("warehouseName") ?? ""),
    };

    setError(null);
    startTransition(async () => {
      const response = await fetch(provisionApiPath, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | (SuccessPayload & { error?: string; ok?: boolean })
        | null;

      if (!response.ok || !data?.ok || !data.store || !data.owner) {
        setError(data?.error ?? "Store provisioning failed.");
        return;
      }

      setSuccess({
        businessTemplateKey: data.businessTemplateKey,
        loginUrl: data.loginUrl,
        owner: data.owner,
        store: data.store,
      });
    });
  }

  if (success) {
    const templateLabel =
      EGO_ADMIN_PROVISIONING_TEMPLATES.find((template) => template.key === success.businessTemplateKey)?.label ??
      success.businessTemplateKey;

    return (
      <section className={panelClass}>
        <div>
          <h2 className="text-2xl font-semibold">{dictionary.provisionSuccessTitle}</h2>
          <p className={cn("mt-2 text-sm", mutedClass)}>{dictionary.provisionSuccessDescription}</p>
        </div>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessStoreLabel}</dt>
            <dd className={cn("mt-1", mutedClass)}>
              {success.store.name} ({success.store.code})
            </dd>
          </div>
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessTemplateLabel}</dt>
            <dd className={cn("mt-1", mutedClass)}>{templateLabel}</dd>
          </div>
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessOwnerLabel}</dt>
            <dd className={cn("mt-1", mutedClass)}>
              {success.owner.username} / {success.owner.email}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Temporary password</dt>
            <dd className="mt-1 font-mono text-sm">{success.owner.temporaryPassword}</dd>
          </div>
        </dl>
        <p className="rounded-md border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {dictionary.provisionSuccessPasswordWarning}
        </p>
        <p className="text-sm">
          {dictionary.provisionSuccessLoginUrl}:{" "}
          <Link className="font-semibold text-primary underline" href={success.loginUrl}>
            {success.loginUrl}
          </Link>
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            className={primaryButtonClass}
            onClick={() => setSuccess(null)}
            type="button"
          >
            {dictionary.createAnotherStore}
          </button>
          <Link className={secondaryLinkClass} href={backHref}>
            {resolvedBackLabel}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className={panelClass} onSubmit={handleSubmit}>
      <div>
        <h2 className="text-2xl font-semibold">{dictionary.createStore}</h2>
        <p className={cn("mt-2 text-sm", mutedClass)}>{dictionary.createStoreDescription}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Business name
          <input className={inputClass} name="storeName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.storeCode}
          <input
            className={inputClass}
            name="storeCode"
            pattern="[a-z0-9][a-z0-9\\-]{1,30}[a-z0-9]"
            required
            type="text"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.businessTemplate}
          <select className={inputClass} name="businessTemplateKey" required>
            {EGO_ADMIN_PROVISIONING_TEMPLATES.map((template) => (
              <option disabled={!template.enabled} key={template.key} value={template.key}>
                {template.label} - {template.status}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.defaultLanguage}
          <select className={inputClass} defaultValue="en" name="defaultLocale">
            <option value="en">English</option>
            <option value="lo">Lao</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.defaultCurrency}
          <select className={inputClass} defaultValue="LAK" name="defaultCurrency">
            <option value="LAK">LAK</option>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Country / region
          <input className={cn(inputClass, "opacity-70")} defaultValue="Laos" disabled />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Store name
          <input className={inputClass} name="branchName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Plan
          <select className={inputClass} defaultValue="Free" name="plan">
            <option value="Free">Free Plan</option>
            <option disabled value="Pro">Pro Plan - Billing not connected yet</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          Business address
          <textarea className={cn(inputClass, "min-h-24 resize-y")} name="profileAddress" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          Notes
          <textarea className={cn(inputClass, "min-h-20 resize-y opacity-70")} disabled placeholder="Coming soon" />
        </label>
        <input name="warehouseName" type="hidden" value="Main Warehouse" />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.ownerFullName}
          <input className={inputClass} name="ownerFullName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.ownerUsername}
          <input className={inputClass} name="ownerUsername" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.ownerEmail}
          <input className={inputClass} name="ownerEmail" required type="email" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          Owner phone
          <input className={inputClass} name="ownerPhone" type="tel" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.ownerTemporaryPassword}
          <input
            className={inputClass}
            minLength={8}
            name="ownerTemporaryPassword"
            required
            type="password"
          />
        </label>
      </section>

      {error ? <p className="rounded-md border border-[#EF4444]/40 bg-[#EF4444]/10 px-4 py-3 text-sm text-[#FCA5A5]">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          className={primaryButtonClass}
          disabled={isPending}
          type="submit"
        >
          {isPending ? dictionary.provisionSubmitting : dictionary.provisionSubmit}
        </button>
        <Link className={secondaryLinkClass} href={backHref}>
          {resolvedBackLabel}
        </Link>
      </div>
    </form>
  );
}
