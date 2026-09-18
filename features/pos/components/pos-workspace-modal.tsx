"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

import { tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

type PosWorkspaceModalProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  headerClassName?: string;
  onClose: () => void;
  title: string;
};

export function PosWorkspaceModal({ children, footer, headerActions, headerClassName, onClose, title }: PosWorkspaceModalProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
        role="dialog"
      >
        <header className={cn("flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 py-4", headerClassName)}>
          <h2 className="min-w-0 truncate text-xl font-semibold" id={titleId}>{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button className="grid size-10 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={onClose} aria-label={tPos("ui.close")}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </section>
    </div>
  );
}
