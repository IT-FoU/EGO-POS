"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

import { tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

type PosWorkspaceModalProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerActions?: React.ReactNode;
  headerClassName?: string;
  /** Optional Back control (e.g. More → Child). Omitted = no Back button (default). */
  onBack?: () => void;
  onClose: () => void;
  title: string;
};

/** Topmost workspace modal owns Escape so nested More → Child does not dismiss both at once. */
const workspaceEscapeStack: Array<() => void> = [];

export function PosWorkspaceModal({
  children,
  footer,
  headerActions,
  headerClassName,
  onBack,
  onClose,
  title,
}: PosWorkspaceModalProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const entry = () => onCloseRef.current();
    workspaceEscapeStack.push(entry);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (workspaceEscapeStack[workspaceEscapeStack.length - 1] !== entry) return;
      event.stopImmediatePropagation();
      entry();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      const index = workspaceEscapeStack.lastIndexOf(entry);
      if (index >= 0) workspaceEscapeStack.splice(index, 1);
    };
  }, []);

  return (
    <div className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"
        role="dialog"
      >
        <header className={cn("flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 py-4", headerClassName)}>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {onBack ? (
              <button
                className="grid size-10 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="pos-workspace-back"
                type="button"
                onClick={onBack}
                aria-label={tPos("ui.back")}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
            ) : null}
            <h2 className="min-w-0 truncate text-xl font-semibold" id={titleId}>{title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button className="grid size-10 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-primary active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" type="button" onClick={onClose} aria-label={tPos("ui.close")}>
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
