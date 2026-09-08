"use client";

import { X } from "lucide-react";

export function SettingsLargeDrawer({
  children,
  closeLabel,
  footer,
  onClose,
  title,
}: {
  children: React.ReactNode;
  closeLabel: string;
  footer?: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/60 lg:left-72">
      <section className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4 lg:px-8">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{title}</h2>
          </div>
          <button
            className="grid size-10 shrink-0 place-items-center rounded-md border border-border"
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5 lg:px-8">
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-6 py-4 lg:px-8">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
