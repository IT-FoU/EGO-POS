"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type PosWorkspaceModalProps = {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  headerClassName?: string;
  onClose: () => void;
  title: string;
};

export function PosWorkspaceModal({ children, headerActions, headerClassName, onClose, title }: PosWorkspaceModalProps) {
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-[85dvh] max-h-[85dvh] w-[85vw] max-w-[1280px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl max-sm:h-[calc(100dvh-2rem)] max-sm:max-h-[calc(100dvh-2rem)] max-sm:w-[calc(100vw-2rem)]"
        role="dialog"
      >
        <header className={cn("flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 py-4", headerClassName)}>
          <h2 className="min-w-0 truncate text-xl font-semibold" id={titleId}>{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button className="grid size-10 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={onClose} aria-label="Close">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </section>
    </div>
  );
}
