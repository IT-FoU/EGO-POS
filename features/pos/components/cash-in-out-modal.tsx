"use client";

import { useMemo, useState } from "react";

import {
  NO_OPEN_CASH_SHIFT_MESSAGE,
  cashOutExceedsExpected,
  parseCashMovementAmountLak,
  previewExpectedCashAfter,
  type CashMovementType,
} from "@/features/pos/cash-movement";
import { formatLak } from "@/features/pos/format";
import { PosWorkspaceModal } from "@/features/pos/components/pos-workspace-modal";
import { t } from "@/lib/i18n/ui";
import { cn } from "@/lib/utils";

type CashInOutModalProps = {
  expectedCashLak: number;
  sessionOpen: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (input: { amountLak: number; reason: string; type: CashMovementType }) => Promise<void>;
};

export function CashInOutModal({
  expectedCashLak,
  onClose,
  onSubmit,
  sessionOpen,
  submitting,
}: CashInOutModalProps) {
  const [type, setType] = useState<CashMovementType>("cash_in");
  const [amountRaw, setAmountRaw] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parsed = parseCashMovementAmountLak(amountRaw);
  const previewAmount = parsed.ok ? parsed.amountLak : 0;
  const expectedAfter = useMemo(
    () => previewExpectedCashAfter(expectedCashLak, type, previewAmount),
    [expectedCashLak, previewAmount, type],
  );

  async function handleSubmit() {
    setError(null);
    if (!sessionOpen) {
      setError(NO_OPEN_CASH_SHIFT_MESSAGE);
      return;
    }
    if (!parsed.ok) {
      setError(t("ui.cash.amount.must.be.greater.than.zero"));
      return;
    }
    if (type === "cash_out" && !reason.trim()) {
      setError(t("ui.cash.out.reason.is.required.when.cash.out.am"));
      return;
    }
    if (type === "cash_out" && cashOutExceedsExpected(parsed.amountLak, expectedCashLak)) {
      setError(t("ui.cash.out.amount.cannot.exceed.expected.cas"));
      return;
    }
    try {
      await onSubmit({ amountLak: parsed.amountLak, reason: reason.trim(), type });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t("ui.cash.movement.failed"));
    }
  }

  return (
    <PosWorkspaceModal onClose={onClose} title={t("ui.cash.in.cash.out")}>
      <div className="mx-auto grid max-w-xl gap-4">
        {!sessionOpen ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {NO_OPEN_CASH_SHIFT_MESSAGE}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            className={cn(
              "h-11 rounded-md border px-3 text-sm font-semibold",
              type === "cash_in" ? "border-primary bg-primary/10 text-primary" : "border-border",
            )}
            disabled={submitting}
            type="button"
            onClick={() => setType("cash_in")}
          >
            {t("ui.cash.in")}
          </button>
          <button
            className={cn(
              "h-11 rounded-md border px-3 text-sm font-semibold",
              type === "cash_out" ? "border-danger bg-danger/10 text-danger" : "border-border",
            )}
            disabled={submitting}
            type="button"
            onClick={() => setType("cash_out")}
          >
            {t("ui.cash.out")}
          </button>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{t("ui.amount")}</span>
          <input
            className="field-input h-11 text-sm"
            disabled={submitting || !sessionOpen}
            inputMode="numeric"
            placeholder="0"
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">{t("ui.reason")}</span>
          <input
            className="field-input h-11 text-sm"
            disabled={submitting || !sessionOpen}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        <dl className="grid gap-2 rounded-md border border-border bg-background p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("ui.expected.cash")}</dt>
            <dd className="font-semibold">{formatLak(expectedCashLak)} LAK</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{type === "cash_in" ? t("ui.cash.in") : t("ui.cash.out")}</dt>
            <dd className={cn("font-black", type === "cash_out" ? "text-danger" : "text-primary")}>
              {type === "cash_in" ? "+" : "-"}
              {formatLak(previewAmount)} LAK
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("ui.expected.after")}</dt>
            <dd className="font-black">{formatLak(expectedAfter)} LAK</dd>
          </div>
        </dl>

        {error ? (
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="h-11 rounded-md border border-border px-3 text-sm font-semibold"
            disabled={submitting}
            type="button"
            onClick={onClose}
          >
            {t("ui.cancel")}
          </button>
          <button
            className={cn(
              "h-11 rounded-md px-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50",
              type === "cash_out" ? "bg-danger" : "bg-primary",
            )}
            disabled={submitting || !sessionOpen}
            type="button"
            onClick={() => void handleSubmit()}
          >
            {submitting
              ? t("ui.completing")
              : type === "cash_in"
                ? t("ui.record.cash.in")
                : t("ui.record.cash.out")}
          </button>
        </div>
      </div>
    </PosWorkspaceModal>
  );
}
