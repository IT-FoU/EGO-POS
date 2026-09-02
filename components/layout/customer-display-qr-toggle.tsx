"use client";

import { useEffect, useState } from "react";
import { Landmark, QrCode } from "lucide-react";
import { t } from "@/lib/i18n/ui";
import type { QrBank } from "@/features/pos/types";
import {
  CUSTOMER_DISPLAY_QR_CATALOG_EVENT,
  CUSTOMER_DISPLAY_QR_EVENT,
  hideCustomerDisplayQr,
  readCustomerDisplayQrCatalog,
  readCustomerDisplayQrIntent,
  writeCustomerDisplayQrCatalog,
  writeCustomerDisplayQrIntent,
} from "@/features/pos/customer-display-qr";
import { getCustomerDisplayQrCatalogAction } from "@/features/qr-payments/actions";

function bankInitials(bank: QrBank) {
  const source = (bank.displayLabel || bank.bankName || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "QR";
}

function BankIcon({ bank }: { bank: QrBank }) {
  if (bank.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-6 shrink-0 rounded-sm border border-border object-contain bg-white"
        data-cd-qr-icon="logo"
        src={bank.logoUrl}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="grid size-6 shrink-0 place-items-center rounded-sm border border-border bg-muted text-[10px] font-black"
      data-cd-qr-icon="initials"
    >
      {bankInitials(bank) || <Landmark className="size-3" />}
    </span>
  );
}

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
    void getCustomerDisplayQrCatalogAction().then((result) => {
      if (result.ok && Array.isArray(result.data)) {
        writeCustomerDisplayQrCatalog(result.data);
      }
      refresh();
    });
    window.addEventListener("storage", refresh);
    window.addEventListener(CUSTOMER_DISPLAY_QR_EVENT, refresh);
    window.addEventListener(CUSTOMER_DISPLAY_QR_CATALOG_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(CUSTOMER_DISPLAY_QR_EVENT, refresh);
      window.removeEventListener(CUSTOMER_DISPLAY_QR_CATALOG_EVENT, refresh);
    };
  }, []);

  const selected = banks.find((bank) => bank.id === intent.bankId);
  const buttonLabel = intent.visible
    ? selected?.displayLabel || selected?.bankName || t("ui.qr")
    : t("ui.show.qr");

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
        aria-label={buttonLabel}
        className={
          intent.visible
            ? "inline-flex h-10 max-w-[11rem] items-center justify-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-xs font-semibold text-primary"
            : "inline-flex h-10 items-center justify-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground"
        }
        data-cd-qr-toggle={intent.visible ? "active" : "idle"}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <QrCode className="size-4 shrink-0" aria-hidden="true" />
        <span className="hidden truncate sm:inline">{buttonLabel}</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-md border border-border bg-card p-2 shadow-lg" data-cd-qr-selector="open">
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">{t("ui.select.payment.qr")}</div>
          {banks.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("ui.no.customer.display.qr.configured")}</p>
          ) : (
            <div className="grid gap-1">
              {banks.map((bank) => (
                <button
                  className={
                    intent.bankId === bank.id && intent.visible
                      ? "flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-3 py-2 text-left text-sm font-semibold"
                      : "flex items-center gap-2 rounded-md border border-transparent px-3 py-2 text-left text-sm hover:bg-background"
                  }
                  data-cd-qr-option={intent.bankId === bank.id && intent.visible ? "current" : "available"}
                  key={bank.id}
                  type="button"
                  onClick={() => selectBank(bank)}
                >
                  <BankIcon bank={bank} />
                  <span className="min-w-0">
                    <div className="truncate">{bank.displayLabel || bank.bankName}</div>
                    <div className="truncate text-xs text-muted-foreground">{bank.accountName}</div>
                  </span>
                </button>
              ))}
            </div>
          )}
          {intent.visible ? (
            <button
              className="mt-2 w-full rounded-md border border-border px-3 py-2 text-left text-sm font-semibold hover:bg-background"
              data-cd-qr-hide="true"
              type="button"
              onClick={hideQr}
            >
              {t("ui.hide.qr")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
