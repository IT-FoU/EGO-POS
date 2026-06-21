"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ImagePlus } from "lucide-react";
import type { LocalizedBusinessTemplate } from "@/features/platform/platform-localization";
import {
  completeOnboarding,
  createLocalId,
  getStoredSetupDraft,
  getTemplateEntryPath,
} from "@/features/platform/onboarding-context";

type BusinessSetupDictionary = {
  businessCreatedLocally: string;
  confirmPosPin: string;
  createBusiness: string;
  currency: string;
  email: string;
  hidePassword: string;
  language: string;
  logoFutureUse: string;
  ownerName: string;
  phoneNumber: string;
  pinMismatch: string;
  posPin: string;
  saving: string;
  showPassword: string;
  storeAddress: string;
  storeAddressHelper: string;
  storeLogo: string;
  storeName: string;
};

export function BusinessSetupForm({
  dictionary,
  setupSaveError,
  template,
}: {
  dictionary: BusinessSetupDictionary;
  setupSaveError: string;
  template: LocalizedBusinessTemplate;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPinVisible, setIsPinVisible] = useState(false);
  const [isConfirmPinVisible, setIsConfirmPinVisible] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }

    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
    setLogoDataUrl(null);

    if (!file || !["image/png", "image/svg+xml", "image/webp"].includes(file.type)) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const pin = String(formData.get("posPin") ?? "");
    const confirmPin = String(formData.get("confirmPosPin") ?? "");

    if (pin !== confirmPin) {
      setError(dictionary.pinMismatch);
      return;
    }

    const draft = getStoredSetupDraft();
    const businessTemplateId = draft?.businessTemplateId ?? template.type;
    const businessType = draft?.businessType ?? template.type;
    const defaultModules = draft?.defaultModules ?? template.enabledModuleKeys;
    const activeBusinessId = createLocalId("business");
    const activeTenantId = createLocalId("tenant");
    const business = {
      activeBusinessId,
      activeTenantId,
      businessTemplateId,
      businessType,
      currency: String(formData.get("currency") ?? "LAK"),
      defaultModules,
      email: String(formData.get("email") ?? ""),
      language: String(formData.get("language") ?? "lo"),
      logoFileName: (formData.get("storeLogo") as File | null)?.name ?? "",
      logoUrl: logoDataUrl ?? undefined,
      ownerName: String(formData.get("ownerName") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      setupCompletedAt: new Date().toISOString(),
      setupStatus: "complete" as const,
      storeAddress: String(formData.get("storeAddress") ?? ""),
      storeName: String(formData.get("storeName") ?? ""),
      template: businessTemplateId,
      templateId: businessTemplateId,
      templateName: template.name,
    };

    setError(null);
    startTransition(() => {
      try {
        completeOnboarding(business);
        router.push(getTemplateEntryPath(businessTemplateId));
        router.refresh();
      } catch {
        setError(setupSaveError);
      }
    });
  }

  return (
    <form className="grid gap-5 rounded-md border border-border bg-card p-5" onSubmit={handleSubmit}>
      <section className="grid gap-3 rounded-md border border-dashed border-border bg-background p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-card text-primary">
            {logoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="h-full w-full object-cover"
                src={logoPreviewUrl}
              />
            ) : (
              <ImagePlus className="size-8" aria-hidden="true" />
            )}
          </div>
          <div className="grid flex-1 gap-2">
            <label className="grid gap-2 text-sm font-medium">
              {dictionary.storeLogo}
              <input
                className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm"
                name="storeLogo"
                type="file"
                accept="image/png,image/svg+xml,image/webp"
                onChange={handleLogoChange}
              />
            </label>
            <p className="text-xs leading-5 text-muted-foreground">
              {dictionary.logoFutureUse}
            </p>
          </div>
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.storeName}
          <input className="field-input" name="storeName" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.ownerName}
          <input className="field-input" name="ownerName" required />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.phoneNumber}
          <input className="field-input" name="phoneNumber" type="tel" required />
        </label>
        <label className="grid gap-2 text-sm font-medium md:row-span-2">
          {dictionary.storeAddress}
          <textarea
            className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-3 text-sm outline-none transition focus:border-primary"
            maxLength={500}
            name="storeAddress"
          />
          <span className="text-xs text-muted-foreground">{dictionary.storeAddressHelper}</span>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.email}
          <input className="field-input" name="email" type="email" required />
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.posPin}
          <span className="relative">
            <input
              className="h-11 w-full rounded-md border border-border bg-background px-3 pr-12 text-sm outline-none transition focus:border-primary"
              name="posPin"
              type={isPinVisible ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              required
            />
            <button
              aria-label={isPinVisible ? dictionary.hidePassword : dictionary.showPassword}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
              onClick={() => setIsPinVisible((value) => !value)}
              type="button"
            >
              {isPinVisible ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </button>
          </span>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.confirmPosPin}
          <span className="relative">
            <input
              className="h-11 w-full rounded-md border border-border bg-background px-3 pr-12 text-sm outline-none transition focus:border-primary"
              name="confirmPosPin"
              type={isConfirmPinVisible ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              required
            />
            <button
              aria-label={isConfirmPinVisible ? dictionary.hidePassword : dictionary.showPassword}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-card"
              onClick={() => setIsConfirmPinVisible((value) => !value)}
              type="button"
            >
              {isConfirmPinVisible ? (
                <EyeOff className="size-5" aria-hidden="true" />
              ) : (
                <Eye className="size-5" aria-hidden="true" />
              )}
            </button>
          </span>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.language}
          <select className="field-input" name="language" defaultValue="lo">
            <option value="lo">{dictionary.language === "Language" ? "Lao" : "ລາວ"}</option>
            <option value="en">{dictionary.language === "Language" ? "English" : "ອັງກິດ"}</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          {dictionary.currency}
          <select className="field-input" name="currency" defaultValue="LAK">
            <option value="LAK">LAK</option>
            <option value="THB">THB</option>
            <option value="USD">USD</option>
          </select>
        </label>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{dictionary.businessCreatedLocally}</p>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      <button
        className="h-11 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60 md:w-fit"
        disabled={isPending}
        type="submit"
      >
        {isPending ? dictionary.saving : dictionary.createBusiness}
      </button>
    </form>
  );
}
