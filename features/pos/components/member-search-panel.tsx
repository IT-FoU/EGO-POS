"use client";

import { useEffect, useRef, useState } from "react";

import { formatLak } from "@/features/pos/format";
import { fetchMemberSearch } from "@/features/pos/member-search-client";
import { MEMBER_SEARCH_DEBOUNCE_MS } from "@/features/pos/member-search-query";
import type { PosCustomer } from "@/features/pos/types";
import { fillPosCopy, tPos as t } from "@/lib/i18n/pos-copy";
import { cn } from "@/lib/utils";

export type MemberSearchPanelProps = {
  loyaltyEnabled?: boolean;
  maxRedeemPoints?: number;
  minRedeemPoints?: number;
  onClear: () => void;
  onRedeemPointsChange?: (value: number) => void;
  onSelect: (customer: PosCustomer) => void;
  redeemDiscountLak?: number;
  redeemPoints?: number;
  selected: PosCustomer | null;
  /**
   * When true, skip network (demo Mode). Parent may still select from an empty list.
   */
  demoMode?: boolean;
};

type SearchStatus = "idle" | "typing" | "loading" | "results" | "empty" | "error";

/**
 * Reusable Member Search panel.
 * More → Member Search and future Sale Options → Subscriber should share this + fetchMemberSearch.
 */
export function MemberSearchPanel({
  demoMode = false,
  loyaltyEnabled = false,
  maxRedeemPoints = 0,
  minRedeemPoints = 1,
  onClear,
  onRedeemPointsChange,
  onSelect,
  redeemDiscountLak = 0,
  redeemPoints = 0,
  selected,
}: MemberSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosCustomer[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      setStatus("idle");
      return;
    }

    if (demoMode) {
      setResults([]);
      setStatus("empty");
      return;
    }

    setStatus("typing");
    const seq = ++requestSeq.current;
    const timer = window.setTimeout(() => {
      setStatus("loading");
      void fetchMemberSearch({ search: trimmed })
        .then((page) => {
          if (seq !== requestSeq.current) return;
          setResults(page.results);
          setError(null);
          setStatus(page.results.length ? "results" : "empty");
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setResults([]);
          setError(err instanceof Error ? err.message : t("ui.unable.load.members"));
          setStatus("error");
        });
    }, MEMBER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [demoMode, query]);

  return (
    <div className="grid gap-3" data-testid="pos-member-search-panel">
      <input
        aria-label={t("ui.phone.name.or.member.no")}
        className="field-input h-11 text-sm"
        placeholder={t("ui.phone.name.or.member.no")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {status === "idle" ? (
        <p className="text-xs text-muted-foreground">{t("ui.member.search.idle")}</p>
      ) : null}
      {status === "typing" || status === "loading" ? (
        <p className="text-xs text-muted-foreground">{t("ui.member.search.loading")}</p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs text-danger">{error ?? t("ui.unable.load.members")}</p>
      ) : null}
      {status === "empty" ? (
        <p className="text-xs text-muted-foreground">{t("ui.no.customer.or.membership.found")}</p>
      ) : null}

      {status === "results" ? (
        <ul className="grid max-h-56 gap-2 overflow-y-auto" data-testid="pos-member-search-results">
          {results.map((member) => (
            <li key={member.id}>
              <button
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded-md border border-border bg-background px-3 py-2 text-left transition hover:border-primary hover:bg-primary/5",
                  selected?.id === member.id && "border-primary bg-primary/10",
                )}
                type="button"
                onClick={() => onSelect(member)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{member.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      member.membershipStatus === "Active"
                        ? "bg-success/10 text-success"
                        : "bg-danger/10 text-danger",
                    )}
                  >
                    {member.membershipStatus}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {[member.phone, member.membershipNumber || member.customerCode]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {t("ui.points")}: {member.pointsBalance}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <SelectedMemberCard
        customer={selected}
        loyaltyEnabled={loyaltyEnabled}
        maxRedeemPoints={maxRedeemPoints}
        minRedeemPoints={minRedeemPoints}
        redeemDiscountLak={redeemDiscountLak}
        redeemPoints={redeemPoints}
        onClear={onClear}
        onRedeemPointsChange={onRedeemPointsChange}
      />
    </div>
  );
}

function SelectedMemberCard({
  customer,
  loyaltyEnabled,
  maxRedeemPoints,
  minRedeemPoints,
  onClear,
  onRedeemPointsChange,
  redeemDiscountLak,
  redeemPoints,
}: {
  customer: PosCustomer | null;
  loyaltyEnabled: boolean;
  maxRedeemPoints: number;
  minRedeemPoints: number;
  onClear: () => void;
  onRedeemPointsChange?: (value: number) => void;
  redeemDiscountLak: number;
  redeemPoints: number;
}) {
  if (!customer) {
    return (
      <div className="rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
        {t("ui.guest.sale.search.for.member.pricing")}
      </div>
    );
  }

  const active = isMembershipActive(customer);
  return (
    <div className="rounded-md border border-border bg-background p-2 text-xs" data-testid="pos-selected-member">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{customer.name}</div>
          <div className="text-[11px] text-muted-foreground">{customer.phone}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              active ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
            )}
          >
            {customer.membershipStatus}
          </span>
          <button
            className="text-[11px] font-semibold text-danger underline-offset-2 hover:underline"
            type="button"
            onClick={onClear}
          >
            {t("ui.remove.member")}
          </button>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <div>
          <span className="text-muted-foreground">{t("ui.member.no")}: </span>
          {customer.membershipNumber || customer.customerCode || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">{t("ui.points")}: </span>
          {customer.pointsBalance}
        </div>
        <div>
          <span className="text-muted-foreground">{t("ui.type")}: </span>
          {customer.membershipType}
        </div>
        <div>
          <span className="text-muted-foreground">{t("ui.expiry")}: </span>
          {customer.membershipExpiry || "—"}
        </div>
      </div>
      {loyaltyEnabled && active && customer.pointsBalance >= minRedeemPoints ? (
        <div className="mt-2 space-y-1 rounded-md border border-border p-2">
          <label className="block text-[11px] font-semibold" htmlFor="redeem-points">
            {fillPosCopy(t("ui.redeem.points"), { min: minRedeemPoints, max: maxRedeemPoints })}
          </label>
          <input
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            id="redeem-points"
            max={maxRedeemPoints}
            min={0}
            onChange={(event) => onRedeemPointsChange?.(Math.max(0, Number(event.target.value) || 0))}
            type="number"
            value={redeemPoints}
          />
          {redeemDiscountLak > 0 ? (
            <div className="text-[11px] text-primary">
              {fillPosCopy(t("ui.redeem.discount"), { amount: formatLak(redeemDiscountLak) })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function isMembershipActive(customer: PosCustomer | null | undefined) {
  if (!customer || customer.membershipStatus !== "Active") return false;
  if (!customer.membershipExpiry) return true;
  const expiry = new Date(`${customer.membershipExpiry}T23:59:59`);
  return expiry.getTime() >= Date.now();
}
