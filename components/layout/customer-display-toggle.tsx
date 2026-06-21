"use client";

import { t } from "@/lib/i18n/ui";
import { useRef } from "react";
import { Monitor } from "lucide-react";
export function CustomerDisplayToggle() {
    const displayWindow = useRef<Window | null>(null);
    function toggleCustomerDisplay() {
        if (displayWindow.current && !displayWindow.current.closed) {
            displayWindow.current.close();
            displayWindow.current = null;
            return;
        }
        displayWindow.current = window.open("/customer-display", "ego-pos-customer-display", t("ui.width.900.height.720"));
    }
    return (<button aria-label="Toggle customer display" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground" type="button" onClick={toggleCustomerDisplay}>
      <Monitor className="size-4" aria-hidden="true"/>
    </button>);
}
