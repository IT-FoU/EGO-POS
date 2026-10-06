"use client";

import { useEffect, useState } from "react";
import { ImagePlus, MonitorPlay, Trash2 } from "lucide-react";
import { AppSmallModal } from "@/components/ui/app-small-modal";
import type { SupportedLocale } from "@/lib/constants";
import { localizeCustomerDisplayTemplateDescription, tSettings } from "@/lib/i18n/settings-copy";
import {
  DEFAULT_CUSTOMER_DISPLAY_SETTINGS,
  readCustomerDisplaySettingsFromStorage,
  resetAllCustomerDisplaySettings,
  writeCustomerDisplaySettingsToStorage,
  type CustomerDisplayMedia,
  type CustomerDisplaySettings,
  type CustomerDisplayTemplate,
} from "@/features/pos/customer-display-settings";
import { CUSTOMER_DISPLAY_TEMPLATE_OPTIONS } from "@/features/pos/customer-display-templates";
import { CUSTOMER_DISPLAY_QR_STYLE_OPTIONS, type CustomerDisplayQrStyle } from "@/features/pos/customer-display-qr-style";
import { Field, SectionTitle, Toggle } from "@/features/settings/components/settings-fields";

export function CustomerDisplaySettingsSection({
  locale,
  onNotify,
}: {
  locale: SupportedLocale;
  onNotify: (message: { tone: "error" | "success"; text: string } | null) => void;
}) {
  const [displaySettings, setDisplaySettings] = useState<CustomerDisplaySettings>(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
  useEffect(() => {
    setDisplaySettings(readCustomerDisplaySettingsFromStorage());
  }, []);
  const [promotionDraft, setPromotionDraft] = useState("");
  const [settingsConfirm, setSettingsConfirm] = useState<"resetAll" | null>(null);

  function persistCustomerDisplaySettings(nextSettings: CustomerDisplaySettings, notify = true) {
    setDisplaySettings(nextSettings);
    writeCustomerDisplaySettingsToStorage(nextSettings);
    if (notify) onNotify({ text: tSettings("savedOnThisDevice", locale), tone: "success" });
  }
  function updateDisplayTemplate(template: CustomerDisplayTemplate) {
    persistCustomerDisplaySettings({ ...displaySettings, template });
  }
  function updateDisplayQrStyle(qrDisplayStyle: CustomerDisplayQrStyle) {
    persistCustomerDisplaySettings({ ...displaySettings, qrDisplayStyle });
  }
  function updateDisplayVisibility(key: "showDiscountDetails" | "showPromotionInformation", value: boolean) {
    persistCustomerDisplaySettings({ ...displaySettings, [key]: value });
  }
  function resetAllDisplaySettings() {
    setSettingsConfirm("resetAll");
  }
  function applyResetAllDisplaySettings() {
    persistCustomerDisplaySettings(resetAllCustomerDisplaySettings(), false);
    onNotify({ text: tSettings("resetAllCustomerDisplaySuccess", locale), tone: "success" });
    setSettingsConfirm(null);
  }
  function updateDisplayAutoReturn(seconds: number) {
    persistCustomerDisplaySettings({ ...displaySettings, autoReturnSeconds: Math.max(1, seconds) });
  }
  function addPromotionMessage() {
    const messageText = promotionDraft.trim();
    if (!messageText) {
      onNotify({ text: tSettings("promotionMessageRequired", locale), tone: "error" });
      return;
    }
    persistCustomerDisplaySettings({
      ...displaySettings,
      promotionMessages: [...displaySettings.promotionMessages, messageText].slice(-8),
    });
    setPromotionDraft("");
  }
  function deletePromotionMessage(index: number) {
    persistCustomerDisplaySettings({
      ...displaySettings,
      promotionMessages: displaySettings.promotionMessages.filter((_, itemIndex) => itemIndex !== index),
    });
  }
  function updateDisplayMedia(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(file.type)) {
      onNotify({ text: tSettings("mediaTypeError", locale), tone: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const media: CustomerDisplayMedia = {
        id: `display-media-${Date.now()}`,
        name: file.name,
        type: file.type === "video/mp4" ? "video" : "image",
        url: reader.result,
      };
      persistCustomerDisplaySettings({
        ...displaySettings,
        media: [media, ...displaySettings.media].slice(0, 12),
      });
    };
    reader.readAsDataURL(file);
  }
  function deleteDisplayMedia(id: string) {
    persistCustomerDisplaySettings({
      ...displaySettings,
      media: displaySettings.media.filter((media) => media.id !== id),
    });
  }

  return (
    <>
      <section className="rounded-lg border border-border bg-card p-5">
        <SectionTitle icon={MonitorPlay} title={tSettings("customerDisplay", locale)} />
        <div className="mt-4 flex items-center gap-2">
          <span className="rounded-full border border-border bg-background px-2 py-1 text-xs font-semibold text-muted-foreground">{tSettings("scopeThisDevice", locale)}</span>
          <span className="text-sm text-muted-foreground">{tSettings("customerDisplayThisBrowser", locale)}</span>
        </div>
        <div className="mt-5 grid gap-5">
          <p className="text-xs leading-5 text-muted-foreground">{tSettings("adsInsideCustomerDisplayHelp", locale)}</p>
          <div>
            <div className="text-sm font-semibold">{tSettings("displayTemplate", locale)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {CUSTOMER_DISPLAY_TEMPLATE_OPTIONS.map((template) => (
                <button aria-pressed={displaySettings.template === template.id} className={displaySettings.template === template.id ? "settings-motion-tab rounded-md border border-primary bg-primary/10 p-3 text-left text-sm shadow-sm" : "settings-motion-tab rounded-md border border-border bg-background p-3 text-left text-sm"} key={template.id} type="button" onClick={() => updateDisplayTemplate(template.id)}>
                  <div className="font-semibold">{template.name}</div>
                  <div className="mt-2 text-xs leading-5 text-muted-foreground">{localizeCustomerDisplayTemplateDescription(template.id, template.description, locale)}</div>
                  <div className="mt-3 text-xs font-semibold text-primary">
                    {displaySettings.template === template.id ? tSettings("selected", locale) : tSettings("select", locale)}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle checked={displaySettings.showDiscountDetails !== false} label={tSettings("showDiscountDetails", locale)} onChange={(value) => updateDisplayVisibility("showDiscountDetails", value)} />
            <Toggle checked={displaySettings.showPromotionInformation !== false} label={tSettings("showPromotionInformation", locale)} onChange={(value) => updateDisplayVisibility("showPromotionInformation", value)} />
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">{tSettings("showDiscountDetailsHelp", locale)}</p>
            <p className="text-xs leading-5 text-muted-foreground md:col-span-2">{tSettings("showPromotionInformationHelp", locale)}</p>
          </div>
          <div>
            <div className="text-sm font-semibold">{tSettings("qr", locale)}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {CUSTOMER_DISPLAY_QR_STYLE_OPTIONS.map((option) => (
                <button aria-pressed={displaySettings.qrDisplayStyle === option.id} className={displaySettings.qrDisplayStyle === option.id ? "settings-motion-tab rounded-md border border-primary bg-primary/10 px-3 py-3 text-left text-sm font-semibold shadow-sm" : "settings-motion-tab rounded-md border border-border bg-background px-3 py-3 text-left text-sm font-semibold"} key={option.id} type="button" onClick={() => updateDisplayQrStyle(option.id)}>
                  {option.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div className="rounded-md border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <ImagePlus className="text-primary" aria-hidden="true" />
                <h3 className="font-semibold">{tSettings("advertisementMedia", locale)}</h3>
              </div>
              <label className="mt-3 block">
                <input accept="image/jpeg,image/png,image/webp,video/mp4" className="block w-full rounded-md border border-border bg-card px-3 py-3 text-sm" type="file" onChange={updateDisplayMedia} />
              </label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {displaySettings.media.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">{tSettings("noAdvertisementMedia", locale)}</div>
                ) : displaySettings.media.map((media) => (
                  <div className="overflow-hidden rounded-md border border-border bg-card" key={media.id}>
                    {media.type === "video" ? (
                      // eslint-disable-next-line jsx-a11y/media-has-caption
                      <video className="aspect-video w-full object-cover" src={media.url} muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="aspect-video w-full object-cover" src={media.url} alt={media.name} />
                    )}
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-xs font-semibold">{media.name}</span>
                      <button className="settings-motion-icon grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deleteDisplayMedia(media.id)} aria-label={tSettings("delete", locale)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 rounded-md border border-border bg-background p-4">
              <Field label={tSettings("autoReturnAds", locale)}>
                <input className="field-input" min="1" type="number" value={displaySettings.autoReturnSeconds} onChange={(event) => updateDisplayAutoReturn(Number(event.target.value))} />
              </Field>
              <Field label={tSettings("promotionMessage", locale)}>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <input className="field-input" value={promotionDraft} onChange={(event) => setPromotionDraft(event.target.value)} />
                  <button className="settings-motion-save h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={addPromotionMessage}>
                    {tSettings("add", locale)}
                  </button>
                </div>
              </Field>
              <div className="grid gap-2">
                {displaySettings.promotionMessages.map((promotion, index) => (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm" key={`${promotion}-${index}`}>
                    <span className="min-w-0 truncate">{promotion}</span>
                    <button className="settings-motion-icon grid size-8 shrink-0 place-items-center rounded-md border border-danger/40 text-danger" type="button" onClick={() => deletePromotionMessage(index)} aria-label={tSettings("delete", locale)}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-xs leading-5 text-primary">{tSettings("autoSwitchEnabled", locale)}</div>
            </div>
          </div>
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
            <div className="text-sm font-semibold">{tSettings("resetAllCustomerDisplay", locale)}</div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{tSettings("resetAllCustomerDisplayHelp", locale)}</p>
            <button className="mt-3 h-10 rounded-md border border-danger/40 px-3 text-sm font-semibold text-danger" type="button" onClick={resetAllDisplaySettings}>
              {tSettings("resetAllCustomerDisplay", locale)}
            </button>
          </div>
        </div>
      </section>
      {settingsConfirm === "resetAll" ? (
        <AppSmallModal
          closeAriaLabel={tSettings("closeModal", locale)}
          closeOnBackdrop={false}
          closeOnEscape={false}
          footer={(
            <div className="flex justify-end gap-2">
              <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={() => setSettingsConfirm(null)}>{tSettings("cancel", locale)}</button>
              <button className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white" type="button" onClick={applyResetAllDisplaySettings}>{tSettings("resetAllCustomerDisplay", locale)}</button>
            </div>
          )}
          onClose={() => setSettingsConfirm(null)}
          size="sm"
          title={tSettings("resetAllCustomerDisplay", locale)}
        >
          <p className="text-sm text-muted-foreground">{tSettings("resetAllCustomerDisplayConfirm", locale)}</p>
          <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{tSettings("resetAllCustomerDisplayHelp", locale)}</p>
        </AppSmallModal>
      ) : null}
    </>
  );
}
