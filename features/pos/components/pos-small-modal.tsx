"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { tPos } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

type PosSmallModalSize = "sm" | "md";

type PosSmallModalProps = {
  children: React.ReactNode;
  closeAriaLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  dataPrintMode?: string;
  description?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  /** Optional overlay class merge (e.g. nested `z-[70]` above workspace Favorites). Default remains z-50. */
  overlayClassName?: string;
  size: PosSmallModalSize;
  title: string;
};

export function PosSmallModal({
  children,
  closeAriaLabel,
  closeOnBackdrop = false,
  closeOnEscape = false,
  dataPrintMode,
  description,
  footer,
  onClose,
  overlayClassName,
  size,
  title,
}: PosSmallModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus the dialog shell once on mount. Do NOT depend on `onClose` — Mixed Payment
  // (and other parents) pass inline lambdas that change every keystroke and would steal
  // focus from amount inputs after each digit.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        // Capture + stopImmediate so nested Unit Selector closes without also dismissing
        // an underlying PosWorkspaceModal (Favorites) that listens on the same window.
        event.stopPropagation();
        event.stopImmediatePropagation();
        onCloseRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      previous?.focus();
    };
  }, [closeOnEscape]);

  return (
    <div
      className={cn("fixed inset-0 z-50 grid place-items-center p-4 bg-black/60", overlayClassName)}
      onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
    >
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl",
          size === "sm" ? "max-w-md" : "max-w-lg",
        )}
        data-print-mode={dataPrintMode}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" id={titleId}>{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground" id={descriptionId}>{description}</p>
            ) : null}
          </div>
          <button
            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:bg-primary/10 hover:text-foreground active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel ?? tPos("ui.close")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">{children}</div>
        {footer ? <div className="shrink-0 px-5 pb-5">{footer}</div> : null}
      </section>
    </div>
  );
}
