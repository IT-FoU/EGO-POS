"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { t } from "@/lib/i18n/ui";
import type { QrBank } from "@/features/pos/types";
import {
  CUSTOMER_DISPLAY_QR_CATALOG_EVENT,
  CUSTOMER_DISPLAY_QR_EVENT,
  hideCustomerDisplayQr,
  readCustomerDisplayQrCatalog,
  readCustomerDisplayQrIntent,
  writeCustomerDisplayQrIntent,
} from "@/features/pos/customer-display-qr";

export function CustomerDisplayQrToggle() {
  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<QrBank[]>([]);
  const [intent, setIntent] = useState(readCustomerDisplayQrIntent);

  useEffect(() => {
    function refresh() {
      setBanks(readCustomerDisplayQrCatalog());
      setIntent(readCustomerDisplayQrIntent());
    }
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(CUSTOMER_DISPLAY_QR_EVENT, refresh);
    window.addEventListener(CUSTOMER_DISPLAY_QR_CATALOG_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CUSTOMER_DISPLAY_QR_EVENT, refresh);
      window.removeEventListener(CUSTOMER_DISPLAY_QR_CATALOG_EVENT, refresh);
    };
  }, []);

  function selectBank(bank: QrBank) {
    writeCustomerDisplayQrIntent({ bankId: bank.id, visible: true });
    setIntent({ bankId: bank.id, visible: true });
    setOpen(false);
  }

  function hideQr() {
    hideCustomerDisplayQr(intent.bankId);
    setIntent({ bankId: intent.bankId, visible: false });
    setOpen(false);
  }

  return (
    <div className="relative flex items-center">
      <button
        aria-expanded={open}
        aria-label={intent.visible ? t("ui.hide.qr") : t("ui.qr")}
        className={
          intent.visible
            ? "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-xs font-semibold text-primary"
            : "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:border-primary hover:text-foreground"
        }
        type="button"
        onClick={() => (intent.visible ? hideQr() : setOpen((current) => !current))}
      >
        <QrCode className="size-4" aria-hidden="true" />
        {intent.visible ? <span className="hidden sm:inline">{t("ui.hide.qr")}</span> : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-md border border-border bg-card p-2 shadow-lg">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t("ui.select.payment.qr")}</div>
          {banks.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("ui.no.customer.display.qr.configured")}</p>
          ) : (
            <div className="grid gap-1">
              {banks.map((bank) => (
                <button
                  className={
                    intent.bankId === bank.id && intent.visible
                      ? "rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-semibold"
                      : "rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-background"
                  }
                  key={bank.id}
                  type="button"
                  onClick={() => selectBank(bank)}
                >
                  <div>{bank.displayLabel || bank.bankName}</div>
                  <div className="text-xs text-muted-foreground">{bank.accountName}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
