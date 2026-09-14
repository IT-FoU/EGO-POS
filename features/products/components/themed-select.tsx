"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemedSelectOption = {
  label: string;
  value: string;
};

export function ThemedSelect({
  ariaLabel,
  className,
  disabled = false,
  emptyLabel,
  name,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
  name?: string;
  onChange: (value: string) => void;
  options: ThemedSelectOption[];
  placeholder: string;
  value: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value);
  const displayLabel = selected?.label || placeholder;
  const selectable = options;

  useEffect(() => {
    if (!open) return;
    const selectedIndex = selectable.findIndex((option) => option.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    queueMicrotask(() => listRef.current?.focus());

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, selectable, value]);

  function choose(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  function onListKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(selectable.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(selectable.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = selectable[activeIndex];
      if (option) choose(option.value);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div className={cn("relative min-w-0 flex-1", className)} ref={rootRef}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className={cn(
          "flex h-11 w-full min-w-0 items-center justify-between gap-2 bg-transparent px-3 text-left text-sm outline-none",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          !selected ? "text-muted-foreground" : "text-foreground",
        )}
        disabled={disabled}
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onButtonKeyDown}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-40 overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-lg outline-none"
          id={listId}
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onListKeyDown}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {selectable.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel || placeholder}</div>
            ) : (
              selectable.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <button
                    aria-selected={isSelected}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition",
                      isSelected
                        ? "bg-primary/20 font-semibold text-foreground"
                        : "text-foreground",
                      isActive && !isSelected ? "bg-muted/60" : null,
                      !isSelected && !isActive ? "hover:bg-muted/50" : null,
                    )}
                    key={option.value || `empty-${index}`}
                    role="option"
                    type="button"
                    onClick={() => choose(option.value)}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected ? <Check aria-hidden="true" className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
