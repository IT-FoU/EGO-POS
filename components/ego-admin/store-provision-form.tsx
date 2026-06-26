"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { EGO_ADMIN_PROVISIONING_TEMPLATES } from "@/lib/setup-admin/provisioning-templates";

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

export function StoreProvisionForm({ dictionary }: { dictionary: ProvisionDictionary }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessPayload | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const payload = {
      branchName: String(formData.get("branchName") ?? ""),
      businessTemplateKey: String(formData.get("businessTemplateKey") ?? ""),
      defaultCurrency: String(formData.get("defaultCurrency") ?? "LAK"),
      defaultLocale: String(formData.get("defaultLocale") ?? "lo"),
      ownerEmail: String(formData.get("ownerEmail") ?? ""),
      ownerFullName: String(formData.get("ownerFullName") ?? ""),
      ownerTemporaryPassword: String(formData.get("ownerTemporaryPassword") ?? ""),
      ownerUsername: String(formData.get("ownerUsername") ?? ""),
      storeCode: String(formData.get("storeCode") ?? ""),
      storeName: String(formData.get("storeName") ?? ""),
      warehouseName: String(formData.get("warehouseName") ?? ""),
    };

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/ego-admin/stores", {
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
      <section className="grid gap-6 rounded-lg border border-border bg-card p-6">
        <div>
          <h2 className="text-2xl font-semibold">{dictionary.provisionSuccessTitle}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{dictionary.provisionSuccessDescription}</p>
        </div>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessStoreLabel}</dt>
            <dd className="mt-1 text-muted-foreground">
              {success.store.name} ({success.store.code})
            </dd>
          </div>
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessTemplateLabel}</dt>
            <dd className="mt-1 text-muted-foreground">{templateLabel}</dd>
          </div>
          <div>
            <dt className="font-medium">{dictionary.provisionSuccessOwnerLabel}</dt>
            <dd className="mt-1 text-muted-foreground">
              {success.owner.username} / {success.owner.email}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Temporary password</dt>
            <dd className="mt-1 font-mono text-sm">{success.owner.temporaryPassword}</dd>
          </div>
        </dl>
        <p className="rounded-md border border-amber-300/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
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
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            onClick={() => setSuccess(null)}
            type="button"
          >
            {dictionary.createAnotherStore}
          </button>
          <Link className="rounded-md border border-border px-4 py-2 text-sm font-semibold" href="/ego-admin">
            {dictionary.backToEgoAdmin}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form className="grid gap-6 rounded-lg border border-border bg-card p-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-2xl font-semibold">{dictionary.createStore}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{dictionary.createStoreDescription}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.storeName}
          <input className="rounded-md border border-border px-3 py-2" name="storeName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.storeCode}
          <input
            className="rounded-md border border-border px-3 py-2"
            name="storeCode"
            pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
            required
            type="text"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.businessTemplate}
          <select className="rounded-md border border-border px-3 py-2" name="businessTemplateKey" required>
            {EGO_ADMIN_PROVISIONING_TEMPLATES.map((template) => (
              <option disabled={!template.enabled} key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.defaultLanguage}
          <select className="rounded-md border border-border px-3 py-2" defaultValue="lo" name="defaultLocale">
            <option value="lo">Lao</option>
            <option value="en">English</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.defaultCurrency}
          <select className="rounded-md border border-border px-3 py-2" defaultValue="LAK" name="defaultCurrency">
            <option value="LAK">LAK</option>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.branchName}
          <input className="rounded-md border border-border px-3 py-2" name="branchName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.warehouseName}
          <input className="rounded-md border border-border px-3 py-2" name="warehouseName" required type="text" />
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.ownerFullName}
          <input className="rounded-md border border-border px-3 py-2" name="ownerFullName" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.ownerUsername}
          <input className="rounded-md border border-border px-3 py-2" name="ownerUsername" required type="text" />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.ownerEmail}
          <input className="rounded-md border border-border px-3 py-2" name="ownerEmail" required type="email" />
        </label>
        <label className="grid gap-2 text-sm font-medium md:col-span-2">
          {dictionary.ownerTemporaryPassword}
          <input
            className="rounded-md border border-border px-3 py-2"
            minLength={8}
            name="ownerTemporaryPassword"
            required
            type="password"
          />
        </label>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? dictionary.provisionSubmitting : dictionary.provisionSubmit}
        </button>
        <Link className="rounded-md border border-border px-4 py-2 text-sm font-semibold" href="/ego-admin">
          {dictionary.backToEgoAdmin}
        </Link>
      </div>
    </form>
  );
}
