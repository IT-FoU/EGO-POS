"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { tProducts } from "@/lib/i18n/products-copy";
import { useAppLocale } from "@/lib/i18n/use-app-locale";
import { cn } from "@/lib/utils";

type ProductSmallModalSize = "sm" | "md" | "xl";

type ProductSmallModalProps = {
  children: React.ReactNode;
  closeAriaLabel?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  description?: string;
  footer?: React.ReactNode;
  onClose: () => void;
  size: ProductSmallModalSize;
  title: string;
};

export function ProductSmallModal({
  children,
  closeAriaLabel,
  closeOnBackdrop = false,
  closeOnEscape = false,
  description,
  footer,
  onClose,
  size,
  title,
}: ProductSmallModalProps) {
  const locale = useAppLocale();
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && closeOnEscape) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [closeOnEscape, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl",
          size === "sm" ? "max-w-md" : size === "xl" ? "max-w-xl" : "max-w-lg",
        )}
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
            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground"
            type="button"
            onClick={onClose}
            aria-label={closeAriaLabel ?? tProducts("close", locale)}
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
