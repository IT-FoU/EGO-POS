"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { LogoContainer } from "@/components/brand/logo-container";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import {
  cancelStagedImage,
  confirmStagedImage,
  emptyStagedImage,
  isStagedImageDirty,
  previewStagedImage,
  readImageFileAsDataUrl,
  removeStagedImage,
  selectStagedImage,
  type StagedImageState,
} from "@/features/brand/staged-image";
import { removeCompanyLogoAction, saveCompanyLogoAction } from "@/features/settings/actions";
import { SectionTitle } from "@/features/settings/components/settings-fields";
import type { SupportedLocale } from "@/lib/constants";
import { localizeSettingsError, tSettings } from "@/lib/i18n/settings-copy";
import { MAX_SOURCE_IMAGE_BYTES } from "@/lib/storage/image-validate";

export function LogoSettingsSection({
  companyName,
  initialBusinessLogoUrl,
  locale,
  onNotify,
}: {
  companyName: string;
  initialBusinessLogoUrl: string | null;
  locale: SupportedLocale;
  onNotify: (message: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [logoStage, setLogoStage] = useState<StagedImageState>(() => emptyStagedImage(initialBusinessLogoUrl));
  useEffect(() => {
    setLogoStage((current) => (isStagedImageDirty(current) ? current : emptyStagedImage(initialBusinessLogoUrl)));
  }, [initialBusinessLogoUrl]);
  const [settingsConfirm, setSettingsConfirm] = useState<"removeLogo" | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<File | null>(null);

  async function chooseLogoFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_SOURCE_IMAGE_BYTES) {
        onNotify({ text: tSettings("logoTooLarge", locale), tone: "error" });
        return;
      }
      logoFileRef.current = file;
      const dataUrl = await readImageFileAsDataUrl(file);
      setLogoStage((current) => selectStagedImage(current, dataUrl));
      onNotify({ text: tSettings("logoPreviewReady", locale), tone: "success" });
    } catch {
      onNotify({ text: tSettings("logoTypeError", locale), tone: "error" });
    }
  }

  function confirmLogo() {
    const file = logoFileRef.current;
    const next = confirmStagedImage(logoStage);
    if (!file || !next.saved) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await saveCompanyLogoAction(formData);
      if (!result.ok || !result.data) {
        onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
        return;
      }
      logoFileRef.current = null;
      const savedUrl = result.data.businessLogoUrl || next.saved;
      setLogoStage(emptyStagedImage(savedUrl));
      onNotify({ text: tSettings("saved", locale), tone: "success" });
    });
  }

  function cancelLogoDraft() {
    logoFileRef.current = null;
    setLogoStage((current) => cancelStagedImage(current));
  }

  function removeLogo() {
    setSettingsConfirm("removeLogo");
  }

  function applyRemoveLogo() {
    startTransition(async () => {
      const result = await removeCompanyLogoAction();
      if (!result.ok) {
        onNotify({ text: localizeSettingsError(result.error, locale), tone: "error" });
        setSettingsConfirm(null);
        return;
      }
      logoFileRef.current = null;
      setLogoStage(removeStagedImage());
      onNotify({ text: tSettings("remove", locale), tone: "success" });
      setSettingsConfirm(null);
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <SectionTitle icon={Building2} title={tSettings("companyLogo", locale)} />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <div className="flex flex-col gap-4 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-start">
            <LogoContainer fallbackName={companyName} logoUrl={previewStagedImage(logoStage)} size={96} variant="settings" />
            <div className="grid min-w-0 flex-1 gap-2 text-sm font-medium">
              {tSettings("companyLogo", locale)}
              <input accept="image/png,image/jpeg,image/webp" className="hidden" ref={logoInputRef} type="file" onChange={(event) => void chooseLogoFile(event)} />
              <span className="text-xs leading-5 text-muted-foreground">{tSettings("businessLogoUsageHelp", locale)}</span>
              <span className="text-xs leading-5 text-muted-foreground">{tSettings("logoSizeHelp", locale)}</span>
              <div className="flex flex-wrap gap-2">
                {/* Source markers: ui.confirm.logo ui.remove.logo */}
                {isStagedImageDirty(logoStage) ? (<>
                  <button className="settings-motion-save h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={isPending} type="button" onClick={confirmLogo}>{isPending ? tSettings("uploadingLogo", locale) : tSettings("confirm", locale)}</button>
                  <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={() => logoInputRef.current?.click()}>{tSettings("change", locale)}</button>
                  <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={cancelLogoDraft}>{tSettings("cancel", locale)}</button>
                </>) : (<>
                  <button className="h-10 rounded-md border border-border px-3 text-sm font-semibold disabled:opacity-60" disabled={isPending} type="button" onClick={() => logoInputRef.current?.click()}>{logoStage.saved ? tSettings("change", locale) : tSettings("chooseLogo", locale)}</button>
                  {logoStage.saved ? <button className="h-10 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger disabled:opacity-60" disabled={isPending} type="button" onClick={removeLogo}>{tSettings("remove", locale)}</button> : null}
                </>)}
              </div>
            </div>
          </div>
        </div>
      </div>
      {settingsConfirm === "removeLogo" ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSettingsConfirm(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={applyRemoveLogo}>{tSettings("remove", locale)}</button>
            </div>
          )}
          onClose={() => setSettingsConfirm(null)}
          size="sm"
          title={tSettings("remove", locale)}
        >
          <p className="text-sm text-muted-foreground">{tSettings("removeLogoConfirm", locale)}</p>
        </AppSmallModal>
      ) : null}
    </section>
  );
}
