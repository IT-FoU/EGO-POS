"use client";

import { tPos } from "@/lib/i18n/pos-copy";
import { t } from "@/lib/i18n/ui";
import { useState } from "react";
import { Maximize2, Monitor } from "lucide-react";
import {
  openCustomerDisplayPopup,
  placeCustomerDisplayWindow,
  requestCustomerDisplayFullscreen,
} from "@/features/pos/customer-display-window";

let customerDisplayWindow: Window | null = null;

export function CustomerDisplayToggle() {
  const [hint, setHint] = useState<string | null>(null);

  function openOrReuse() {
    if (customerDisplayWindow && !customerDisplayWindow.closed) {
      return customerDisplayWindow;
    }
    const popup = openCustomerDisplayPopup();
    customerDisplayWindow = popup;
    if (!popup) {
      setHint(t("ui.allow.window.management.to.open.customer.di"));
      return null;
    }
    return popup;
  }

  function openCustomerDisplay() {
    if (customerDisplayWindow && !customerDisplayWindow.closed) {
      customerDisplayWindow.close();
      customerDisplayWindow = null;
      setHint(null);
      return;
    }
    const popup = openOrReuse();
    if (!popup) {
      return;
    }

    void placeCustomerDisplayWindow(popup).then((result) => {
      setHint(result === "denied" ? t("ui.allow.window.management.to.open.customer.di") : null);
    });
  }

  async function openCustomerDisplayFullscreen() {
    const popup = openOrReuse();
    if (!popup) {
      return;
    }

    const placement = await placeCustomerDisplayWindow(popup);
    const fullscreen = await requestCustomerDisplayFullscreen(popup);
    if (fullscreen === "entered") {
      setHint(null);
      return;
    }
    setHint(
      placement === "denied"
        ? t("ui.allow.window.management.to.open.customer.di")
        : t("ui.customer.display.fullscreen.denied"),
    );
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        aria-label={tPos("ui.open.customer.display")}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        onClick={openCustomerDisplay}
        type="button"
      >
        <Monitor className="size-4" aria-hidden="true" />
      </button>
      <button
        aria-label={tPos("ui.fullscreen.customer.display")}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        onClick={() => void openCustomerDisplayFullscreen()}
        type="button"
      >
        <Maximize2 className="size-4" aria-hidden="true" />
      </button>
      {hint ? (
        <p className="absolute right-0 top-11 z-50 w-64 rounded-md border border-border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground shadow-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
