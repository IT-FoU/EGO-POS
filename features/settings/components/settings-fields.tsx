"use client";

import type { ReactNode } from "react";
import { CheckCircle2, type LucideIcon } from "lucide-react";
import type { SupportedLocale } from "@/lib/constants";
import { tSettings } from "@/lib/i18n/settings-copy";

export function DialogActions({ locale, onCancel, onSave, saveLabel }: {
  locale: SupportedLocale;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button className="h-10 rounded-md border border-border px-4 text-sm font-semibold" type="button" onClick={onCancel}>{tSettings("cancel", locale)}</button>
      <button className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground" type="button" onClick={onSave}>
        <CheckCircle2 className="size-4" aria-hidden="true"/>
        {saveLabel}
      </button>
    </div>
  );
}

export function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
        <Icon aria-hidden="true"/>
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
  );
}

export function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}

export function Toggle({ checked, label, onChange }: {
  checked: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-sm font-medium">
      <span>{label}</span>
      <input checked={checked} className="size-4 accent-primary" type="checkbox" onChange={(event) => onChange(event.target.checked)}/>
    </label>
  );
}
